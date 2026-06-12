import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Recherche' },
  { to: '/goals', label: 'Goals' },
  { to: '/goals/log', label: 'Goals Log' },
  { to: '/collections', label: 'Collections' },
  { to: '/comparator', label: 'Comparateur' },
  { to: '/scraper', label: 'Scraper' },
]

export default function Navbar() {
  return (
    <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
        <NavLink to="/" className="text-lg font-bold text-gray-100">
          <span className="text-blue-400">Skills</span>Hub
        </NavLink>
        <div className="flex items-center gap-4 overflow-x-auto">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/' || link.to === '/goals'}
              className={({ isActive }) =>
                `text-sm py-4 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
