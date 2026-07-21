import { relative, isAbsolute } from "node:path";
import type webpack from "webpack";

// Public Type Interfaces
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

/**
 * A modern, safe replacement for the deprecated `url.resolve()`.
 * Resolves browser asset URLs correctly against relative paths,
 * server-absolute paths, or fully qualified CDN paths.
 */
function resolveUrl(publicPath: string, file: string): string {
  if (!publicPath) return file;

  // Ensure public path ends with a slash for proper relative url resolution
  const base = publicPath.endsWith("/") ? publicPath : `${publicPath}/`;

  // Handle absolute or protocol-relative CDN URLs
  if (/^(https?:)?\/\//.test(base)) {
    const isProtocolRelative = base.startsWith("//");
    const urlBase = isProtocolRelative ? `https:${base}` : base;
    try {
      const resolved = new URL(file, urlBase).toString();
      return isProtocolRelative ? resolved.replace(/^https:/, "") : resolved;
    } catch (e) {
      // Fallback to simple concat on error
    }
  }

  // Handle server-relative or standard paths
  return `${base}${file}`;
}

function buildManifest(compiler: webpack.Compiler, compilation: any): Manifest {
  const context = compiler.options.context || "";
  const manifest: Manifest = {};

  compilation.chunks.forEach((chunk: any) => {
    // Safe module retrieval prioritizing modern properties to avoid deprecation logs
    let modules: any[] = [];
    if (compilation.chunkGraph) {
      modules = compilation.chunkGraph.getChunkModules(chunk);
    } else if (chunk.modulesIterable) {
      modules = Array.from(chunk.modulesIterable);
    } else if (typeof chunk.getModules === "function") {
      modules = chunk.getModules();
    } else if (typeof chunk.forEachModule === "function") {
      chunk.forEachModule((m: any) => {
        modules.push(m);
      });
    }

    chunk.files.forEach((file: string) => {
      modules.forEach((module: any) => {
        // Safe module ID retrieval
        const id = compilation.chunkGraph
          ? compilation.chunkGraph.getModuleId(module)
          : module.id;

        const name =
          typeof module.libIdent === "function"
            ? module.libIdent({ context })
            : null;

        const publicPath = resolveUrl(
          compilation.outputOptions.publicPath || "",
          file,
        );

        const currentModule =
          module.constructor.name === "ConcatenatedModule"
            ? module.rootModule
            : module;

        const rawRequest = (currentModule as any).rawRequest;
        if (rawRequest) {
          if (!manifest[rawRequest]) {
            manifest[rawRequest] = [];
          }
          manifest[rawRequest].push({ id, name, file, publicPath });
        }
      });
    });
  });

  return manifest;
}

export class ReactLoadablePlugin implements webpack.WebpackPluginInstance {
  public filename: string;

  constructor(opts: ReactLoadablePluginOptions = { filename: "" }) {
    this.filename = opts.filename;
  }

  apply(compiler: webpack.Compiler): void {
    const pluginName = "ReactLoadablePlugin";
    const isWebpack5 = !!(
      compiler.webpack && (compiler.webpack as any).Compilation
    );

    if (isWebpack5) {
      // Modern Webpack 5 Asset Generation Pipeline
      compiler.hooks.thisCompilation.tap(pluginName, (compilation: any) => {
        compilation.hooks.processAssets.tap(
          {
            name: pluginName,
            stage: (compiler.webpack as any).Compilation
              .PROCESS_ASSETS_STAGE_ADDITIONAL,
          },
          () => {
            const manifest = buildManifest(compiler, compilation);
            const json = JSON.stringify(manifest, null, 2);

            let outputFilename = this.filename;
            if (isAbsolute(outputFilename)) {
              const outputPath =
                compilation.outputOptions.path ||
                compiler.options.output.path ||
                "";
              outputFilename = relative(outputPath, outputFilename);
            }

            const source = new (compiler.webpack as any).sources.RawSource(
              json,
            );
            compilation.emitAsset(outputFilename, source);
          },
        );
      });
    } else if (compiler.hooks && compiler.hooks.emit) {
      // Legacy Webpack 4 Fallback
      compiler.hooks.emit.tapAsync(
        pluginName,
        (compilation: any, callback: () => void) => {
          const manifest = buildManifest(compiler, compilation);
          const json = JSON.stringify(manifest, null, 2);

          let outputFilename = this.filename;
          if (isAbsolute(outputFilename)) {
            const outputPath = compiler.options.output.path || "";
            outputFilename = relative(outputPath, outputFilename);
          }

          const source = {
            source() {
              return json;
            },
            size() {
              return json.length;
            },
          };

          compilation.assets[outputFilename] = source;
          callback();
        },
      );
    }
  }
}

export function getBundles(
  manifest: Manifest,
  moduleIds: (string | number)[],
): Bundle[] {
  return moduleIds.reduce<Bundle[]>((bundles, moduleId) => {
    return bundles.concat(manifest[moduleId] || []);
  }, []);
}
