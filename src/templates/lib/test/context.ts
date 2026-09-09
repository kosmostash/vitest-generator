import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Headers every in-process request carries.
 *
 * Two layers, both optional: a per-file default set with `setHeaders`, and a
 * scoped override installed by `withHeaders`. Scoping is `AsyncLocalStorage`
 * rather than a mutable global, so concurrent tests cannot read each other's
 * authorization header.
 * */

const defaultHeaders = new Headers();

const scope = new AsyncLocalStorage<Headers>();

export const currentHeaders = (): Headers => {
  const headers = new Headers(defaultHeaders);

  for (const [name, value] of scope.getStore() || []) {
    headers.set(name, value);
  }

  return headers;
};

/** Run `fn` with `headers` merged over whatever is already in scope. */
export const withHeaders = <T>(
  headers: HeadersInit,
  fn: () => T | Promise<T>,
): Promise<T> => {
  const merged = currentHeaders();

  for (const [name, value] of new Headers(headers)) {
    merged.set(name, value);
  }

  return scope.run(merged, async () => fn());
};

/** Set headers for every subsequent call in this test file. */
export const setHeaders = (headers: HeadersInit): void => {
  for (const [name, value] of new Headers(headers)) {
    defaultHeaders.set(name, value);
  }
};

/** Drop everything `setHeaders` added. */
export const clearHeaders = (): void => {
  for (const name of [...defaultHeaders.keys()]) {
    defaultHeaders.delete(name);
  }
};
