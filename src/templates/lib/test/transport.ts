import type { FetchApp, NodeApp } from "@kosmojs/core";
import type { Transport } from "@kosmojs/core/fetch";

import backendApp from "virtual:kosmo/backend-app";

import { currentHeaders } from "./context";

/**
 * The transport tests run on.
 *
 * Same contract as the SSR transport - a `Request` in, a `Response` out,
 * dispatched straight into this folder's api app - with two deliberate
 * differences, because a test is not a page render:
 *
 * - it does not follow redirects, so a 3xx is something a test can assert on
 * - it does not wrap failures, so the fetch client's own error surfaces
 *   with its `response` and parsed `body` intact
 * */

/** Requests never leave the process, so the origin is only there to make URLs absolute. */
export const origin = "http://kosmo.test";

const isFetchApp = (app: FetchApp | NodeApp): app is FetchApp => {
  return typeof (app as FetchApp).fetch === "function";
};

const createDispatch = (app: FetchApp | NodeApp) => {
  if (isFetchApp(app)) {
    // Hono, H3, or anything else exposing a web fetch handler
    return (request: Request) => app.fetch(request);
  }

  // Koa and friends: a node handler, driven through an in-memory injection
  return async (request: Request): Promise<Response> => {
    const { inject } = await import("light-my-request");

    const url = new URL(request.url);

    const payload = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : Buffer.from(await request.arrayBuffer());

    const result = await inject(app.callback(), {
      method: request.method as never,
      url: url.pathname + url.search,
      headers: Object.fromEntries(request.headers),
      ...(payload?.length ? { payload } : {}),
    });

    const headers = new Headers();

    for (const [name, value] of Object.entries(result.headers)) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        if (entry !== undefined) {
          headers.append(name, String(entry));
        }
      }
    }

    // 204/304 must not carry a body, per the Response constructor
    const body = [204, 304].includes(result.statusCode)
      ? null
      : new Uint8Array(result.rawPayload);

    return new Response(body, {
      status: result.statusCode,
      statusText: result.statusMessage,
      headers,
    });
  };
};

const dispatch = backendApp ? createDispatch(backendApp) : undefined;

export const transport: Transport = async (input, init) => {
  if (!dispatch) {
    throw new Error(
      "No api app to dispatch into - this source folder has no backend.",
    );
  }

  const headers = new Headers(init?.headers);

  // scoped headers are defaults: anything set on the call itself wins
  for (const [name, value] of currentHeaders()) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }

  const request =
    input instanceof Request
      ? // carries its own method and body; only the headers are merged
        new Request(input, { headers })
      : new Request(new URL(String(input), origin), { ...init, headers });

  return dispatch(request);
};
