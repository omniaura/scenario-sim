import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateScenarios } from "../src/codegen.js";

test("codegen emits importable route-derived builders and discovers removals", async () => {
  const root = await mkdtemp(join(tmpdir(), "scenario-codegen-"));
  const source = new URL("../src/index.ts", import.meta.url).href;
  try {
    await writeFile(join(root, "note.route.ts"), 'import { route, json } from ' + JSON.stringify(source) + '; export default route.get("/notes/:id", ({params}) => json({id:params.id, title:"a"}));');
    await writeFile(join(root, "happy.scenario.ts"), 'import { scenario } from "./routes.gen.ts"; export default scenario.scenario({name:"happy"});');
    expect(await generateScenarios({ directory: root, packageName: source })).toMatchObject({ routes: 1, scenarios: 1 });
    expect(await readFile(join(root, "routes.gen.ts"), "utf8")).toContain('"note": item0');
    const loaded = await import(join(root, "scenarios.gen.ts"));
    expect(loaded.scenarios[0].routes[0].path).toBe("/notes/:id");
    await rm(join(root, "note.route.ts"));
    expect(await generateScenarios({ directory: root, packageName: source })).toMatchObject({ routes: 0 });
    expect(await readFile(join(root, "routes.gen.ts"), "utf8")).not.toContain("note.route");
  } finally { await rm(root, { recursive: true, force: true }); }
});

