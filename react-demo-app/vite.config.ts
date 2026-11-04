import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

// The polyfill plugin injects `vite-plugin-node-polyfills/shims/*` imports into every module, including the SDK and its
// dependencies linked from outside this folder (`file:..`), where that package cannot be resolved. Point the imports at
// this app's copy so the production build bundles them.
const polyfillShim = (name: string) =>
  fileURLToPath(new URL(`./node_modules/vite-plugin-node-polyfills/shims/${name}/dist/index.js`, import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), nodePolyfills(), basicSsl()],
  define: {
    global: 'globalThis'
  },
  resolve: {
    alias: [
      { find: 'vite-plugin-node-polyfills/shims/buffer', replacement: polyfillShim('buffer') },
      { find: 'vite-plugin-node-polyfills/shims/global', replacement: polyfillShim('global') },
      { find: 'vite-plugin-node-polyfills/shims/process', replacement: polyfillShim('process') }
    ]
  },
  server: {
    host: 'localhost',
    port: 8443
  },
  optimizeDeps: {
    exclude: ['genesys-iris-client']
  }
})
