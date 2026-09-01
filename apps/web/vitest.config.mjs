import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.js"],
          exclude: [...configDefaults.exclude, "**/*.integration.test.js"],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            "server-only": path.resolve(rootDir, "src/test/server-only.js"),
          },
        },
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.integration.test.js"],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
