import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";
import { string } from "rollup-plugin-string";

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
      typescript(),
      // Allow importing CSS files as strings.
      string({
          include: "**/*.css"
      })
  ]
};
