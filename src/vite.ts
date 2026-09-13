/**
 * @omniaura/scenario-sim/vite — serve a Simulator from the Vite dev server so
 * the app and its mock share one origin (no CORS, one port, WebSocket
 * upgrades included).
 *
 *   import scenarioSim from "@omniaura/scenario-sim/vite";
 *   plugins: [scenarioSim({ scenarios: () => import("./scenarios"), match: (p) => p.startsWith("/api/") })]
 */

import type { Plugin, ViteDevServer } from "vite";
import type { Server as HttpServer } from "node:http";
import { Simulator, type SimulatorOptions } from "./core/engine.js";
import type { ScenarioDefinition } from "./core/scenario.js";
import { attachWebSockets, sendWebResponse, toWebRequest } from "./server.js";
import { generateScenarios, type GenerateOptions } from "./codegen.js";
import { resolve } from "node:path";

export interface ScenarioSimVitePluginOptions extends Omit<SimulatorOptions, "scenarios"> {
  /** Scenario definitions, or a loader (lets you import scenario files lazily). */
  scenarios?: ScenarioDefinition[] | (() => Promise<ScenarioDefinition[] | { default: ScenarioDefinition[] } | { scenarios: ScenarioDefinition[] }>);
  /** Loaded through Vite's module graph (TS, aliases and imports supported). */
  configFile?: string;
  generate?: GenerateOptions;
  /** Which paths the simulator owns (default: `/api/` prefix and the control path). */
  match?: (pathname: string) => boolean;
  /** Only in `--mode simulator` / when VITE_SIMULATOR=true (default true). */
  onlyInSimulatorMode?: boolean;
}

export default function scenarioSim(options: ScenarioSimVitePluginOptions): Plugin {
  let sim: Simulator | null = null;
  const controlPath = (options.controlPath ?? "/__sim").replace(/\/$/, "");
  const match = options.match ?? ((p: string) => p.startsWith("/api/"));
  const owns = (p: string) => match(p) || p === controlPath || p.startsWith(`${controlPath}/`);
  let enabled = true;

  return {
    name: "scenario-sim",
    apply: "serve",
    async buildStart() {
      if (enabled && options.generate) await generateScenarios(options.generate);
    },
    configResolved(config) {
      const only = options.onlyInSimulatorMode ?? true;
      enabled = !only || config.mode === "simulator" || process.env.VITE_SIMULATOR === "true";
    },
    async configureServer(server: ViteDevServer) {
      if (!enabled) return;
      const create = async () => {
        if (options.generate) await generateScenarios(options.generate);
        const config = options.configFile ? (await server.ssrLoadModule(resolve(server.config.root, options.configFile))).default as SimulatorOptions : undefined;
        const loaded = typeof options.scenarios === "function" ? await options.scenarios() : options.scenarios;
        const scenarios = config?.scenarios ?? (Array.isArray(loaded) ? loaded : loaded && ("default" in loaded ? loaded.default : loaded.scenarios));
        if (!scenarios?.length) throw new Error("scenario-sim needs scenarios or a configFile exporting defineConfig({ scenarios })");
        const next = new Simulator({ ...options, ...config, scenarios, controlPath, log: options.log ?? ((l) => server.config.logger.info(`  ${l}`)) });
        sim?.dispose();
        sim = next;
        return scenarios;
      };
      const scenarios = await create();
      const base = () => {
        const addr = server.httpServer?.address();
        const port = typeof addr === "object" && addr ? addr.port : (server.config.server.port ?? 5173);
        return `http://localhost:${port}`;
      };
      if (server.httpServer && sim) attachWebSockets(sim, server.httpServer as HttpServer, { base, match: owns });
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? "/", base()).pathname;
        if (!sim || !owns(pathname)) return next();
        void sim.handle(toWebRequest(req, base())).then((response) => sendWebResponse(res, response));
      });
      server.httpServer?.once("listening", () => server.config.logger.info(`  ▣ scenario-sim: ${base()}${controlPath}/status  (scenarios: ${scenarios.map((s) => s.name).join(", ")})`));
      server.httpServer?.once("close", () => sim?.dispose());
    },
  };
}
