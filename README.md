# @kosmojs/vitest-generator

Vitest for [KosmoJS](https://kosmojs.dev) APIs: your routes, called through the typed
fetch clients, in the same process — no port, no server, no supertest.

```ts
import { api, failure } from "_/test";

const client = api["todos/[id]"];

test("a missing todo is a 404, not a crash", async () => {
  const { status, body } = await failure(client.DELETE([404]));

  expect(status).toBe(404);
  expect(body).toEqual({ error: "No todo with id 404" });
});
```

## The idea

KosmoJS already knows how to reach your routes without a network. That is what the
isomorphic fetch client does during SSR: the same call that issues an HTTP request in
the browser dispatches straight into the api app on the server.

This generator points that machinery at your tests. It derives a `_/test` module per
source folder and a vitest config that swaps one virtual module — the fetch transport —
so the clients your pages import are the clients your tests call. Nothing is mocked,
nothing is re-implemented: routing, middleware, validation, your error handler and
response shaping all run exactly as they do in production.

## Install

```sh
pnpm add -D @kosmojs/vitest-generator vitest
```

Then add it to the source folder whose api you want to test. `defineConfig` builds the
generator list from your config; append yours to it:

```ts
// src/app/kosmo.config.ts
import { defineConfig } from "@kosmojs/dev";
import vitestGenerator from "@kosmojs/vitest-generator";

const config = defineConfig({
  frontend: { stack: "react", base: "/", fetch: true },
  backend: { stack: "hono", base: "/api" },
  validation: true,
});

export default {
  ...config,
  generators: [...config.generators, vitestGenerator()],
};
```

Start the dev server or run a build once — that derives `lib/<folder>/test/` and, if the
project has no `vitest.config.ts` yet, writes one:

```ts
// vitest.config.ts
import { defineVitestConfig } from "@kosmojs/vitest-generator/config";

export default defineVitestConfig();
```

`pnpm vitest` now runs one project per source folder, each wired to that folder's `@/`,
`~/` and `_/` imports and to its api app.

## What `_/test` gives you

| Export | What it is |
| --- | --- |
| `api` | the typed fetch clients from `_/fetch`, dispatching in process |
| `request` | an untyped request, for what the typed clients hide: statuses, headers, redirects, routes with no declared response |
| `failure` | awaits a call that is supposed to fail and hands back `{ status, body, message, validation }` |
| `withHeaders` | runs a callback with headers merged over whatever is in scope |
| `setHeaders` / `clearHeaders` | headers for every call in the file, and the way back |
| `base` | the folder's api prefix, e.g. `"/api"` |
| `app` | the api app itself, for the rare test that needs it directly |

```ts
import { api, base, failure, request, withHeaders } from "_/test";

// typed: params, payload and response come from the route definition
const todo = await api.todos.POST([], { json: { title: "Taste JavaScript" } });

// untyped, when the status is the point
const response = await request.get("todos");     // -> GET /api/todos
expect(response.status).toBe(200);
expect(response.headers.get("x-request-id")).toBeTruthy();

// a path starting with a slash is taken as-is
await request("GET", "/healthz");

// clients throw on anything but a 2xx; failure() turns the throw back into a value
const { status, body } = await failure(api.todos.POST([], { json: { title: "" } }));

// an authenticated subtree, without touching module state
await withHeaders({ authorization: "Bearer test" }, async () => {
  await api["admin/users"].GET();
});
```

`request` takes `json`, `form`, `query`, `body` and anything else `RequestInit` accepts,
and has `get` / `post` / `put` / `patch` / `delete` / `head` / `options` shorthands.
Query strings are serialized the way the fetch clients serialize them.

## Seeded tests

An `index.test.ts` next to a route follows the same rule route files do: **create it
blank and it gets filled in.** What lands there is derived from the route itself — the
methods it answers, its params, the payload targets it declares and the statuses it
returns:

```ts
import { describe, expect, test } from "vitest";

import { api, failure } from "_/test";

const client = api["todos/[id]"];

describe("todos/[id]", () => {
  /**
   * This route answers:
   *
   *   await client.PATCH([id], { json: { title, completed } });  // 200
   *   await client.DELETE([id]);  // 200
   *
   * A call that is meant to fail hands back the status and the error body:
   *
   *   const { status, body } = await failure(...);
   */

  test.todo("PATCH");
  test.todo("DELETE");
});
```

To create the files as well, rather than only fill in blank ones, pass `seed`:

```ts
vitestGenerator({ seed: true })            // every route
vitestGenerator({ seed: "admin/**" })      // matching routes only
vitestGenerator({ seed: ["users", "users/[id]"] })
```

`templates` replaces the boilerplate by route-name pattern, exactly like
`backend.templates` does for route files:

```ts
vitestGenerator({
  templates: { "admin/**": adminTestTemplate },
})
```

A template is a string, or a function of the route returning one; it is rendered with
`{ route, hasFetchClients, params, methods }`.

## How a test differs from a browser

The harness is deliberately not friendlier than the real client. Four differences are
worth knowing, and all four are on purpose:

- **No `Accept` header is added.** The fetch clients do not send one, so neither does the
  harness — if your error handler content-negotiates, a test sees what the browser sees.
  (This is how the TodoMVC app this was built against turned out to be answering
  `text/plain` to its own client.)
- **Client-side validation is skipped**, exactly as it is under SSR: there is no round
  trip to save. Invalid payloads come back as the server's `400`, which is the stronger
  assertion anyway.
- **Redirects are not followed.** A `3xx` is something a test should be able to assert
  on, so `request` hands it to you rather than chasing it.
- **Response validation runs.** Tests use the development policy (`command: "serve"`),
  so a handler that returns something its declared `response` does not allow fails the
  test instead of shipping.

## Options

### `vitestGenerator(options)`

| Option | Default | What it does |
| --- | --- | --- |
| `seed` | `false` | create `index.test.ts` for routes that have none — `true`, a route glob, or a list of them |
| `templates` | – | override the seeded boilerplate by route-name pattern |
| `config` | `true` | deploy a root `vitest.config.ts` when the project has none |

### `defineVitestConfig(options)`

| Option | Default | What it does |
| --- | --- | --- |
| `root` | `process.cwd()` | the project root |
| `folders` | every folder running the generator | limit the run to named source folders |
| `include` | `["src/<folder>/**/*.{test,spec}.{ts,tsx}"]` | where a folder's tests live; `<folder>` is the folder name |
| `test` | – | merged into every derived project's `test` block |
| `projects` | – | extra vitest projects, for tests that belong to no source folder |

```ts
export default defineVitestConfig({
  projects: [{ test: { name: "db", include: ["db/**/*.test.ts"] } }],
});
```

## Notes

- **Backends.** Hono and H3 are dispatched through `app.fetch`; Koa (and anything else
  exposing `callback()`) through an in-memory injection, which is why
  `light-my-request` is a dependency.
- **Folders without fetch clients.** An api-only folder has no `_/fetch`, so `_/test`
  exports `request` and `failure` but no `api`. Adding `fetchGenerator()` to such a
  folder gives you the typed half back.
- **Folders without a backend** derive nothing: there is no api to dispatch into.
- **Your data is yours.** The harness knows nothing about your database. Point it at a
  scratch one (`TODOMVC_DB=:memory:`, a temp file, a transaction rolled back per test)
  the same way you would for any other test suite.

## Working on the generator

```sh
pnpm install
pnpm build         # bundles src/, emits declarations
pnpm test          # builds, then runs unit + fixture tests
pnpm typecheck     # the package, then the fixture's derived output
```

The fixture under `test/@fixtures/app` is a small KosmoJS project with a real Hono app.
The test run derives the harness into it and drives it, so the suite exercises the
generator's actual output rather than the strings it renders.

## License

MIT
