// This file is a fork of `react-loadable-ssr-addon` to match our needs.
// PLEASE DO NOT MODIFY THIS FILE FOR/WITH ANY MEANS.

import fs from "fs";
import path from "path";
import url from "url";
function getFileExtension(filename) {
  if (!filename || typeof filename !== "string") {
    return "";
  }
  const fileExtRegex = /\.\w{2,4}\.(?:map|gz)$|\.\w+$/i;
  const name = filename.split(/[?#]/)[0];
  const ext = name.match(fileExtRegex);
  return ext && ext.length ? ext[0] : "";
}
function unique(array) {
  return array.filter((elem, pos, arr) => arr.indexOf(elem) === pos);
}
function hasEntry(target, targetKey, searchFor) {
  if (!target) {
    return false;
  }
  for (let i = 0; i < target.length; i += 1) {
    const file = target[i][targetKey];
    if (file === searchFor) {
      return true;
    }
  }
  return false;
}
const PLUGIN_NAME = "ReactLoadablePlugin";
const WEBPACK_VERSION = (function GetVersion() {
  try {
    return require("webpack/package.json").version;
  } catch (err) {
    return "";
  }
})();
const WEBPACK_5 = WEBPACK_VERSION.startsWith("5.");
const defaultOptions = { filename: "assets-manifest.json" };
class ReactLoadableSSRAddon {
  constructor(options = defaultOptions) {
    this.options = { ...defaultOptions, ...options };
    this.compiler = null;
    this.stats = null;
    this.entrypoints = new Set();
    this.assetsByName = new Map();
    this.manifest = {};
  }
  get isRequestFromDevServer() {
    if (process.argv.some((arg) => arg.includes("webpack-dev-server"))) {
      return true;
    }
    const {
      outputFileSystem: outputFileSystem,
      outputFileSystem: {
        constructor: { name: name },
      },
    } = this.compiler;
    return outputFileSystem && name === "MemoryFileSystem";
  }
  get manifestOutputPath() {
    const { filename: filename } = this.options;
    if (path.isAbsolute(filename)) {
      return filename;
    }
    const {
      outputPath: outputPath,
      options: { devServer: devServer },
    } = this.compiler;
    if (this.isRequestFromDevServer && devServer) {
      let devOutputPath = devServer.outputPath || outputPath || "/";
      if (devOutputPath === "/") {
        console.warn(
          "Please use an absolute path in options.output when using webpack-dev-server.",
        );
        devOutputPath = this.compiler.context || process.cwd();
      }
      return path.resolve(devOutputPath, filename);
    }
    return path.resolve(outputPath, filename);
  }
  getAssets(assetsChunk) {
    for (let i = 0; i < assetsChunk.length; i += 1) {
      const chunk = assetsChunk[i];
      const {
        id: id,
        files: files,
        siblings: siblings = [],
        hash: hash,
      } = chunk;
      const keys = this.getChunkOrigin(chunk);
      for (let j = 0; j < keys.length; j += 1) {
        this.assetsByName.set(keys[j], {
          id: id,
          files: files,
          hash: hash,
          siblings: siblings,
        });
      }
    }
    return this.assetsByName;
  }
  getEntrypoints(entrypoints) {
    const entry = Object.keys(entrypoints);
    for (let i = 0; i < entry.length; i += 1) {
      this.entrypoints.add(entry[i]);
    }
    return this.entrypoints;
  }
  getChunkOrigin({ id: id, names: names, modules: modules }) {
    const origins = new Set();
    if (!WEBPACK_5) {
      for (let i = 0; i < modules.length; i += 1) {
        const { reasons: reasons } = modules[i];
        for (let j = 0; j < reasons.length; j += 1) {
          const reason = reasons[j];
          const type = reason.dependency ? reason.dependency.type : null;
          const userRequest = reason.dependency
            ? reason.dependency.userRequest
            : null;
          if (type === "import()") {
            origins.add(userRequest);
          }
        }
      }
    }
    if (origins.size === 0) {
      return [names[0] || id];
    }
    if (this.entrypoints.has(names[0])) {
      origins.add(names[0]);
    }
    return Array.from(origins);
  }
  apply(compiler) {
    this.compiler = compiler;
    compiler.hooks.emit.tapAsync(PLUGIN_NAME, this.handleEmit.bind(this));
  }
  getMinimalStatsChunks(compilationChunks, chunkGraph) {
    const compareId = (a, b) => {
      if (typeof a !== typeof b) {
        return typeof a < typeof b ? -1 : 1;
      }
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    };
    return this.ensureArray(compilationChunks).reduce((chunks, chunk) => {
      const siblings = new Set();
      if (chunk.groupsIterable) {
        const chunkGroups = Array.from(chunk.groupsIterable);
        for (let i = 0; i < chunkGroups.length; i += 1) {
          const group = Array.from(chunkGroups[i].chunks);
          for (let j = 0; j < group.length; j += 1) {
            const sibling = group[j];
            if (sibling !== chunk) siblings.add(sibling.id);
          }
        }
      }
      chunk.ids.forEach((id) => {
        chunks.push({
          id: id,
          names: chunk.name ? [chunk.name] : [],
          files: this.ensureArray(chunk.files).slice(),
          hash: chunk.renderedHash,
          siblings: Array.from(siblings).sort(compareId),
          modules: WEBPACK_5
            ? chunkGraph.getChunkModules(chunk)
            : chunk.getModules(),
        });
      });
      return chunks;
    }, []);
  }
  handleEmit(compilation, callback) {
    this.stats = compilation
      .getStats()
      .toJson({ all: false, entrypoints: true }, true);
    this.options.publicPath =
      (compilation.outputOptions
        ? compilation.outputOptions.publicPath
        : compilation.options.output.publicPath) || "";
    this.getEntrypoints(this.stats.entrypoints);
    this.getAssets(
      this.getMinimalStatsChunks(compilation.chunks, compilation.chunkGraph),
    );
    this.processAssets(compilation.assets);
    this.writeAssetsFile();
    callback();
  }
  processAssets(originAssets) {
    const assets = {};
    const origins = {};
    const { entrypoints: entrypoints } = this;
    this.assetsByName.forEach((value, key) => {
      const { files: files, id: id, siblings: siblings, hash: hash } = value;
      if (!origins[key]) {
        origins[key] = [];
      }
      siblings.push(id);
      for (let i = 0; i < siblings.length; i += 1) {
        const sibling = siblings[i];
        if (!origins[key].includes(sibling)) {
          origins[key].push(sibling);
        }
      }
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const ext = getFileExtension(file).replace(/^\.+/, "").toLowerCase();
        if (!assets[id]) {
          assets[id] = {};
        }
        if (!assets[id][ext]) {
          assets[id][ext] = [];
        }
        if (!hasEntry(assets[id][ext], "file", file)) {
          assets[id][ext].push({
            id: i,
            name: null,
            file: file,
            publicPath: url.resolve(this.options.publicPath || "", file),
          });
        }
      }
    });
    this.manifest = {
      entrypoints: Array.from(entrypoints),
      origins: origins,
      assets: assets,
    };
  }
  writeAssetsFile() {
    const filePath = this.manifestOutputPath;
    const fileDir = path.dirname(filePath);
    const json = JSON.stringify(this.manifest, null, 2);
    try {
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
    } catch (err) {
      if (err.code !== "EEXIST") {
        throw err;
      }
    }
    fs.writeFileSync(filePath, json);
  }
  ensureArray(source) {
    if (WEBPACK_5) {
      return Array.from(source);
    }
    return source;
  }
}
function getBundles(manifest, chunks) {
  if (!manifest || !chunks) {
    return {};
  }
  const assetsKey = chunks.reduce((key, chunk) => {
    if (manifest.origins[chunk]) {
      key = unique([...key, ...manifest.origins[chunk]]);
    }
    return key;
  }, []);
  return assetsKey.reduce((bundle, asset) => {
    Object.keys(manifest.assets[asset] || {}).forEach((key) => {
      const content = manifest.assets[asset][key];
      if (!bundle[key]) {
        bundle[key] = [];
      }
      bundle[key] = unique([...bundle[key], ...content]);
    });
    return bundle;
  }, {});
}
export { ReactLoadableSSRAddon as default, getBundles };
