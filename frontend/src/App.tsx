import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Console from './pages/Console'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { officer } = useAuth()
  return officer ? <>{children}</> : <Navigate to="/login" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/console"
        element={
          <RequireAuth>
            <Console />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
