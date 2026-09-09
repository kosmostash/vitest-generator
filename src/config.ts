import type { Plugin } from "vite";
import type { ViteUserConfig } from "vitest/config";

import { pathExists, pathResolver, vitePlugins } from "@kosmojs/lib";

import { loadSourceFolders } from "./project.ts";

type TestOptions = NonNullable<ViteUserConfig["test"]>;

export type VitestConfigOptions = {
  /** The project root - where package.json and `src/` live. Default: `process.cwd()`. */
  root?: string;

  /** Limit the run to these source folders. Default: every folder that has the generator. */
  folders?: Array<string>;

  /**
   * Where a folder's tests live, relative to the project root.
   * `<folder>` is replaced with the source folder's name.
   *
   * @default ["src/<folder>/**\/*.{test,spec}.{ts,tsx}"]
   * */
  include?: Array<string>;

  /** Merged into every derived project's `test` block. */
  test?: Omit<TestOptions, "projects" | "name">;

  /** Extra vitest projects, for tests that belong to no source folder. */
  projects?: NonNullable<TestOptions["projects"]>;
};

/** `meta.name` of the generator, as it appears in a folder's generator list. */
export const GENERATOR_NAME = "Vitest";

const DEFAULT_INCLUDE = ["src/<folder>/**/*.{test,spec}.{ts,tsx}"];

/**
 * Points `virtual:kosmo/fetch-transport` at the harness transport.
 *
 * That single swap is what makes the derived fetch clients dispatch into the
 * api app instead of the network - the clients themselves are untouched, which
 * is the point: tests exercise the same modules the pages use.
 *
 * Declared before `kosmo:virtualModules` so it resolves the specifier first.
 * */
const testTransport = (file: string): Plugin => {
  const specifier = "virtual:kosmo/fetch-transport";

  return {
    name: "kosmo-vitest:transport",
    enforce: "pre",
    resolveId(source) {
      return source === specifier ? file : undefined;
    },
  };
};

/**
 * A vitest config with one project per source folder, each wired to that
 * folder's derived code, its `@/` `~/` `_/` imports and its api app.
 *
 * ```ts
 * // vitest.config.ts
 * import { defineVitestConfig } from "@kosmojs/vitest-generator/config";
 *
 * export default defineVitestConfig();
 * ```
 * */
export const defineVitestConfig = async (
  options: VitestConfigOptions = {},
): Promise<ViteUserConfig> => {
  const root = options.root || process.cwd();

  const sourceFolders = await loadSourceFolders(root, options.folders);

  const projects: NonNullable<TestOptions["projects"]> = [];

  for (const sourceFolder of sourceFolders) {
    const { generators } = sourceFolder.config;

    if (!generators.some((e) => e.meta.name === GENERATOR_NAME)) {
      continue;
    }

    const { createPath } = pathResolver(sourceFolder);
    const transportFile = createPath.lib("test/transport.ts");

    if (!(await pathExists(transportFile))) {
      throw new Error(
        [
          `${sourceFolder.name}: the test harness has not been derived yet.`,
          "Run the dev server or a build once, then run the tests again.",
        ].join(" "),
      );
    }

    projects.push({
      plugins: [
        testTransport(transportFile),
        vitePlugins.tsconfigPaths(sourceFolder),
        vitePlugins.nodePrefix(),
        vitePlugins.virtualModules(sourceFolder, {
          // the api app itself, and the server side of every env-sensitive module
          kind: "ssr",
          // `serve`, not `build`: tests want the development validation policy,
          // where a declared response is validated rather than trusted
          command: "serve",
        }),
      ],
      resolve: {
        conditions: ["node"],
      },
      test: {
        environment: "node",
        ...options.test,
        name: sourceFolder.name,
        root,
        include: (options.include || DEFAULT_INCLUDE).map((pattern) => {
          return pattern.replaceAll("<folder>", sourceFolder.name);
        }),
      },
    });
  }

  if (!projects.length && !options.projects?.length) {
    throw new Error(
      [
        "No source folder runs the vitest generator.",
        "Add it to a folder's kosmo.config.ts:",
        "generators: [...config.generators, vitestGenerator()]",
      ].join(" "),
    );
  }

  return {
    test: {
      projects: [...projects, ...(options.projects || [])],
    },
  };
};

export default defineVitestConfig;
