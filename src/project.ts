import { basename, dirname, resolve } from "node:path";

import { createJiti } from "jiti";
import { glob } from "tinyglobby";

import { defaults, DEFAULT_DIST, type SourceFolder } from "@kosmojs/core";

type ProjectManifest = {
  distDir?: string;
};

/**
 * Loads the project's source folders the same way the CLI does - by globbing
 * `src/*​/kosmo.config.ts` and importing each through jiti.
 *
 * A vitest config is a plain node module: it has no Vite pipeline of its own to
 * load TypeScript with, which is why jiti is here rather than an import().
 * */
export const loadSourceFolders = async (
  root: string,
  names?: Array<string>,
): Promise<Array<SourceFolder>> => {
  const jiti = createJiti(root);

  const { distDir = DEFAULT_DIST } = await jiti
    .import<ProjectManifest>(resolve(root, "package.json"), { default: true })
    .catch(() => ({}) as ProjectManifest);

  const configFiles = await glob(
    names?.length
      ? names.map((name) => `${defaults.srcDir}/${name}/kosmo.config.ts`)
      : `${defaults.srcDir}/*/kosmo.config.ts`,
    { cwd: root, absolute: true, deep: 2 },
  );

  if (names?.length && names.length !== configFiles.length) {
    throw new Error(
      `Some of the given names does not contain a valid KosmoJS source folder: ${names.join(", ")}`,
    );
  }

  const sourceFolders: Array<SourceFolder> = [];

  for (const file of configFiles.sort()) {
    const config = await jiti.import<SourceFolder["config"]>(file, {
      default: true,
    });

    if (!config?.generators) {
      throw new Error(
        `${file}: no config exported - a source folder config is the default export of defineConfig()`,
      );
    }

    sourceFolders.push({
      name: basename(dirname(file)),
      config,
      root,
      distDir,
    });
  }

  return sourceFolders;
};
