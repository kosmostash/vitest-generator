import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

import vitestGenerator from "./pkg/index.js";
import { defineVitestConfig } from "./src/config.ts";
import { loadSourceFolders } from "./src/project.ts";
import { templates } from "./vite.config.ts";

/**
 * Two kinds of tests:
 *
 * - `unit` runs against `src/`, with the template plugin the build uses.
 * - the fixture project is the generator's own output, running the way a real
 *   project's tests run - derived here first, then handed to the very config
 *   helper the package ships.
 * */

const fixtureRoot = resolve(import.meta.dirname, "test/@fixtures/app");

const [fixtureFolder] = await loadSourceFolders(fixtureRoot);

if (!fixtureFolder) {
  throw new Error(`No source folder found in ${fixtureRoot}`);
}

await vitestGenerator({ config: false }).factory(fixtureFolder).start?.();

const fixtureConfig = await defineVitestConfig({ root: fixtureRoot });

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [templates()],
        test: {
          name: "unit",
          root: import.meta.dirname,
          include: ["test/*.test.ts"],
          environment: "node",
        },
      },
      ...(fixtureConfig.test?.projects || []),
    ],
  },
});
