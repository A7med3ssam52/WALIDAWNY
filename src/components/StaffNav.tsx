import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  KeyRound,
  Layers,
  LayoutDashboard,
  Megaphone,
  Tag,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { useAuth } from '../features/auth/AuthContext';

interface StaffNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const allItems: StaffNavItem[] = [
  { to: '/walid/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/walid/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/walid/students', label: 'الطلاب', icon: Users },
  { to: '/walid/grades', label: 'الصفوف', icon: Layers },
  { to: '/walid/curriculum', label: 'المنهج', icon: BookOpen },
  { to: '/walid/exams', label: 'الإختبارات', icon: ClipboardList },
  { to: '/walid/general-exams', label: 'الامتحان العام', icon: Trophy },
  { to: '/walid/pricing', label: 'أسعار الوحدات', icon: Tag },
  { to: '/walid/codes', label: 'أكواد الوحدات', icon: KeyRound },
  { to: '/walid/announcements', label: 'الإعلانات', icon: Megaphone, badge: 'جديد' },
];

// Assistant scope: curriculum (read-only) + exams. Lesson assets
// (/walid/lessons/:lessonId) stay reachable via the "الملفات" link inside
// the lessons list — deliberately not a top-level nav item. Dashboard and
// all staff-only pages (reports/students/grades/pricing/codes/announcements)
// never appear here.
const assistantItems: StaffNavItem[] = [
  { to: '/walid/curriculum', label: 'المنهج', icon: BookOpen },
  { to: '/walid/exams', label: 'الإختبارات', icon: ClipboardList },
  { to: '/walid/general-exams', label: 'الامتحان العام', icon: Trophy },
];

const baseLinkClasses =
  'flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-bold transition-colors duration-200 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

function linkClasses(isActive: boolean): string {
  return isActive
    ? `${baseLinkClasses} bg-nav-active text-nav-active-foreground`
    : `${baseLinkClasses} text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground`;
}

export function StaffNav() {
  const { role } = useAuth();
  const items = role === 'assistant' ? assistantItems : allItems;
  return (
    <nav aria-label="التنقل الرئيسي" className="flex flex-col gap-1 p-3" dir="rtl">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/walid/dashboard'}
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
                {item.badge ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-sidebar-muted">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
                    {item.badge}
                  </span>
                ) : null}
                {isActive ? <span className="sr-only">(الحالية)</span> : null}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
