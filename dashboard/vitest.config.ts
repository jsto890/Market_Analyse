import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // @ts-expect-error jsx "automatic" is used for React 18+ jsx transform and is valid at runtime
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
          exclude: ["lib/__tests__/storageKeys.test.ts", "lib/__tests__/chartConventions.test.ts", "lib/__tests__/tickerNav.test.ts"],
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
            "lib/__tests__/tickerNav.test.ts",
          ],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
