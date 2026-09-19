import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { getUnreadSuggestionsCount } from '../data/rpc';

interface AdminNavItem {
  to: string;
  label: string;
  unreadBadge?: boolean;
}

const adminItems: AdminNavItem[] = [
  { to: '/admin/dashboard', label: 'الرئيسية' },
  { to: '/admin/presence', label: 'المتواجدون الآن' },
  { to: '/admin/reports', label: 'التقارير المالية' },
  { to: '/admin/audit', label: 'سجل النشاطات' },
  { to: '/admin/roles', label: 'الأدوار والصلاحيات' },
  { to: '/admin/announcements', label: 'الإعلانات' },
  { to: '/admin/suggestions', label: 'المقترحات', unreadBadge: true },
];

const contentItems = [
  { to: '/walid/students', label: 'الطلاب' },
  { to: '/walid/grades', label: 'الصفوف' },
  { to: '/walid/curriculum', label: 'المنهج' },
  { to: '/walid/general-exams', label: 'الامتحان العام' },
  { to: '/walid/pricing', label: 'الباقات' },
  { to: '/walid/codes', label: 'الأكواد' },
];

/** Unread-suggestions pill for the inbox link (0079). Clears on view. */
function SuggestionsUnreadBadge() {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  const clearedRef = useRef(false);

  const refresh = useCallback(async () => {
    clearedRef.current = false;
    try {
      const { unreadCount } = await getUnreadSuggestionsCount();
      // A view that lands while this fetch is in flight wins.
      if (!clearedRef.current) {
        setCount(unreadCount);
      }
    } catch {
      // non-fatal: badge simply stays hidden
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const handler = () => {
      clearedRef.current = true;
      setCount(0);
    };
    window.addEventListener('suggestions-seen', handler);
    return () => window.removeEventListener('suggestions-seen', handler);
  }, []);

  if (count <= 0) return null;
  return (
    <span
      data-testid="suggestions-unread-badge"
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[11px] font-bold text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function NavSection({ items }: { items: AdminNavItem[] }) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/admin/dashboard'}
          className={({ isActive }) =>
            `rounded-xl px-3 py-3 text-sm font-bold transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              isActive
                ? 'nav-pill-active text-white shadow-[0_8px_20px_-8px_rgba(99,102,241,0.5)]'
                : 'text-foreground-muted hover:bg-white/6 hover:text-foreground hover:translate-x-0.5'
            }`
          }
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span>{item.label}</span>
            {item.unreadBadge ? <SuggestionsUnreadBadge /> : null}
          </span>
        </NavLink>
      ))}
    </>
  );
}

export function AdminNav() {
  return (
    <nav aria-label="التنقل الرئيسي (المشرف)" className="flex flex-col gap-1 p-3">
      <NavSection items={adminItems} />
      <div className="my-2 border-t border-white/8" />
      <p className="px-3 pb-1 text-xs font-medium text-foreground-subtle">إدارة المحتوى</p>
      <NavSection items={contentItems} />
    </nav>
  );
}
