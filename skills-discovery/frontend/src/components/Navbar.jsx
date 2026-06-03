import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const navLinks = [
  { to: '/', label: 'Search' },
  { to: '/goals', label: 'Goal Decomposition' },
  { to: '/collections', label: 'Collections' },
  { to: '/comparator', label: 'Comparator' },
  { to: '/scraper', label: 'Scraper' },
]

export default function Navbar() {
  const location = useLocation()

  return (
    <nav className="bg-gray-950 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link to="/" className="flex items-center gap-2 flex-shrink-0 group">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white text-sm">
              S
            </div>
            <span className="text-white font-bold text-xl tracking-tight group-hover:text-indigo-400 transition-colors">
              SkillsHub
            </span>
          </Link>

          <div className="flex items-center gap-1 flex-wrap">
            {navLinks.map(({ to, label }) => {
              const isActive = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
