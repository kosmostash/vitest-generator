import fetchFactory from "@kosmojs/core/fetch";
import { transport } from "virtual:kosmo/fetch-transport";

/**
 * A hand-written stand-in for `lib/<folder>/fetch.ts`.
 *
 * The real one is derived by the fetch generator; what matters here is the
 * shape the harness relies on - clients built by `fetchFactory` over the
 * transport that `virtual:kosmo/fetch-transport` resolves to.
 */

type Todo = { id: number; title: string; done: boolean };

const api = fetchFactory("/api", { transport });

export type ResponseT = {
  todos: { GET: Array<Todo>; POST: Todo };
  "todos/[id]": { GET: Todo };
};

export default {
  todos: {
    GET: () => api.GET<Array<Todo>>("todos"),
    POST: (_params: [], payload: { json: { title: string } }) => {
      return api.POST<Todo>("todos", payload);
    },
  },
  "todos/[id]": {
    GET: (params: [number]) => api.GET<Todo>(["todos", ...params]),
  },
};
