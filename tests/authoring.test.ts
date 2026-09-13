import { expect, test } from "bun:test";
import { NativeRequest } from "./setup.js";
import { createScenarioBuilder, defineConfig, defineRoutes, defineScenario, json, route, sequence, Simulator } from "../src/index.js";

const routes = defineRoutes({
  read: route.get("/api/notes/:id", ({ params }) => {
    // @ts-expect-error params are derived from the route path
    params.missing;
    return json({ id: params.id, title: "hello" });
  }),
});
const builder = createScenarioBuilder(routes);
// Compile-time negative controls: these must remain type errors.
if (false) {
  // @ts-expect-error unknown route
  builder.respond("missing", {});
  // @ts-expect-error response shape comes from the original handler
  builder.respond("read", { id: "a", title: 42 });
  // @ts-expect-error unknown replacement key
  builder.scenario({ name: "bad", routes: { missing: routes.read } });
  // @ts-expect-error replacement handler must keep response type
  builder.handle("read", () => json({ wrong: true }));
}

test("route-derived scenario overrides run through the normal engine", async () => {
  const scenario = builder.scenario({ name: "alternate", routes: { read: builder.respond("read", { id: "a", title: "alternate" }) } });
  const sim = new Simulator(defineConfig({ scenarios: [scenario] }));
  try {
    expect(await (await sim.handle(new Request("http://sim/api/notes/a"))).json()).toEqual({ id: "a", title: "alternate" });
  } finally { sim.dispose(); }
});

test("response sequences are isolated across runs and reset", async () => {
  const sim = new Simulator({ scenarios: [defineScenario({ name: "sequence", routes: [route.get("/api/sequence", sequence([json({ n: 1 }), json({ n: 2 })]))] })] });
  const read = async (run: string) => (await sim.handle(new Request("http://sim/api/sequence", { headers: { "x-sim-run": run } }))).json();
  try {
    expect(await read("a")).toEqual({ n: 1 });
    expect(await read("a")).toEqual({ n: 2 });
    expect(await read("b")).toEqual({ n: 1 });
    await sim.api.reset("a");
    expect(await read("a")).toEqual({ n: 1 });
  } finally { sim.dispose(); }
});

test("header and cookie latency replace defaults, including zero; faults stay per request", async () => {
  const sim = new Simulator({ requestLatency: "replace", scenarios: [defineScenario({ name: "slow", clock: { mode: "manual" }, faults: { latencyMs: 1500, failMode: "all" }, routes: [route.get("/api/notes", () => json({ ok: true }))] })] });
  try {
    const first = await sim.handle(new Request("http://sim/api/notes", { headers: { "x-sim-latency": "0", "x-sim-fail": "off" } }));
    expect(first.status).toBe(200);
    const second = await sim.handle(new NativeRequest("http://sim/api/notes", { headers: { cookie: "sim_latency=0; sim_fail=off" } }));
    expect(second.status).toBe(200);
    expect(sim.getRun()!.faults.latencyMs).toBe(1500);
    expect(sim.getRun()!.faults.failMode).toBe("all");
    expect(sim.getRun()!.clock.pending()).toHaveLength(0);
  } finally { sim.dispose(); }
});
