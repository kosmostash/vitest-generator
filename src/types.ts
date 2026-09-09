import type { ApiRoute, GeneratorCustomTemplates } from "@kosmojs/core";

export type VitestGeneratorOptions = {
  /**
   * Create a `index.test.ts` next to routes that have none.
   *
   * `true` seeds every route; a route-name glob (or a list of them) narrows it -
   * `"admin/**"`, `["users", "users/[id]"]`.
   *
   * A test file that already exists and is **blank** is always filled in,
   * whatever this is set to - same rule the route files themselves follow.
   *
   * @default false
   * */
  seed?: boolean | string | Array<string>;

  /**
   * Override the seeded test boilerplate by route-name pattern, exactly like
   * `backend.templates` overrides the route boilerplate.
   *
   * ```ts
   * templates: { "admin/**": adminTestTemplate }
   * ```
   * */
  templates?: GeneratorCustomTemplates<ApiRoute>;

  /**
   * Deploy a root `vitest.config.ts` when the project has none.
   * Never overwrites an existing one.
   *
   * @default true
   * */
  config?: boolean;
};

/**
 * What the seeded test template is rendered with.
 * Custom templates receive the same context.
 * */
export type TestTemplateContext = {
  route: ApiRoute;
  /** `true` when the folder derives fetch clients, i.e. `_/test` exports `api` */
  hasFetchClients: boolean;
  /** route params in path order, e.g. `["id"]` */
  params: Array<string>;
  methods: Array<{
    method: string;
    /** the params argument as written at a call site, e.g. `[id]` */
    params: string;
    /** the payload argument, e.g. `{ json: { title } }`, or undefined */
    payload: string | undefined;
    /** declared response statuses, e.g. `[200]` */
    statuses: Array<number>;
  }>;
};
