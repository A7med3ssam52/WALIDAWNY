/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // CSP is now delivered as HTTP header via vercel.json (see T-05)
    // Removed broken inject-csp plugin that searched for #047857 (non-existent) and used script-src 'self' without unsafe-inline.
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          ui: ['lucide-react'],
          hls: ['hls.js'],
        },
      },
    },
  },
  define:
    mode === 'test'
      ? {
          'import.meta.env.VITE_SUPABASE_URL': '"https://test-project.supabase.co"',
          'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"test-publishable-key"',
        }
      : {},
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 30000,
    maxWorkers: 1,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    env: {
      VITE_SUPABASE_URL: 'https://test-project.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    },
  },
}));
