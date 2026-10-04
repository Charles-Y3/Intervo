import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' so a new version never swaps in silently mid-workout;
      // UpdatePrompt shows a banner instead.
      // Our own worker (src/sw.ts) so it can also show push notifications.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Intervo',
        short_name: 'Intervo',
        description: 'Interval timer for exercise: work, rest, rounds, with voice or silent.',
        theme_color: '#1c1b19',
        background_color: '#faf8f4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/iconMaskable512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,ico,json,webmanifest}'] },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    environment: 'node',
  },
});
