// @ts-nocheck

export interface Bundle {
  id: string;
  name: string | null;
  file: string;
  publicPath: string;
}

export interface Manifest {
  entrypoints: string[];
  origins: { [key: string]: number[] };
  assets: { [key: string]: Bundle[] }[];
}

export interface ReactLoadablePluginOptions {
  filename: string;
}

export class ReactLoadablePlugin {
  constructor(opts?: ReactLoadablePluginOptions);
}

export function getBundles(manifest: Manifest, moduleIds: string[]): Bundle[];
