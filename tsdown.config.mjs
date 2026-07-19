import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.jsx", "src/babel.js", "src/webpack.js"],
  unbundle: true,
  clean: true,
  outputOptions: {
    dir: "lib",
    esModule: true,
    generatedCode: {
      symbols: false,
    },
  },
  dts: false,
  format: {
    esm: {
      target: ["node20"],
    },
    cjs: {
      target: ["node20"],
    },
  },
});
