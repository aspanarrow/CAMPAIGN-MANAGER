'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const navigation = [
  { name: 'Campaigns', href: '/campaigns', icon: '📊' },
  { name: 'Create Campaign', href: '/campaigns/new', icon: '➕' },
  { name: 'Profit', href: '/profit', icon: '💰' },
  { name: 'Approvals', href: '/approvals', icon: '✅' },
  { name: 'Automation', href: '/automation', icon: '⚙️' },
  { name: 'Analytics', href: '/analytics', icon: '📈' },
  { name: 'Setup Guide', href: '/setup-guide', icon: '📚' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout, isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/campaigns" className="flex items-center space-x-2 group">
                <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-accent-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:shadow-xl transition-shadow">
                  G
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                  Glowify
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                      flex items-center space-x-2
                      ${
                        isActive
                          ? 'bg-primary-600 text-white shadow-md'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-primary-600'
                      }
                    `}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center space-x-4">
              <button
                onClick={logout}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200">
              <nav className="flex flex-col space-y-1">
                {navigation.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`
                        px-4 py-3 rounded-lg text-sm font-medium transition-all
                        flex items-center space-x-3
                        ${
                          isActive
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                        }
                      `}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 text-left"
                >
                  Logout
                </button>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

