import { defineGenerator } from "@kosmojs/lib";

import factory from "./factory.ts";
import type { VitestGeneratorOptions } from "./types.ts";

export type { VitestGeneratorOptions, TestTemplateContext } from "./types.ts";
export { TEST_FILE } from "./factory.ts";

/**
 * Derives a test harness for a source folder's api.
 *
 * KosmoJS already knows how to reach your routes without a network - that is
 * how the isomorphic fetch client renders pages on the server. This generator
 * points the same machinery at vitest: `_/test` hands you the typed clients,
 * dispatching in process, plus the few helpers typed clients deliberately lack.
 *
 * ```ts
 * // src/<folder>/kosmo.config.ts
 * import { defineConfig } from "@kosmojs/dev";
 * import vitestGenerator from "@kosmojs/vitest-generator";
 *
 * const config = defineConfig({
 *   backend: { stack: "hono", base: "/api" },
 *   validation: true,
 * });
 *
 * export default {
 *   ...config,
 *   generators: [...config.generators, vitestGenerator()],
 * };
 * ```
 * */
export default defineGenerator<VitestGeneratorOptions>({
  meta: {
    name: "Vitest",
  },
  dependencies: {
    // the Koa dispatch path; unused on Hono and H3, which expose `app.fetch`
    "light-my-request": "^6.6.0",
  },
  devDependencies: {
    vitest: "^3.0.0",
  },
  factory,
});
