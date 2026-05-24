import { defineConfig } from "vitest/config";
import os from "os";
import path from "path";

export default defineConfig({
    cacheDir: path.join(os.homedir(), ".vite-cache", "Webapp"),
    test: {
        environment: "happy-dom",
        include: ["test/**/*.test.ts"],
        exclude: [
            "test/plugins/geometry/grammar.test.ts",
            "test/plugins/physics/grammar.test.ts",
            "test/plugins/math/geometry.test.ts",
            "test/plugins/math/physics.test.ts",
        ],
    },
});
