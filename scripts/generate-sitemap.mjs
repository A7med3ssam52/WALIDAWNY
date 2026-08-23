#!/usr/bin/env node
/**
 * Generate sitemap.xml dynamically — reads SITE_URL and public routes.
 * Usage: node scripts/generate-sitemap.mjs
 * Output: dist/sitemap.xml and public/sitemap.xml (kept in sync)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function getSiteUrl() {
  const fromEnv = process.env.VITE_SITE_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  // fallback read .env.local/.env.production if present
  for (const envFile of ['.env.local', '.env.production', '.env']) {
    try {
      const content = fs.readFileSync(path.join(root, envFile), 'utf8');
      const match = content.match(/VITE_SITE_URL\s*=\s*(.+)/);
      if (match) {
        const val = match[1].trim().replace(/^["']|["']$/g, '').replace(/\/$/, '');
        if (val) return val;
      }
    } catch {}
  }
  return 'https://walidawny.com';
}

const SITE_URL = getSiteUrl();
const today = new Date().toISOString().slice(0, 10);

const routes = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/how-it-works', changefreq: 'monthly', priority: '0.7' },
  { path: '/subjects', changefreq: 'weekly', priority: '0.8' },
  { path: '/subjects/first-prep', changefreq: 'monthly', priority: '0.6' },
  { path: '/subjects/second-prep', changefreq: 'monthly', priority: '0.6' },
  { path: '/subjects/third-prep', changefreq: 'weekly', priority: '0.7' },
  { path: '/subjects/first-secondary', changefreq: 'monthly', priority: '0.6' },
  { path: '/subjects/second-secondary', changefreq: 'monthly', priority: '0.5' },
  { path: '/subjects/third-secondary', changefreq: 'monthly', priority: '0.5' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.8' },
  { path: '/faq', changefreq: 'monthly', priority: '0.7' },
  { path: '/contact', changefreq: 'yearly', priority: '0.6' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
];

function buildXml() {
  const urls = routes
    .map(
      (r) =>
        `  <url><loc>${SITE_URL}${r.path}</loc><lastmod>${today}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const xml = buildXml();
const outputs = [path.join(root, 'public', 'sitemap.xml'), path.join(root, 'dist', 'sitemap.xml')];
for (const out of outputs) {
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, xml, 'utf8');
    console.log(`✅ sitemap written: ${path.relative(root, out)} (${routes.length} urls, site=${SITE_URL})`);
  } catch (err) {
    // dist may not exist yet during pre-build — only warn
    if (out.includes('dist')) {
      console.warn(`⚠️  could not write ${out}: ${err.message}`);
    } else {
      throw err;
    }
  }
}
