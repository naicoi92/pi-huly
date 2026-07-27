import { defineConfig } from "rolldown";

// R3 mitigation: externalize ws + native addons (R2), node:* built-ins,
// pi peers (@earendil-works/*), @hcengineering/* (npm public dep — consumer
// install runtime, KHÔNG bundled) and typebox (pi peer).
// KHÔNG inline → bundle stays small, no dep leak.
const external = [
  "ws",
  "bufferutil",
  "utf-8-validate",
  /^node:/,
  /^@earendil-works\//,
  /^@hcengineering\//,
  "typebox",
];

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    entryFileNames: "index.mjs",
    format: "esm",
    sourcemap: true,
  },
  external,
  treeshake: {
    moduleSideEffects: "no-external",
  },
});
