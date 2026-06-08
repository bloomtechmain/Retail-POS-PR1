import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        mobileOpen={mobileOpen}
        desktopOpen={desktopOpen}
        onMobileClose={() => setMobileOpen(false)}
        onDesktopToggle={() => setDesktopOpen(false)}
      />

      {/* Button to reopen sidebar on desktop when hidden */}
      {!desktopOpen && (
        <button
          onClick={() => setDesktopOpen(true)}
          className="hidden md:flex fixed left-0 top-5 z-50 items-center justify-center w-7 h-8 bg-white border border-l-0 border-surface-200 rounded-r-lg shadow-md text-surface-500 hover:text-primary-600 transition-colors"
          title="Show sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${desktopOpen ? 'md:ml-[220px]' : 'md:ml-0'}`}>
        {/* Mobile top bar */}
        <header className="md:hidden h-14 shrink-0 flex items-center gap-3 px-4 bg-white border-b border-surface-200 no-print">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg overflow-hidden shadow-sm">
              <img src="/logo.png" alt="BloomPOS" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-surface-900 text-sm">BloomPOS</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`p-4 md:p-6 ${className}`}>
      {children}
    </div>
  );
}
