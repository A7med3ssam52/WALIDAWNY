import { NavLink } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Lightbulb,
  PackageOpen,
  User,
  type LucideIcon,
} from 'lucide-react';

interface StudentNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  isNew?: boolean;
}

const items: StudentNavItem[] = [
  { to: '/student/dashboard', label: 'لوحة الطالب', icon: LayoutDashboard, end: true },
  { to: '/student/curriculum', label: 'المنهج الدراسي', icon: BookOpen },
  { to: '/student/exams', label: 'امتحانات الصف', icon: ClipboardList },
  { to: '/student/units', label: 'وحداتي', icon: PackageOpen },
  { to: '/student/notifications', label: 'الإشعارات', icon: Bell },
  { to: '/student/suggestions', label: 'المقترحات', icon: Lightbulb },
  { to: '/student/profile', label: 'الملف', icon: User },
];

const baseLinkClasses =
  'group flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-bold transition-colors duration-200 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

function linkClasses(isActive: boolean): string {
  return isActive
    ? `${baseLinkClasses} bg-nav-active text-nav-active-foreground`
    : `${baseLinkClasses} text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground`;
}

export function StudentNav() {
  return (
    <nav aria-label="القائمة الرئيسية" className="flex flex-col gap-1 p-3" dir="rtl">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            aria-current={undefined}
            className={({ isActive }) => linkClasses(isActive)}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isActive ? 'bg-black/25 text-primary-strong' : 'text-sidebar-muted group-hover:text-sidebar-foreground'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.isNew ? (
                  <span aria-label="جديد" className="h-2 w-2 shrink-0 rounded-full bg-primary" />
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
