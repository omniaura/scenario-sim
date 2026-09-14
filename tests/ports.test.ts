import { test, expect } from "bun:test";
import { withPortFallback } from "../src/ports";
import { serveSimulator } from "../src/server";
import { Simulator } from "../src/core/engine";
import { defineScenario } from "../src/core/scenario";

const sim = () => new Simulator({ scenarios: [defineScenario({ name: "test", routes: [] })] });
const nativeFetch = (globalThis as unknown as { __nativeFetch?: typeof fetch }).__nativeFetch ?? fetch;
test("retry only occupied ports; explicit ports and other errors stay strict", async () => {
  const calls: number[] = [];
  const occupied = Object.assign(new Error("busy"), { code: "EADDRINUSE" });
  expect(await withPortFallback(async (port) => { calls.push(port); if (calls.length < 3) throw occupied; return port; }, { port: 4100, strictPort: false })).toBe(4102);
  expect(calls).toEqual([4100, 4101, 4102]);
  await expect(withPortFallback(async () => { throw occupied; }, { port: 4100 })).rejects.toBe(occupied);
  const denied = Object.assign(new Error("denied"), { code: "EACCES" });
  await expect(withPortFallback(async () => { throw denied; }, { port: 4100, strictPort: false })).rejects.toBe(denied);
});
test("bounded attempts and invalid ports", async () => {
  let calls = 0;
  await expect(withPortFallback(async () => { calls++; throw Object.assign(new Error("busy"), { code: "EADDRINUSE" }); }, { port: 4100, strictPort: false, maxAttempts: 2 })).rejects.toThrow("busy");
  expect(calls).toBe(2);
  for (const port of [-1, NaN, 65536, 2.5]) await expect(withPortFallback(async () => 1, { port })).rejects.toThrow("Invalid port");
});
test("real bind collision, strict rejection and concurrent ownership", async () => {
  const first = await serveSimulator(sim());
  const running = [first];
  try {
    await expect(serveSimulator(sim(), { port: first.port })).rejects.toThrow();
    const siblings = await Promise.all([0, 1].map(() => serveSimulator(sim(), { port: first.port, strictPort: false })));
    running.push(...siblings);
    expect(new Set(running.map((s) => s.port)).size).toBe(3);
    for (const server of running) expect((await nativeFetch(server.controlUrl + "/scenarios")).ok).toBe(true);
  } finally { await Promise.all(running.map((s) => s.close())); }
});
