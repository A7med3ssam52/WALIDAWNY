import { NavLink } from 'react-router-dom';

const adminItems = [
  { to: '/admin/dashboard', label: 'الرئيسية' },
  { to: '/admin/reports', label: 'التقارير المالية' },
  { to: '/admin/audit', label: 'سجل النشاطات' },
  { to: '/admin/roles', label: 'الأدوار والصلاحيات' },
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
      <div className="mt-3 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 px-3 py-2 text-xs font-medium text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        المشرف
      </div>
    </nav>
  );
}
