import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  oxc: { jsx: "automatic" },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "lib",
          environment: "node",
          include: ["lib/**/*.test.ts"],
          exclude: ["lib/__tests__/storageKeys.test.ts", "lib/__tests__/chartConventions.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: [
            "components/**/*.test.{ts,tsx}",
            "app/**/*.test.{ts,tsx}",
            "test/**/*.test.{ts,tsx}",
            "lib/__tests__/storageKeys.test.ts",
            "lib/__tests__/chartConventions.test.ts",
          ],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
