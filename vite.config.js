import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
    },
    proxy: {
      // Proxy pour contourner CORS vers lotobonheur.ci
      '/lonaci-proxy': {
        target: 'https://lotobonheur.ci',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lonaci-proxy/, '/resultats'),
        secure: false,
      },
      '/api/lonaci': {
        target: 'https://lotobonheur.ci',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/lonaci/, '/resultats'),
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
});
