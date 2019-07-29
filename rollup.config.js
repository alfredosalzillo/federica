import typescript from 'rollup-plugin-typescript2';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload'
import nodeResolve from "rollup-plugin-node-resolve";
import { DEFAULT_EXTENSIONS } from "@babel/core";
import babel from 'rollup-plugin-babel';
import pkg from './package.json';
import tsConfig from './tsconfig.json';

export default {
  input: './src/main.ts',
  output: [
    {
      file: pkg.main,
      format: 'esm'
    },
  ],
  plugins: [
    nodeResolve({ browser: true }),
    typescript(tsConfig),
    babel({
      extensions: [
        ...DEFAULT_EXTENSIONS,
        '.ts',
        '.tsx'
      ]
    }),
    serve({
      contentBase: ['./dist', './static'],
    }),
    livereload(),
  ]
}
