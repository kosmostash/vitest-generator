import { Hono } from "hono";

/**
 * Stands in for a KosmoJS-derived api app: a real Hono instance, mounted at the
 * folder's `backend.base`, that the harness dispatches into.
 */
type Todo = { id: number; title: string; done: boolean };

const seed = (): Array<[number, Todo]> => [
  [1, { id: 1, title: "Taste JavaScript", done: false }],
];

const todos = new Map<number, Todo>(seed());

const app = new Hono().basePath("/api");

app.get("/todos", (ctx) => {
  return ctx.json([...todos.values()]);
});

app.post("/todos", async (ctx) => {
  const { title } = await ctx.req.json<{ title: string }>();
  const todo = { id: todos.size + 1, title, done: false };
  todos.set(todo.id, todo);
  return ctx.json(todo, 201);
});

app.get("/todos/:id", (ctx) => {
  const todo = todos.get(Number(ctx.req.param("id")));
  return todo //
    ? ctx.json(todo)
    : ctx.json({ error: "No such todo" }, 404);
});

app.delete("/todos/:id", (ctx) => {
  return todos.delete(Number(ctx.req.param("id")))
    ? ctx.body(null, 204)
    : ctx.json({ error: "No such todo" }, 404);
});

/** echoes back what the transport actually delivered */
app.all("/echo", async (ctx) => {
  return ctx.json({
    method: ctx.req.method,
    url: ctx.req.url,
    search: new URL(ctx.req.url).search,
    headers: Object.fromEntries(ctx.req.raw.headers),
    body: await ctx.req.text(),
  });
});

/** lets each test start from the same rows */
app.post("/reset", (ctx) => {
  todos.clear();
  for (const [id, todo] of seed()) {
    todos.set(id, todo);
  }
  return ctx.body(null, 204);
});

app.get("/moved", (ctx) => {
  return ctx.redirect("/api/todos", 302);
});

export default app;
