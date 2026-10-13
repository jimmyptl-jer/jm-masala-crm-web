// Vite configuration for the web app: build tool and dev server settings.
// `npm run dev` starts the dev server on http://localhost:5173; `npm run build` (tsc type-check, then vite
// build) writes the static site to dist/, which web/Dockerfile copies into nginx.
// Environment variables are read from web/.env (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
// VITE_API_URL, VITE_AUTH_BYPASS; see .env.example and src/vite-env.d.ts). Only variables that start with
// VITE_ reach the browser bundle.

import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Enables the React plugin: JSX/TSX compilation and fast refresh (live reload of components) in dev.
  plugins: [react()],
  // Makes the import prefix '@/' point at src/, so code can write import { api } from '@/lib/api'.
  // tsconfig.json has the matching `paths` entry so TypeScript understands it too. import.meta.dirname is
  // this folder (needs Node 20.11+).
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // Dev server only (npm run dev). Port 5173 is the address the API's CORS_ORIGINS and the README expect.
  // host: true listens on all network interfaces, so the app can be opened from a phone on the same Wi-Fi.
  // There is no proxy: the browser calls the API directly at VITE_API_URL.
  server: { port: 5173, host: true },
});
