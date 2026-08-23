import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { SITE_URL } from '../lib/seo';
import type { BreadcrumbItem } from '../lib/seo';
import { getBreadcrumbJsonLd } from '../lib/seo';
import { JsonLd } from './JsonLd';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const allItems: BreadcrumbItem[] = [{ name: 'الرئيسية', url: SITE_URL + '/' }, ...items];
  const jsonLd = getBreadcrumbJsonLd(allItems);

  return (
    <>
      <JsonLd data={jsonLd as unknown as Record<string, unknown>} />
      <nav aria-label="مسار التنقل" className={className ?? 'flex items-center gap-1 text-xs text-foreground-muted'}>
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link to="/" className="hover:text-primary transition-colors">
              الرئيسية
            </Link>
          </li>
          {items.map((item) => {
            const isLast = item.url === items[items.length - 1].url;
            // Convert absolute URL to path for internal Link when possible
            const path = item.url.startsWith(SITE_URL) ? item.url.slice(SITE_URL.length) || '/' : item.url;
            return (
              <li key={item.url} className="flex items-center gap-1">
                <ChevronLeft aria-hidden="true" className="h-3 w-3 shrink-0 text-foreground-subtle" />
                {isLast ? (
                  <span aria-current="page" className="font-medium text-foreground">
                    {item.name}
                  </span>
                ) : (
                  <Link to={path} className="hover:text-primary transition-colors">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
