import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Navigasyon menüsü tanımları
const navItems = [
  { to: '/',           icon: '📊', label: 'Genel Bakış' },
  { to: '/production', icon: '🏭', label: 'Üretim' },
  { to: '/quality',    icon: '🧪', label: 'Kalite' },
  { to: '/sales',      icon: '🚚', label: 'Satış & Sevk' },
  { to: '/consumption',icon: '✅', label: 'Tüketim' },
  { to: '/history',    icon: '📋', label: 'Geçmiş' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Üst başlık */}
      <header className="bg-amber-600 text-white shadow-md sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">🥖 Grissini</span>
            <span className="text-amber-200 text-sm hidden sm:block">Depo Yönetimi</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-amber-100 text-xs hidden sm:block">
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="text-amber-100 hover:text-white text-sm px-2 py-1
                         rounded border border-amber-400 hover:border-white
                         transition-colors"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* Ana içerik */}
      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      {/* Alt navigasyon — mobil öncelikli */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200
                      z-40 safe-area-inset-bottom">
        <div className="flex justify-around items-stretch h-16">
          {navItems.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 text-xs gap-0.5
                 transition-colors
                 ${isActive
                   ? 'text-amber-600 bg-amber-50'
                   : 'text-gray-500 hover:text-gray-700'
                 }`
              }
            >
              <span className="text-lg leading-none">{icon}</span>
              <span className="leading-tight text-center">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
} 
