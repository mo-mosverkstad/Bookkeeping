import { defineConfig } from "vitest/config";
import os from "os";
import path from "path";

export default defineConfig({
    cacheDir: path.join(os.homedir(), ".vite-cache", "Webapp"),
    test: {
        environment: "happy-dom",
        include: ["test/**/*.test.ts"],
    },
});
