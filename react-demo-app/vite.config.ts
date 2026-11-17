import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vitejs.dev/config/
export default defineConfig({
  // Relative so the same build works under any CDN host/path (dev/test/prod, versioned or not).
  base: './',
  plugins: [react(), nodePolyfills(), basicSsl()],
  resolve: {
    alias: [
      // nodePolyfills injects shim imports into the SDK's deps too, which resolve from the SDK's
      // node_modules (via `file:..`) where the plugin isn't installed. Externalizing them instead
      // leaves bare imports in the bundle that browsers can't load.
      {
        find: /^vite-plugin-node-polyfills\/shims\/(.*)$/,
        replacement: fileURLToPath(new URL('./node_modules/vite-plugin-node-polyfills/shims/$1', import.meta.url))
      }
    ]
  },
  define: {
    global: 'globalThis'
  },
  server: {
    host: 'localhost',
    port: 8443
  }
})
