import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col md:ml-[220px] min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden h-14 shrink-0 flex items-center gap-3 px-4 bg-white border-b border-surface-200 no-print">
          <button
            onClick={() => setSidebarOpen(true)}
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
