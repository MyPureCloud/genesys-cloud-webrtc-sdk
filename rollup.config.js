import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import polyfills from 'rollup-plugin-polyfill-node';

export default {
  input: 'dist/es/index.js',
  output: {
    file: 'dist/es/index.bundle.js',
    format: 'es',
    inlineDynamicImports: true
  },
  global: {
    process: 'process-fast'
  },
  plugins: [
    commonjs({ transformMixedEsModules: true }),
    polyfills(),
    resolve({ browser: true })
  ]
};
