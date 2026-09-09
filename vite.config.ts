import { glob } from "node:fs/promises";

import { defineConfig, type Plugin } from "vite";

import manifest from "./package.json" with { type: "json" };

/**
 * Templates are authored as real files - `.ts` so they can be typechecked,
 * `.hbs` where they carry Handlebars syntax - and inlined as strings at build
 * time. Authoring them as string literals inside the generator would cost the
 * editor support that makes them readable.
 */
export const templates = (): Plugin => ({
  name: "kosmo-vitest:templates",
  enforce: "pre",
  async resolveId(source) {
    if (!source.startsWith("#templates/")) {
      return;
    }

    const base = source.replace("#templates/", "src/templates/");

    for await (const path of glob([base, `${base}.{ts,hbs}`])) {
      return `${path}?raw`;
    }

    return;
  },
});

export default defineConfig({
  plugins: [templates()],
  ssr: {
    external: [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ],
  },
  resolve: {
    conditions: ["node"],
  },
  build: {
    ssr: true,
    target: "esnext",
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: "src/index.ts",
        config: "src/config.ts",
      },
      output: {
        dir: "pkg",
        format: "esm",
        entryFileNames: "[name].js",
      },
    },
  },
});
