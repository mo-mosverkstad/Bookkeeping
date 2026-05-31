import { defineConfig } from "vite";
import os from "os";
import path from "path";

export default defineConfig({
    cacheDir: path.join(os.homedir(), ".vite-cache", "Webapp"),
    base: "./",
});
