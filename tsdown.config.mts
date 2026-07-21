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
      target: ["node20"],
    },
    cjs: {
      target: ["node20"],
    },
  },
  deps: {
    neverBundle: ["webpack", "@babel/core", "@babel/types"],
  },
});
