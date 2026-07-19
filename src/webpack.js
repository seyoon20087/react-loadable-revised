import { resolve } from "node:url";

function buildManifest(compiler, compilation) {
  const context = compiler.options.context;
  const manifest = {};

  compilation.chunks.forEach((chunk) => {
    // 1. Safe module retrieval across different Webpack versions
    let modules = [];
    if (compilation.chunkGraph) {
      modules = compilation.chunkGraph.getChunkModules(chunk);
    } else if (typeof chunk.forEachModule === "function") {
      chunk.forEachModule((m) => {
        modules.push(m);
      });
    } else if (typeof chunk.getModules === "function") {
      modules = chunk.getModules();
    } else if (chunk.modulesIterable) {
      modules = Array.from(chunk.modulesIterable);
    }

    chunk.files.forEach((file) => {
      modules.forEach((module) => {
        // 2. Safe module ID retrieval
        const id = compilation.chunkGraph
          ? compilation.chunkGraph.getModuleId(module)
          : module.id;

        const name =
          typeof module.libIdent === "function"
            ? module.libIdent({ context })
            : null;

        const publicPath = resolve(
          compilation.outputOptions.publicPath || "",
          file,
        );

        const currentModule =
          module.constructor.name === "ConcatenatedModule"
            ? module.rootModule
            : module;

        if (!manifest[currentModule.rawRequest]) {
          manifest[currentModule.rawRequest] = [];
        }

        manifest[currentModule.rawRequest].push({ id, name, file, publicPath });
      });
    });
  });

  return manifest;
}

class ReactLoadablePlugin {
  constructor(opts = {}) {
    this.filename = opts.filename;
  }

  apply(compiler) {
    const handler = (compilation, callback) => {
      const manifest = buildManifest(compiler, compilation);
      const json = JSON.stringify(manifest, null, 2);

      // 3. Modern vs legacy Asset Source handling
      let source;
      if (
        compiler.webpack &&
        compiler.webpack.sources &&
        compiler.webpack.sources.RawSource
      ) {
        source = new compiler.webpack.sources.RawSource(json);
      } else {
        source = {
          source() {
            return json;
          },
          size() {
            return json.length;
          },
        };
      }

      // Safe asset emission to bypass freezing/deprecation warnings in v5
      if (typeof compilation.emitAsset === "function") {
        compilation.emitAsset(this.filename, source);
      } else {
        compilation.assets[this.filename] = source;
      }

      callback();
    };

    // 4. Safe Compiler Hook registration
    if (compiler.hooks && compiler.hooks.emit) {
      compiler.hooks.emit.tapAsync("ReactLoadablePlugin", handler);
    } else if (typeof compiler.plugin === "function") {
      compiler.plugin("emit", handler);
    }
  }
}

function getBundles(manifest, moduleIds) {
  return moduleIds.reduce((bundles, moduleId) => {
    return bundles.concat(manifest[moduleId]);
  }, []);
}

export { ReactLoadablePlugin, getBundles };
