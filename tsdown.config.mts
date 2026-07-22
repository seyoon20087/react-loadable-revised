import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx", "src/babel.js", "src/webpack.js"],
  unbundle: true,
  clean: true,
  outputOptions: {
    dir: "lib",
    esModule: true,
    generatedCode: {
      symbols: false,
    },
  },
  dts: true,
  format: {
    esm: {
      target: ["es2022"],
    },
    cjs: {
      target: ["es2022"], // node 18 or higher
    },
  },
  deps: {
    neverBundle: ["webpack", "@babel/core", "@babel/types"],
  },
});
