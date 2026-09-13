import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import scenarioSim from "../src/vite.js";

test("Vite loads TS configuration and aliases through its module graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "scenario-vite-"));
  const core = new URL("../src/index.ts", import.meta.url).pathname;
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await writeFile(join(root, "value.ts"), 'export const value: string = "alias loaded";');
    await writeFile(join(root, "config.ts"), 'import { defineConfig, defineScenario, route, json } from "sim-core"; import { value } from "@fixture/value"; export default defineConfig({scenarios:[defineScenario({name:"typed", routes:[route.get("/api/value",()=>json({value}))]})]});');
    server = await createServer({ root, configFile: false, mode: "simulator", resolve: { alias: { "sim-core": core, "@fixture/value": join(root, "value.ts") } }, server: { host: "127.0.0.1", port: 0 }, plugins: [scenarioSim({ configFile: "./config.ts" })] });
    await server.listen();
    const address = server.httpServer!.address() as {port:number};
    const fetchNative = (globalThis as unknown as {__nativeFetch:typeof fetch}).__nativeFetch;
    const response = await fetchNative("http://127.0.0.1:" + address.port + "/api/value");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ value: "alias loaded" });
  } finally {
    await server?.close();
    await rm(root, {recursive:true, force:true});
  }
});

