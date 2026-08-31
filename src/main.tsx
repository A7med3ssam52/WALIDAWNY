import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

// Enforce RTL globally — ensures document is always ar/rtl even if Helmet fails or cache restores LTR
if (typeof document !== 'undefined') {
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
  // body may not exist yet during module eval in some SSR contexts; guard
  if (document.body) {
    document.body.dir = 'rtl';
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.dir = 'rtl';
    });
  }
}

registerServiceWorker();

// Web Vitals — send to GA4 if configured, otherwise console (P-07)
if (typeof window !== 'undefined') {
  void import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
    const ga4Id = (import.meta.env.VITE_GA4_ID as string | undefined)?.trim();
    const send = (metric: { name: string; value: number; id: string; rating: string }) => {
      if (ga4Id && typeof (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag === 'function') {
        (window as unknown as { gtag: (...args: unknown[]) => void }).gtag('event', metric.name, {
          value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
          metric_id: metric.id,
          metric_value: metric.value,
          metric_rating: metric.rating,
        });
      } else if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[web-vitals]', metric);
      }
    };
    onCLS(send);
    onINP(send);
    onLCP(send);
    onFCP(send);
    onTTFB(send);
  }).catch(() => {});
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
