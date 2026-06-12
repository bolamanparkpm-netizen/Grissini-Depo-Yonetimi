import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      // Başarılı girişte App.jsx yönlendirme yapar
    } catch (err) {
      setError('Giriş başarısız. E-posta veya şifreyi kontrol edin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo alanı */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🥖</div>
          <h1 className="text-2xl font-bold text-amber-900">Grissini Depo</h1>
          <p className="text-amber-700 text-sm mt-1">Yönetim Sistemi</p>
        </div>

        {/* Giriş formu */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-amber-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-posta
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-amber-500
                           text-base"
                placeholder="kullanici@firma.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-amber-500
                           text-base"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {/* Hata mesajı */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3
                              text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300
                         text-white font-medium py-3 rounded-lg transition-colors
                         text-base"
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
} 
