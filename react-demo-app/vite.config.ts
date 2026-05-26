import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), nodePolyfills(), basicSsl()],
  define: {
    global: 'globalThis'
  },
  server: {
    host: '172.20.10.3',
    port: 8444,
    proxy: {
      '/proxy-api': {
        target: 'https://api.inindca.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/proxy-api/, '/api')
      }
    }
  },
  build: {
    rollupOptions: {
      external: [
        'vite-plugin-node-polyfills/shims/process',
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/util',
        'vite-plugin-node-polyfills/shims/global'
      ]
    }
  }
})
