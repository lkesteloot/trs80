import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.ts',
  output: {
    file: 'docs/index.js',
    format: 'iife'
  },
  plugins: [
      nodeResolve(),
      typescript()
  ]
};
