import { NavLink } from 'react-router-dom';
import { Bell, BookOpen, LayoutDashboard, PackageOpen, User, type LucideIcon } from 'lucide-react';

interface StudentNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const items: StudentNavItem[] = [
  { to: '/student/dashboard', label: 'لوحة الطالب', icon: LayoutDashboard, end: true },
  { to: '/student/curriculum', label: 'المنهج الدراسي', icon: BookOpen },
  { to: '/student/units', label: 'وحداتي', icon: PackageOpen },
  { to: '/student/notifications', label: 'الإشعارات', icon: Bell },
  { to: '/student/profile', label: 'الملف', icon: User },
];

const linkClasses = (isActive: boolean) =>
  [
    'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
    isActive
      ? 'nav-pill-active font-bold text-white'
      : 'text-foreground-muted hover:bg-white/6 hover:text-foreground',
  ].join(' ');

export function StudentNav() {
  return (
    <nav aria-label="القائمة الرئيسية" className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => linkClasses(isActive)}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
                    isActive ? 'text-white' : 'text-foreground-subtle'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
