/** Route definitions are the type source; no parallel endpoint interface. */
import { defineScenario, type ScenarioDefinition } from "./core/scenario.js";
import { json, type Route, type JsonResponse, type PathContext } from "./core/router.js";
import type { SimulatorOptions } from "./core/engine.js";

type Catalogue = Record<string, Route>;
type Result<R extends Route> = Awaited<ReturnType<R["handler"]>>;
type Body<R extends Route> = Result<R> extends JsonResponse<infer T> ? T : never;
type Reply<R extends Route> = (ctx: PathContext<R["path"]>) => Result<R> | Promise<Result<R>>;

/** Identity helper preserving literal keys, path parameters and response types. */
export function defineRoutes<const T extends Catalogue>(routes: T): T { return routes; }

/** Build scenarios by replacing named routes, with the original response contract. */
export function createScenarioBuilder<const T extends Catalogue>(routes: T) {
  return {
    routes,
    respond<K extends keyof T>(key: K, body: Body<T[K]>, init?: ResponseInit): T[K] {
      return { ...routes[key], handler: () => json(body, init) } as T[K];
    },
    handle<K extends keyof T>(key: K, handler: Reply<T[K]>): T[K] {
      return { ...routes[key], handler } as T[K];
    },
    scenario(def: Omit<ScenarioDefinition, "routes"> & { routes?: Partial<{ [K in keyof T]: T[K] }> }): ScenarioDefinition {
      const { routes: replacements, ...rest } = def;
      for (const key of Object.keys(replacements ?? {})) {
        if (!(key in routes)) throw new Error(`unknown route ${key}`);
      }
      return defineScenario({ ...rest, routes: Object.entries(routes).map(([key, route]) => replacements?.[key] ?? route) });
    },
  };
}

/** Programmatic or default-exported file configuration, usable by every adapter. */
export function defineConfig<const T extends SimulatorOptions>(config: T): T { return config; }
