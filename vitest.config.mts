import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws on import unless the `react-server` condition is
      // set, which only Next does. Tests load server modules directly.
      "server-only": fileURLToPath(
        new URL("./test/empty-module.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // The summary prints with every run; the HTML report in coverage/
      // shows each file line by line.
      reporter: ["text-summary", "html", "json-summary"],
    },
  },
});
