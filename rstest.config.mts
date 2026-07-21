import { defineConfig } from "@rstest/core";

export default defineConfig({
  globals: true,
  include: ["./__tests__/test.js"],
  testEnvironment: "jsdom",
  tools: {
    swc: {
      jsc: {
        transform: {
          react: {
            runtime: "automatic", // Enables the modern React JSX transform
          },
        },
      },
    },
  },
});
