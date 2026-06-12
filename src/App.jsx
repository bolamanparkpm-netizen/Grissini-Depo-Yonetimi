import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Production from './pages/Production'
import Sales from './pages/Sales'
import Consumption from './pages/Consumption'
import History from './pages/History'
import Quality from './pages/Quality'

export default function App() {
  const { user, loading } = useAuth()

  // Oturum kontrolü yapılıyor
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent
                          rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Giriş sayfası */}
      <Route
        path="/Login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />

      {/* Korumalı sayfalar — Layout içinde */}
      <Route element={<ProtectedRoute user={user}><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="production" element={<Production />} />
	<Route path="quality" element={<Quality />} />
        <Route path="sales" element={<Sales />} />
        <Route path="consumption" element={<Consumption />} />
        <Route path="history" element={<History />} />
      </Route>

      {/* Bilinmeyen yolları ana sayfaya yönlendir */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
