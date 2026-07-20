import { defineConfig } from "@rstest/core";

export default defineConfig({
  globals: true,
  include: ["./__tests__/test.js"],
  testEnvironment: "jsdom",
});
