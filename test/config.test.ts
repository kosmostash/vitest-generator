import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { defineVitestConfig } from "../src/config";
import { loadSourceFolders } from "../src/project";

/**
 * The fixture is a real (small) KosmoJS project, and its harness has already
 * been derived by this repo's vitest.config.ts - so this exercises the same
 * path a project's own `vitest.config.ts` takes.
 */
const fixtureRoot = resolve(import.meta.dirname, "@fixtures/app");

const projects = async (...args: Parameters<typeof defineVitestConfig>) => {
  const config = await defineVitestConfig(...args);
  return (config.test?.projects || []) as Array<{
    test?: { name?: string; root?: string; include?: Array<string> };
    plugins?: Array<{ name: string }>;
  }>;
};

describe("loadSourceFolders", () => {
  test("reads every folder's config", async () => {
    const folders = await loadSourceFolders(fixtureRoot);

    expect(folders.map(({ name }) => name)).toEqual(["app"]);
    expect(folders[0]?.config.backend?.base).toBe("/api");
    expect(folders[0]?.root).toBe(fixtureRoot);
  });

  test("complains about a name that is not a source folder", async () => {
    await expect(loadSourceFolders(fixtureRoot, ["nope"])).rejects.toThrow(
      /does not contain a valid KosmoJS source folder/,
    );
  });
});

describe("defineVitestConfig", () => {
  test("derives one project per source folder", async () => {
    const [project, ...rest] = await projects({ root: fixtureRoot });

    expect(rest).toEqual([]);
    expect(project?.test?.name).toBe("app");
    expect(project?.test?.root).toBe(fixtureRoot);
    expect(project?.test?.include).toEqual([
      "src/app/**/*.{test,spec}.{ts,tsx}",
    ]);
  });

  test("wires the plugins the derived code needs", async () => {
    const [project] = await projects({ root: fixtureRoot });

    expect(project?.plugins?.map(({ name }) => name)).toEqual([
      // ours first: it owns the fetch transport specifier
      "kosmo-vitest:transport",
      "kosmo:tsconfigPaths",
      "kosmojs:node-prefix",
      "kosmo:virtualModules",
    ]);
  });

  test("takes an include pattern, with <folder> standing for the name", async () => {
    const [project] = await projects({
      root: fixtureRoot,
      include: ["test/<folder>/**/*.test.ts"],
    });

    expect(project?.test?.include).toEqual(["test/app/**/*.test.ts"]);
  });

  test("passes extra projects through", async () => {
    const found = await projects({
      root: fixtureRoot,
      projects: [{ test: { name: "db", include: ["db/**/*.test.ts"] } }],
    });

    expect(found.map((e) => e.test?.name)).toEqual(["app", "db"]);
  });

  test("says what to do when no folder runs the generator", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "kosmo-vitest-empty-"));

    try {
      await expect(defineVitestConfig({ root })).rejects.toThrow(
        /No source folder runs the vitest generator/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
