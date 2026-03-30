import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "main/electron-main": "src/main/electron-main.ts",
    "preload/electron-preload": "src/preload/electron-preload.ts"
  },
  format: ["cjs"],
  outDir: "dist-electron",
  sourcemap: true,
  platform: "node",
  target: "node22",
  clean: false,
  external: ["electron"]
});
