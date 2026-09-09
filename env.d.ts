/**
 * Templates are authored as real files under `src/templates/` and inlined as
 * strings at build time by the `templates` plugin in vite.config.ts.
 */
declare module "#templates/*" {
  const source: string;
  export default source;
}
