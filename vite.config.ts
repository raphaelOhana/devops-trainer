import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sert le site depuis https://<user>.github.io/<repo>/.
// Le workflow CI injecte BASE_PATH=/<repo>/ au build ; en local il vaut "/"
// pour que `npm run dev` fonctionne normalement sur localhost.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'DevOps Trainer',
        short_name: 'DevOps',
        description: "Entraînement DevOps hors-ligne — Docker, Kubernetes, IoT, Web.",
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        // start_url/scope/id doivent tenir compte du sous-chemin GitHub Pages.
        start_url: base,
        scope: base,
        id: base,
        icons: [
          // src relatifs (sans "/") → préfixés automatiquement par `base`.
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Le bundle contient toutes les questions (data-driven) : relever la
        // limite de précache pour que l'app reste 100% offline malgré sa taille.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Le fallback de navigation doit pointer vers l'index sous le base.
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
});
