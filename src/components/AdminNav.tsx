import { NavLink } from 'react-router-dom';

const adminItems = [
  { to: '/admin/dashboard', label: 'الرئيسية' },
  { to: '/admin/presence', label: 'المتواجدون الآن' },
  { to: '/admin/reports', label: 'التقارير المالية' },
  { to: '/admin/audit', label: 'سجل النشاطات' },
  { to: '/admin/roles', label: 'الأدوار والصلاحيات' },
  { to: '/admin/announcements', label: 'الإعلانات' },
];

const contentItems = [
  { to: '/walid/students', label: 'الطلاب' },
  { to: '/walid/grades', label: 'الصفوف' },
  { to: '/walid/curriculum', label: 'المنهج' },
  { to: '/walid/pricing', label: 'الباقات' },
  { to: '/walid/codes', label: 'الأكواد' },
];

function NavSection({ items }: { items: Array<{ to: string; label: string }> }) {
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
          {item.label}
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
