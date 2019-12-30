import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";

export default {
  input: "src/index.ts",
  output: {
    file: "docs/index.js",
    format: "umd",
    name: "Trs80Emulator"
  },
  plugins: [
      // Use "node_modules" modules.
      nodeResolve(),
      // Compile .ts files.
      typescript()
  ]
};
