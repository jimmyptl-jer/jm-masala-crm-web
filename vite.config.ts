// Vite configuration for the web app: build tool and dev server settings.
// `npm run dev` starts the dev server on http://localhost:5173; `npm run build` (tsc type-check, then vite
// build) writes the static site to dist/, which web/Dockerfile copies into nginx.
// Environment variables are read from web/.env (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
// VITE_API_URL, VITE_AUTH_BYPASS; see .env.example and src/vite-env.d.ts). Only variables that start with
// VITE_ reach the browser bundle.

import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // A production build without VITE_API_URL would ship the sample-data demo as if it were the real app, so it fails
  // unless the demo is asked for explicitly with VITE_DEMO=true (see .env.example).
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  if (mode === 'production' && !env.VITE_API_URL && env.VITE_DEMO !== 'true') {
    throw new Error('VITE_API_URL is not set. A production build needs the API address (e.g. https://api.example.com/api/v1). To build the sample-data demo on purpose, set VITE_DEMO=true.');
  }
  return {
  // Enables the React plugin: JSX/TSX compilation and fast refresh (live reload of components) in dev.
  plugins: [
    react(),
    // Restarts the dev server when tailwind.config.js changes. Tailwind only reads its config at start-up, so without
    // this a running `npm run dev` keeps the old colours and new classes such as bg-brand produce no style at all
    // (for example white button text on a cream page).
    {
      name: 'restart-on-tailwind-config',
      configureServer(server) {
        const file = path.resolve(import.meta.dirname, 'tailwind.config.js');
        server.watcher.add(file);
        server.watcher.on('change', (changed) => { if (path.resolve(changed) === file) void server.restart(); });
      },
    },
  ],
  // Makes the import prefix '@/' point at src/, so code can write import { api } from '@/lib/api'.
  // tsconfig.json has the matching `paths` entry so TypeScript understands it too. import.meta.dirname is
  // this folder (needs Node 20.11+).
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // Dev server only (npm run dev). Port 5173 is the address the API's CORS_ORIGINS, the Supabase redirect URLs and the README expect; strictPort makes it fail loudly instead of starting on another port that CORS would then block.
  // host: true listens on all network interfaces, so the app can be opened from a phone on the same Wi-Fi.
  // There is no proxy: the browser calls the API directly at VITE_API_URL.
  server: { port: 5173, strictPort: true, host: true },
};
});
