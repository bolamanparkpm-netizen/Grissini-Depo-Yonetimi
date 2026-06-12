import { Navigate } from 'react-router-dom'

// Kullanıcı giriş yapmamışsa login'e yönlendir
export default function ProtectedRoute({ user, children }) {
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
} 
