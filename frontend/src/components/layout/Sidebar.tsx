import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { useT } from '../../i18n/translations';

export function Sidebar() {
  const { user, logout, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const { lang, toggleLang } = useLanguageStore();
  const t = useT();

  const navItems = [
    { path: '/dashboard', label: t.nav_dashboard, roles: ['admin', 'manager'], icon: (
      <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )},
    { path: '/pos', label: t.nav_pos, roles: undefined, icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )},
    { path: '/products', label: t.nav_products, roles: ['admin', 'manager'], icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )},
    { path: '/inventory', label: t.nav_inventory, roles: ['admin', 'manager'], icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    )},
    { path: '/grn', label: t.nav_grn, roles: ['admin', 'manager'], icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l-3-3m3 3l3-3" />
      </svg>
    )},
    { path: '/promotions', label: t.nav_promotions, roles: ['admin', 'manager'], icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    )},
    { path: '/reports', label: t.nav_reports, roles: ['admin', 'manager'], icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )},
    { path: '/shifts', label: t.nav_shifts, roles: undefined, icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
    { path: '/users', label: t.nav_users, roles: ['admin'], icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    )},
  ];

  const visibleItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(user?.role_name || '');
  });

  const initials = user?.name?.charAt(0).toUpperCase() ?? '?';

  return (
    <aside
      className="fixed left-0 top-0 h-full w-[220px] flex flex-col z-40 no-print"
      style={{
        background: 'linear-gradient(180deg, #0d1526 0%, #0f172a 40%, #0c1322 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5">
          {/* Logo */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-md overflow-hidden">
            <img src="/logo.png" alt="BloomPOS" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold tracking-wide text-white">BloomPOS</div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.7)' }}>v1.0</div>
          </div>
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            title={lang === 'en' ? 'Switch to Sinhala' : 'Switch to English'}
            className="shrink-0 flex items-center gap-0.5 px-1.5 py-1 rounded-md transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
          >
            <span className={`text-[10px] font-bold transition-colors ${lang === 'en' ? 'text-white' : 'text-slate-500'}`}>EN</span>
            <span className="text-slate-600 text-[10px] mx-0.5">|</span>
            <span className={`text-[10px] font-bold transition-colors ${lang === 'si' ? 'text-white' : 'text-slate-500'}`}>සි</span>
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white'
              }`
            }
            style={({ isActive }) => isActive ? {
              background: 'linear-gradient(90deg, rgba(2,132,199,0.85) 0%, rgba(14,165,233,0.65) 100%)',
              boxShadow: '0 2px 8px rgba(2,132,199,0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
            } : {
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!(e.currentTarget as HTMLElement).classList.contains('text-white') ||
                  (e.currentTarget as HTMLElement).style.background === 'transparent') {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
              }
            }}
            onMouseLeave={(e) => {
              // Let React re-render handle active styling; only reset non-active
              const el = e.currentTarget as HTMLElement;
              if (!el.style.boxShadow) {
                el.style.background = 'transparent';
              }
            }}
          >
            <span className="shrink-0 opacity-90">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          {/* Avatar with gradient */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0369a1 100%)' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 capitalize">{user?.role_name}</div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            title="Logout"
            className="text-slate-500 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
