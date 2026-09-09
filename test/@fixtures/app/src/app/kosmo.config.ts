import type { GeneratorSignature } from "@kosmojs/core";

// the built package, as a project would import it by name
import vitestGenerator from "../../../../../pkg/index.js";

/**
 * A source folder config as `defineConfig` would produce one, minus the real
 * backend and fetch generators: the harness only asks the generator list what
 * slots are filled, and declaring them here keeps the fixture free of the
 * whole framework.
 */

const backendGenerator: GeneratorSignature = {
  meta: { name: "Hono", slot: "backend" },
  factory: () => ({
    virtualModules: () => [
      {
        specifier: "virtual:kosmo/backend-app",
        csr: "export default undefined;",
        ssr: `export { default } from "@/src/app/api/app.ts";`,
      },
    ],
  }),
};

const fetchGenerator: GeneratorSignature = {
  meta: { name: "Fetch", slot: "fetch" },
  factory: () => ({}),
};

export default {
  backend: {
    stack: "hono" as const,
    base: "/api",
  },
  generators: [backendGenerator, fetchGenerator, vitestGenerator()],
};
