declare module "virtual:kosmo/backend-app" {
  import type { FetchApp, NodeApp } from "@kosmojs/core";
  const backend: FetchApp | NodeApp | undefined;
  export default backend;
}

declare module "virtual:kosmo/fetch-transport" {
  import type { Transport } from "@kosmojs/core/fetch";
  export const transport: Transport | undefined;
}
