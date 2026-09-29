import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Camera,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Radio,
  ShieldCheck,
  Tag,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { getUnreadSuggestionsCount, listMyNotifications } from '../data/rpc';

interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  unreadBadge?: boolean;
  avatarBadge?: boolean;
}

const adminItems: AdminNavItem[] = [
  { to: '/admin/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/admin/notifications', label: 'إشعارات الصور', icon: Camera, avatarBadge: true },
  { to: '/admin/presence', label: 'المتواجدون الآن', icon: Radio },
  { to: '/admin/reports', label: 'التقارير المالية', icon: BarChart3 },
  { to: '/admin/audit', label: 'سجل النشاطات', icon: History },
  { to: '/admin/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck },
  { to: '/admin/announcements', label: 'الإعلانات', icon: Megaphone },
  { to: '/admin/suggestions', label: 'المقترحات', icon: Lightbulb, unreadBadge: true },
];

const contentItems: AdminNavItem[] = [
  { to: '/walid/students', label: 'الطلاب', icon: Users },
  { to: '/walid/grades', label: 'الصفوف', icon: Layers },
  { to: '/walid/curriculum', label: 'المنهج', icon: BookOpen },
  { to: '/walid/general-exams', label: 'الامتحان العام', icon: Trophy },
  { to: '/walid/pricing', label: 'الباقات', icon: Tag },
  { to: '/walid/codes', label: 'الأكواد', icon: KeyRound },
];

const baseLinkClasses =
  'flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-bold transition-colors duration-200 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

function linkClasses(isActive: boolean): string {
  return isActive
    ? `${baseLinkClasses} bg-nav-active text-nav-active-foreground`
    : `${baseLinkClasses} text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground`;
}

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
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Unread avatar-update pill (0087). Counts own unread avatar_updated rows. */
function AvatarUnreadBadge() {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    void listMyNotifications()
      .then((rows) => {
        if (active) {
          setCount(rows.filter((row) => row.type === 'avatar_updated' && !row.is_read).length);
        }
      })
      .catch(() => {
        // non-fatal: badge simply stays hidden
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  if (count <= 0) return null;
  return (
    <span
      data-testid="avatar-unread-badge"
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function NavSection({ items }: { items: AdminNavItem[] }) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin/dashboard'}
            className={({ isActive }) => linkClasses(isActive)}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isActive ? 'bg-black/25 text-primary-strong' : 'text-sidebar-muted'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.unreadBadge ? <SuggestionsUnreadBadge /> : null}
                {item.avatarBadge ? <AvatarUnreadBadge /> : null}
                {isActive ? <span className="sr-only">(الحالية)</span> : null}
              </>
            )}
          </NavLink>
        );
      })}
    </>
  );
}

export function AdminNav() {
  return (
    <nav aria-label="التنقل الرئيسي (المشرف)" className="flex flex-col gap-1 p-3" dir="rtl">
      <NavSection items={adminItems} />
      <div className="my-2 border-t border-white/10" />
      <p className="px-3 pb-1 text-xs font-medium text-sidebar-muted">إدارة المحتوى</p>
      <NavSection items={contentItems} />
    </nav>
  );
}
