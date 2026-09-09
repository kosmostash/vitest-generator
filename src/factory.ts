import { dirname, resolve } from "node:path";

import {
  type ApiRoute,
  createRouteResolver,
  createTemplateResolver,
  type ResolvedEntry,
} from "@kosmojs/core";
import {
  defineGeneratorFactory,
  pathExists,
  pathResolver,
  renderFactory,
  renderToFile,
} from "@kosmojs/lib";

import * as templates from "./templates.ts";
import type { TestTemplateContext, VitestGeneratorOptions } from "./types.ts";

/** The test file a route's boilerplate is seeded into, next to the route itself. */
export const TEST_FILE = "index.test.ts";

export default defineGeneratorFactory<VitestGeneratorOptions>(
  (sourceFolder, options) => {
    const { backend, generators } = sourceFolder.config;
    const { createPath, createImportHelpers } = pathResolver(sourceFolder);

    /**
     * Both are asked of the generator list rather than of the config, because
     * that is what actually runs: a folder can swap either one for its own.
     * */
    const hasBackend = generators.some((e) => e.meta.slot === "backend");
    const hasFetchClients = generators.some((e) => e.meta.slot === "fetch");

    const { renderToFile: deployLibFile } = renderFactory({
      helpers: createImportHelpers({ origin: "lib" }),
    });

    const { renderToFile: deploySrcFile } = renderFactory({
      helpers: createImportHelpers({ origin: "src" }),
    });

    const templateResolver = createTemplateResolver<ApiRoute>(
      options?.templates,
      templates.srcRouteTest,
    );

    /**
     * Which routes may have a test file created for them.
     * A blank test file that already exists is always filled in - that is the
     * same rule route files follow, and it is not what this decides.
     * */
    const seedResolver = createRouteResolver(
      options?.seed === true
        ? { "**": true }
        : Object.fromEntries(
            (typeof options?.seed === "string"
              ? [options.seed]
              : options?.seed || []
            ).map((pattern) => [pattern, true]),
          ),
      false,
    );

    // by default, write only into blank files
    const overwrite = (content: string) => content?.trim().length === 0;

    const deployHarness = async () => {
      for (const [file, template] of [
        ["test/context.ts", templates.libTestContext],
        ["test/transport.ts", templates.libTestTransport],
        ["test/index.ts", templates.libTestIndex],
      ]) {
        await deployLibFile(createPath.lib(file), template, {
          hasFetchClients,
          base: JSON.stringify(backend?.base || "/"),
        });
      }
    };

    const templateContext = (route: ApiRoute): TestTemplateContext => {
      const params = route.params.schema.map(({ name }) => name);

      const methods = route.methods.map((method) => {
        const definitions = route.validationDefinitions.filter((e) => {
          return e.method === method;
        });

        const payloadTargets = definitions.flatMap((definition) => {
          if (definition.target === "response" || definition.target === "params") {
            return [];
          }

          // headers and cookies are carried by the harness, not by the call
          if (["headers", "cookies"].includes(definition.target)) {
            return [];
          }

          const properties = definition.schema.resolvedType?.properties?.map(
            ({ name }) => name,
          );

          return [
            [
              definition.target,
              properties?.length
                ? `{ ${properties.join(", ")} }`
                : definition.schema.text,
            ].join(": "),
          ];
        });

        const statuses = definitions.flatMap((definition) => {
          return definition.target === "response"
            ? definition.variants.map(({ status }) => status)
            : [];
        });

        const payload = payloadTargets.length
          ? `{ ${payloadTargets.join(", ")} }`
          : undefined;

        return {
          method,
          // a route with no params takes no params argument at all,
          // unless a payload has to follow it
          params: params.length || payload ? `[${params.join(", ")}]` : "",
          payload,
          statuses,
        };
      });

      return { route, hasFetchClients, params, methods };
    };

    const seedTestFiles = async (entries: Array<ResolvedEntry>) => {
      for (const { kind, entry } of entries) {
        if (kind !== "apiRoute") {
          continue;
        }

        const file = createPath.api(dirname(entry.file), TEST_FILE);

        // an existing file is filled in only while it is blank;
        // a missing one is created only for routes the `seed` option covers
        if (!(await pathExists(file)) && !seedResolver(entry.name)) {
          continue;
        }

        await deploySrcFile(
          file,
          templateResolver(entry.name, entry),
          templateContext(entry),
          { overwrite },
        );
      }
    };

    return {
      async start() {
        if (!hasBackend) {
          // nothing to dispatch into - a frontend-only folder is tested through a browser
          return;
        }

        await deployHarness();

        if (options?.config !== false) {
          await renderToFile(
            resolve(sourceFolder.root, "vitest.config.ts"),
            templates.srcVitestConfig,
            {},
            { overwrite: false },
          );
        }
      },

      async watch(entries) {
        if (hasBackend) {
          await seedTestFiles(entries);
        }
      },

      async build(entries) {
        if (hasBackend) {
          await seedTestFiles(entries);
        }
      },
    };
  },
);
