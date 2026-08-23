import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

import {
  getBreadcrumbJsonLd,
  getCanonical,
  getOrganizationJsonLd,
  getWebSiteJsonLd,
  isNoIndexPath,
  OG_IMAGE,
  SITE_NAME,
  THEME_COLOR,
} from '../lib/seo';
import type { BreadcrumbItem, FaqItem } from '../lib/seo';
import { getFaqJsonLd } from '../lib/seo';

interface SeoHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  canonical?: string;
  keywords?: string;
  robots?: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  faqs?: FaqItem[];
  breadcrumbs?: BreadcrumbItem[];
  /** extra JSON-LD objects to inject (e.g., Course, FAQ) */
  extraJsonLd?: (Record<string, unknown> | null | undefined)[];
}

export function SeoHead({
  title,
  description,
  canonicalPath,
  canonical,
  keywords,
  robots,
  ogType = 'website',
  ogImage = OG_IMAGE,
  ogImageAlt = `${SITE_NAME} — منصة تعليمية`,
  noIndex,
  jsonLd,
  faqs,
  breadcrumbs,
  extraJsonLd,
}: SeoHeadProps) {
  const location = useLocation();
  const pathname = canonicalPath ?? location.pathname;
  const canonicalUrl = canonical ?? getCanonical(pathname);
  const shouldNoIndex = noIndex ?? isNoIndexPath(pathname);
  const robotsContent =
    robots ?? (shouldNoIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

  const gscVerification = (import.meta.env.VITE_GSC_VERIFICATION as string | undefined)?.trim();
  const ga4Id = (import.meta.env.VITE_GA4_ID as string | undefined)?.trim();

  // Build JSON-LD array: Organization + WebSite on home only (to avoid duplicate globally? We'll include globally but safe)
  // Plan says Organization global on every page — so include it always via static + dynamic.
  // We'll include Organization + WebSite dynamically for home, but also include for all to be safe if static missing.
  const jsonLdArray: Record<string, unknown>[] = [];

  // Normalize jsonLd prop to array
  if (jsonLd) {
    if (Array.isArray(jsonLd)) jsonLdArray.push(...jsonLd);
    else jsonLdArray.push(jsonLd);
  }

  // If extraJsonLd provided
  if (extraJsonLd) {
    for (const item of extraJsonLd) {
      if (item) jsonLdArray.push(item);
    }
  }

  // FAQ JSON-LD if faqs provided
  if (faqs && faqs.length > 0) {
    jsonLdArray.push(getFaqJsonLd(faqs));
  }

  // Breadcrumbs JSON-LD if provided
  if (breadcrumbs && breadcrumbs.length > 0) {
    jsonLdArray.push(getBreadcrumbJsonLd(breadcrumbs));
  }

  // On home, ensure Organization + WebSite are present (fallback if not already in index.html Helmet duplicate is okay)
  // We keep them static in index.html, but also inject via Helmet for SPA navigations
  const isHome = pathname === '/';
  if (isHome) {
    // Only inject if not already in array (check @type)
    const hasOrg = jsonLdArray.some((o) => (o as { '@type'?: unknown })['@type'] === 'EducationalOrganization');
    const hasSite = jsonLdArray.some((o) => (o as { '@type'?: unknown })['@type'] === 'WebSite');
    if (!hasOrg) jsonLdArray.unshift(getOrganizationJsonLd() as unknown as Record<string, unknown>);
    if (!hasSite) jsonLdArray.splice(1, 0, getWebSiteJsonLd() as unknown as Record<string, unknown>);
  } else {
    // For non-home, ensure Organization is present for E-E-A-T signals
    const hasOrg = jsonLdArray.some((o) => (o as { '@type'?: unknown })['@type'] === 'EducationalOrganization');
    if (!hasOrg) jsonLdArray.unshift(getOrganizationJsonLd() as unknown as Record<string, unknown>);
  }

  return (
    <Helmet>
      <html lang="ar" dir="rtl" />
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords ? <meta name="keywords" content={keywords} /> : null}
      <meta name="robots" content={robotsContent} />
      <meta name="theme-color" content={THEME_COLOR} />
      <meta name="language" content="Arabic" />
      <link rel="canonical" href={canonicalUrl} />
      {/* hreflang */}
      <link rel="alternate" href={canonicalUrl} hrefLang="ar-EG" />
      <link rel="alternate" href={canonicalUrl} hrefLang="x-default" />
      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:locale" content="ar_EG" />
      <meta property="og:locale:alternate" content="en_US" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={ogImageAlt} />
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={ogImageAlt} />
      {/* GSC verification if set */}
      {gscVerification ? <meta name="google-site-verification" content={gscVerification} /> : null}
      {/* GA4 — injected as script tags via Helmet */}
      {ga4Id ? (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} />
          <script>{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');`}</script>
        </>
      ) : null}
      {/* JSON-LD blocks */}
      {jsonLdArray.map((data, i) => (
        <script key={`ld-${i}`} type="application/ld+json">
          {JSON.stringify(data)}
        </script>
      ))}
    </Helmet>
  );
}
