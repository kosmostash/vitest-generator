import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type {
  ApiRoute,
  GeneratorSignature,
  ResolvedEntry,
  SourceFolder,
} from "@kosmojs/core";
import { pathExists } from "@kosmojs/lib";

import factory from "../src/factory";
import type { VitestGeneratorOptions } from "../src/types";

const generator = (slot: "backend" | "fetch"): GeneratorSignature => ({
  meta: { name: slot, slot },
  factory: () => ({}),
});

const apiRoute = (name: string, overrides: Partial<ApiRoute> = {}): ApiRoute =>
  ({
    id: name.replaceAll(/\W/g, "_"),
    name,
    folder: "api",
    file: `${name}/index.ts`,
    fileFullpath: `/nowhere/${name}/index.ts`,
    pathTokens: [],
    pathPattern: `/${name}`,
    honoPattern: `/${name}`,
    h3Pattern: `/${name}`,
    params: { id: "P", schema: [], resolvedType: undefined },
    optionalParams: false,
    methods: ["GET"],
    typeDeclarations: [],
    validationDefinitions: [],
    referencedFiles: [],
    ...overrides,
  }) as ApiRoute;

const entries = (...routes: Array<ApiRoute>): Array<ResolvedEntry> =>
  routes.map((entry) => ({ kind: "apiRoute", entry }));

describe("the generator", () => {
  let root: string;

  const sourceFolder = (
    slots: Array<"backend" | "fetch"> = ["backend", "fetch"],
  ): SourceFolder => ({
    name: "app",
    root,
    distDir: "dist",
    config: {
      backend: { stack: "hono", base: "/api" },
      generators: slots.map(generator),
    },
  });

  const run = async (
    folder: SourceFolder,
    options?: VitestGeneratorOptions,
    resolved: Array<ResolvedEntry> = [],
  ) => {
    const instance = factory(folder, options);
    await instance.start?.();
    await instance.build?.(resolved);
  };

  const read = (...path: Array<string>) => {
    return readFile(resolve(root, ...path), "utf8");
  };

  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), "kosmo-vitest-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("harness", () => {
    test("derives the three harness modules", async () => {
      await run(sourceFolder());

      for (const file of ["context.ts", "transport.ts", "index.ts"]) {
        expect(await pathExists(resolve(root, "lib/app/test", file))).toBe(true);
      }
    });

    test("bakes the folder's api base into it", async () => {
      await run({
        ...sourceFolder(),
        config: {
          backend: { stack: "hono", base: "/admin/api" },
          generators: [generator("backend")],
        },
      });

      expect(await read("lib/app/test/index.ts")).toContain(
        `export const base = "/admin/api";`,
      );
    });

    test("exports the typed clients when the folder derives them", async () => {
      await run(sourceFolder(["backend", "fetch"]));

      const harness = await read("lib/app/test/index.ts");

      expect(harness).toContain(`import fetchClients from "@/lib/app/fetch"`);
      expect(harness).toContain("export const api = fetchClients;");
    });

    test("leaves them out when the folder has no fetch generator", async () => {
      await run(sourceFolder(["backend"]));

      const harness = await read("lib/app/test/index.ts");

      expect(harness).not.toContain("fetchClients");
      expect(harness).not.toContain("export const api");
      // the untyped half is always there
      expect(harness).toContain("export const request");
    });

    test("writes nothing for a folder with no backend", async () => {
      await run({
        ...sourceFolder(),
        config: { generators: [generator("fetch")] },
      });

      expect(await pathExists(resolve(root, "lib/app/test"))).toBe(false);
    });
  });

  describe("root config", () => {
    test("is deployed once", async () => {
      await run(sourceFolder());

      expect(await read("vitest.config.ts")).toContain("defineVitestConfig");
    });

    test("never overwrites an existing one", async () => {
      await writeFile(resolve(root, "vitest.config.ts"), "// mine\n");
      await run(sourceFolder());

      expect(await read("vitest.config.ts")).toBe("// mine\n");
    });

    test("is skipped when asked", async () => {
      await run(sourceFolder(), { config: false });

      expect(await pathExists(resolve(root, "vitest.config.ts"))).toBe(false);
    });
  });

  describe("test files", () => {
    const testFile = "src/app/api/todos/index.test.ts";

    /** the route folder as the framework would have created it */
    const writeTestFile = async (content: string) => {
      await mkdir(dirname(resolve(root, testFile)), { recursive: true });
      await writeFile(resolve(root, testFile), content);
    };

    test("are not created unless asked for", async () => {
      await run(sourceFolder(), undefined, entries(apiRoute("todos")));

      expect(await pathExists(resolve(root, testFile))).toBe(false);
    });

    test("a blank one is filled in", async () => {
      await writeTestFile("   \n");

      await run(sourceFolder(), undefined, entries(apiRoute("todos")));

      const seeded = await read(testFile);

      expect(seeded).toContain(`describe("todos"`);
      expect(seeded).toContain(`const client = api["todos"];`);
      expect(seeded).toContain(`test.todo("GET");`);
      // no params, no payload - the client takes no arguments
      expect(seeded).toContain("await client.GET();");
    });

    test("one with content in it is left alone", async () => {
      await writeTestFile("// written by hand\n");

      await run(sourceFolder(), undefined, entries(apiRoute("todos")));

      expect(await read(testFile)).toBe("// written by hand\n");
    });

    test("seed: true creates them for every route", async () => {
      await run(sourceFolder(), { seed: true }, entries(apiRoute("todos")));

      expect(await pathExists(resolve(root, testFile))).toBe(true);
    });

    test("a seed pattern narrows it to matching routes", async () => {
      await run(
        sourceFolder(),
        { seed: "admin/**" },
        entries(apiRoute("todos"), apiRoute("admin/users")),
      );

      expect(await pathExists(resolve(root, testFile))).toBe(false);
      expect(
        await pathExists(resolve(root, "src/app/api/admin/users/index.test.ts")),
      ).toBe(true);
    });

    test("the seeded file documents the calls the route answers", async () => {
      const route = apiRoute("todos/[id]", {
        methods: ["PATCH", "DELETE"],
        params: {
          id: "P",
          schema: [{ type: "param", kind: "required", name: "id", const: "id" }],
          resolvedType: undefined,
        },
        validationDefinitions: [
          {
            method: "PATCH",
            target: "json",
            schema: {
              id: "J",
              text: "TodoPatchT",
              resolvedType: {
                properties: [{ name: "title" }, { name: "completed" }],
              } as never,
            },
          },
          {
            method: "PATCH",
            target: "response",
            variants: [
              { id: "R", status: 200, contentType: "json", body: "TodoT" },
            ],
          },
        ] as never,
      });

      await run(sourceFolder(), { seed: true }, entries(route));

      const seeded = await read("src/app/api/todos/[id]/index.test.ts");

      expect(seeded).toContain(
        "await client.PATCH([id], { json: { title, completed } });  // 200",
      );
      expect(seeded).toContain("await client.DELETE([id]);");
      expect(seeded).not.toContain("client.DELETE([id], undefined)");
      expect(seeded).toContain(`test.todo("DELETE");`);
    });

    test("a custom template replaces the boilerplate", async () => {
      await run(
        sourceFolder(),
        {
          seed: true,
          templates: { "**": ({ name }) => `// ${name}\n` },
        },
        entries(apiRoute("todos")),
      );

      expect(await read(testFile)).toBe("// todos\n");
    });
  });
});
