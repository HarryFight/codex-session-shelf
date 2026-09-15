import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // The production UI lives below a per-launch token path, not at the host root.
  // Relative asset URLs keep the iframe inside that authenticated prefix.
  base: './',
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4174',
        rewrite: (pathname) => `/dev${pathname}`,
      },
    },
  },
});
