import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: 'flutter_web/web/crypto',
    rollupOptions: {
      input: 'src/flutter_web_bridge.js',
      output: {
        entryFileNames: 'chat-crypto-bridge.js',
      },
    },
  },
});
