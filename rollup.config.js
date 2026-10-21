import fs from 'fs';
import path from 'path';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import polyfills from 'rollup-plugin-polyfill-node';

/*
  dependencies (e.g. the HP Poly sdk vendored in softphone-vendor-headsets) can load files like wasm with
  `new URL('file', import.meta.url)`. Once inlined into the bundle, that url points beside the bundle
  instead of the original module, so emit each referenced file there and point the url at it.
  the rewritten call is kept in the literal `new URL('file', import.meta.url)` form so consumers' bundlers
  (vite, webpack 5) still recognise it and emit the file themselves.
*/
function importMetaUrlAssets () {
  const pattern = /new\s+URL\s*\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g;
  const referenceIds = new Set();

  return {
    name: 'import-meta-url-assets',
    transform (code, id) {
      if (!code.includes('import.meta.url')) {
        return null;
      }

      let changed = false;
      const transformed = code.replace(pattern, (match, quote, url) => {
        if (/^(data|https?|blob):/.test(url) || /\.(m?js|ts)$/.test(url)) {
          return match;
        }

        const file = path.resolve(path.dirname(id), url);
        if (!fs.existsSync(file)) {
          this.error(`"${url}" is loaded via import.meta.url in "${id}" but does not exist at "${file}"`);
        }

        const referenceId = this.emitFile({ type: 'asset', name: path.basename(file), source: fs.readFileSync(file) });
        referenceIds.add(referenceId);
        changed = true;
        return `new URL(import.meta.ROLLUP_FILE_URL_${referenceId}, import.meta.url)`;
      });

      return changed ? { code: transformed, map: null } : null;
    },
    resolveFileUrl ({ referenceId, relativePath }) {
      return referenceIds.has(referenceId) ? JSON.stringify(relativePath) : null;
    }
  };
}

export default {
  input: 'dist/es/index.js',
  output: {
    file: 'dist/es/index.bundle.js',
    format: 'es',
    inlineDynamicImports: true,
    assetFileNames: '[name][extname]'
  },
  global: {
    process: 'process-fast'
  },
  plugins: [
    importMetaUrlAssets(),
    commonjs({ transformMixedEsModules: true }),
    polyfills(),
    resolve({ browser: true })
  ]
};
