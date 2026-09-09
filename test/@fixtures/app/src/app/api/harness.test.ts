import { beforeEach, describe, expect, test } from "vitest";

import {
  api,
  app,
  base,
  clearHeaders,
  failure,
  request,
  setHeaders,
  withHeaders,
} from "_/test";

/**
 * The harness driving a real Hono app in process - no port, no server.
 * This is the shape a project's own route tests take.
 */

beforeEach(async () => {
  clearHeaders();
  await request.post("reset");
});

describe("typed clients", () => {
  test("dispatch into the api app", async () => {
    const todos = await api.todos.GET();

    expect(todos).toEqual([{ id: 1, title: "Taste JavaScript", done: false }]);
  });

  test("carry a json payload", async () => {
    const created = await api.todos.POST([], { json: { title: "Buy a unicorn" } });

    expect(created).toMatchObject({ title: "Buy a unicorn", done: false });
    expect(await api["todos/[id]"].GET([created.id])).toEqual(created);
  });
});

describe("failure", () => {
  test("turns a thrown response back into a value", async () => {
    const { status, body, validation } = await failure(
      api["todos/[id]"].GET([404]),
    );

    expect(status).toBe(404);
    expect(body).toEqual({ error: "No such todo" });
    expect(validation).toBeUndefined();
  });

  test("complains when the call it was given succeeds", async () => {
    await expect(failure(api.todos.GET())).rejects.toThrow(
      /Expected the call to fail/,
    );
  });
});

describe("request", () => {
  test("joins a relative path onto the folder's base", async () => {
    const response = await request.get("todos");

    expect(base).toBe("/api");
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
  });

  test("takes an absolute path as it is", async () => {
    const response = await request("GET", "/api/todos");

    expect(response.status).toBe(200);
  });

  test("keeps the status of a response the clients would throw on", async () => {
    const response = await request.get("todos/404");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "No such todo" });
  });

  test("serializes a query string the way the fetch clients do", async () => {
    const response = await request.get("echo", {
      query: { page: 2, tags: ["a", "b"] },
    });

    const { search } = await response.json();

    // brackets survive as the URL encodes them, exactly as they do over the wire
    expect(search).toBe("?page=2&tags%5B%5D=a&tags%5B%5D=b");
    expect(decodeURIComponent(search)).toBe("?page=2&tags[]=a&tags[]=b");
  });

  test("sends json and form bodies with their content types", async () => {
    const json = await (
      await request.post("echo", { json: { title: "x" } })
    ).json();

    expect(json.headers["content-type"]).toBe("application/json");
    expect(json.body).toBe('{"title":"x"}');

    const form = await (
      await request.post("echo", { form: { title: "x" } })
    ).json();

    expect(form.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(form.body).toBe("title=x");
  });

  test("does not follow redirects, so a test can see them", async () => {
    const response = await request.get("moved");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/api/todos");
  });

  test("answers a 204 without inventing a body", async () => {
    const response = await request.delete("todos/1");

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});

describe("headers", () => {
  test("withHeaders scopes them to the call", async () => {
    const inside = await withHeaders({ authorization: "Bearer scoped" }, () => {
      return request.get("echo").then((r) => r.json());
    });

    expect(inside.headers.authorization).toBe("Bearer scoped");

    const outside = await request.get("echo").then((r) => r.json());

    expect(outside.headers.authorization).toBeUndefined();
  });

  test("withHeaders nests, inner over outer", async () => {
    const headers = await withHeaders({ "x-one": "1", "x-two": "2" }, () => {
      return withHeaders({ "x-two": "overridden" }, () => {
        return request.get("echo").then((r) => r.json());
      });
    });

    expect(headers.headers["x-one"]).toBe("1");
    expect(headers.headers["x-two"]).toBe("overridden");
  });

  test("setHeaders applies until cleared", async () => {
    setHeaders({ "x-api-key": "secret" });

    const withDefault = await request.get("echo").then((r) => r.json());
    expect(withDefault.headers["x-api-key"]).toBe("secret");

    clearHeaders();

    const cleared = await request.get("echo").then((r) => r.json());
    expect(cleared.headers["x-api-key"]).toBeUndefined();
  });

  test("a header set on the call wins over the scoped one", async () => {
    const { headers } = await withHeaders({ "x-who": "scope" }, () => {
      return request
        .get("echo", { headers: { "x-who": "call" } })
        .then((r) => r.json());
    });

    expect(headers["x-who"]).toBe("call");
  });
});

test("exposes the app itself", () => {
  expect(app).toBeDefined();
});
