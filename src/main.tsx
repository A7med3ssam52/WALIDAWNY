import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

// Enforce RTL globally — ensures document is always ar/rtl even if Helmet fails or cache restores LTR
if (typeof document !== 'undefined') {
  try {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    // body may not exist yet during module eval in some SSR contexts; guard
    if (document.body) {
      document.body.dir = 'rtl';
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) document.body.dir = 'rtl';
      });
    }
  } catch {
    // ignore — CSP sandbox or unusual environment
  }
}

// Capture async errors that ErrorBoundary cannot catch (R-06)
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
  });
  window.addEventListener('error', (event) => {
    console.error('Unhandled window error:', event.error ?? event.message, event);
  });
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
  console.error('Root element #root was not found');
  if (typeof document !== 'undefined' && document.body) {
    document.body.innerHTML =
      '<div dir="rtl" style="display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#f8fafc"><div style="max-width:480px;width:100%;background:white;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.06)"><h1 style="margin:0;font-size:18px;font-weight:700;color:#0f172a">تعذر تشغيل التطبيق</h1><p style="margin:12px 0 0;color:#64748b;font-size:14px;line-height:1.7">عنصر الجذر #root غير موجود. يرجى إعادة تحميل الصفحة أو التأكد من سلامة ملف index.html.</p><button onclick="location.reload()" style="margin-top:20px;background:#4f46e5;color:white;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer">إعادة تحميل الصفحة</button></div></div>';
  }
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
