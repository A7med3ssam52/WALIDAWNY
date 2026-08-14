import { NavLink } from 'react-router-dom';

const items = [
  { to: '/walid/dashboard', label: 'الرئيسية' },
  { to: '/walid/students', label: 'الطلاب' },
  { to: '/walid/grades', label: 'الصفوف' },
  { to: '/walid/curriculum', label: 'المنهج' },
  { to: '/walid/exams', label: 'الإختبارات' },
  { to: '/walid/codes', label: 'الأكواد' },
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
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
