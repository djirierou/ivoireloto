import { defineConfig } from 'vite';

// GitHub Pages sert le site sous https://<user>.github.io/<repo>/ : tous les
// assets doivent donc être préfixés par /<repo>/. En local on reste à la racine.
// BASE_PATH est injecté par le workflow de déploiement.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Autorise les hôtes de prévisualisation (sandbox, tunnels, etc.)
    allowedHosts: true,
    cors: true,
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
