/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'inject-csp',
      apply: 'build',
      transformIndexHtml(html) {
        if (mode !== 'production') return html;
        const csp = [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: https://*.b-cdn.net",
          "media-src 'self' blob: https://*.b-cdn.net",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://video.bunnycdn.com https://*.b-cdn.net",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        return html.replace(
          '<meta name="theme-color" content="#047857" />',
          '<meta name="theme-color" content="#047857" />\n    <meta http-equiv="Content-Security-Policy" content="' +
            csp +
            '" />',
        );
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
