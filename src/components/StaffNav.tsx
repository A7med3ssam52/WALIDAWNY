import { NavLink } from 'react-router-dom';

import { Badge } from './Badge';

const items: Array<{ to: string; label: string; badge?: string }> = [
  { to: '/walid/dashboard', label: 'الرئيسية' },
  { to: '/walid/reports', label: 'التقارير', badge: 'جديد' },
  { to: '/walid/students', label: 'الطلاب' },
  { to: '/walid/grades', label: 'الصفوف' },
  { to: '/walid/curriculum', label: 'المنهج' },
  { to: '/walid/exams', label: 'الإختبارات' },
  { to: '/walid/pricing', label: 'أسعار الوحدات' },
  { to: '/walid/codes', label: 'أكواد الوحدات' },
];

export function StaffNav() {
  return (
    <nav aria-label="التنقل الرئيسي" className="flex flex-col gap-1 p-3">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/walid/dashboard'}
          className={({ isActive }) =>
            `rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              isActive
                ? 'nav-pill-active font-bold text-white'
                : 'text-foreground-muted hover:bg-white/6 hover:text-foreground'
            }`
          }
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span>{item.label}</span>
            {item.badge ? (
              <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px] font-bold leading-5">
                {item.badge}
              </Badge>
            ) : null}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
