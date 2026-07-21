import webpack = require("webpack");

export interface Bundle {
  id: string | number; // Webpack module IDs can be numbers (production) or strings
  name: string | null;
  file: string;
  publicPath: string;
}

export interface Manifest {
  [moduleId: string]: Bundle[];
}

export interface ReactLoadablePluginOptions {
  filename: string;
}

// Use "implements" instead of "extends webpack.Plugin" to prevent Webpack 5 compilation errors
export class ReactLoadablePlugin implements webpack.WebpackPluginInstance {
  constructor(opts?: ReactLoadablePluginOptions);
  apply(compiler: webpack.Compiler): void;
}

export function getBundles(
  manifest: Manifest,
  moduleIds: (string | number)[],
): Bundle[];
