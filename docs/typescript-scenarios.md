# Typed scenarios and file discovery

Route definitions are the type source. `defineRoutes` preserves route names, path parameters and JSON response types; `createScenarioBuilder(routes)` derives checked scenario overrides without a parallel handwritten interface.

```ts
import { route, json, defineRoutes, createScenarioBuilder, defineConfig } from "@omniaura/scenario-sim";
const routes = defineRoutes({
  note: route.get("/api/notes/:id", ({ params }) => json({ id: params.id, title: "A note" })),
});
const scenario = createScenarioBuilder(routes);
export default defineConfig({ scenarios: [
  scenario.scenario({ name: "happy" }),
  scenario.scenario({ name: "changed", routes: {
    note: scenario.respond("note", { id: "1", title: "Changed" }),
  } }),
] });
```

Unknown names and incompatible JSON bodies fail TypeScript checking. `scenario.handle(name, handler)` preserves the original response contract. Plain Response handlers remain supported, but their body is opaque: use `handle` instead of `respond`. Deliberately invalid payloads belong in the existing fault/override API. Request body validation remains the handler responsibility.

## File configuration

Default-export routes from `*.route.ts` and scenarios from `*.scenario.ts`. Run `scenario-sim generate ./scenarios` to write `routes.gen.ts` (catalogue and builder) and `scenarios.gen.ts` (array). Keys are relative route filenames without `.route.ts`. Scenario files import the generated builder; config files import the generated array. Use `--out <directory>` to choose a different output directory.

As with TanStack Router, generated code contains static imports with inferred types. Discovery does not evaluate modules. Commit generated files and regenerate after adding/removing files. Vite, TypeScript, and in-browser adapters see the same module graph.

```ts
scenarioSim({
  configFile: "./scenarios/config.ts",
  generate: { directory: "./scenarios" },
})
```

Vite loads the config with its module loader, supporting TypeScript and configured aliases. Generation runs on startup; restart after changing definitions. Existing arrays and async loaders remain supported. Bun can run `scenario-sim serve ./scenarios/config.ts`; Node requires supported TypeScript syntax or compiled JavaScript. `defineConfig` preserves all engine options when serving through the CLI.

## Compatibility

`requestLatency: "replace"` makes the latency header or cookie replace scenario latency, including zero. Default behavior remains additive. Fault headers and cookies apply only to that request. Response sequences use per-route, per-run call counts, so new and reset runs begin at the first response.

