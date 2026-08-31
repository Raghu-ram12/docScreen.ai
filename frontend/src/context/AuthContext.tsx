import { createContext, useContext, useState } from 'react'

export interface Officer {
  badgeId: string
  name: string
  checkpoint: string
}

interface AuthCtx {
  officer: Officer | null
  login: (badgeId: string, password: string, checkpoint: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthCtx>({
  officer: null,
  login: async () => {},
  logout: () => {},
})

// Mock credentials — replace with real JWT endpoint when auth is ready
const MOCK_USERS: Record<string, { password: string; name: string }> = {
  'OFF001': { password: 'pass123', name: 'Sgt. Sharma' },
  'OFF002': { password: 'pass456', name: 'Insp. Mehta' },
  // Any badge ID works in demo mode if password is "demo"
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [officer, setOfficer] = useState<Officer | null>(null)

  const login = async (badgeId: string, password: string, checkpoint: string) => {
    await new Promise(r => setTimeout(r, 500)) // simulate network

    const user = MOCK_USERS[badgeId.toUpperCase()]
    // Demo mode: accept any badge ID with password "demo"
    if ((!user || user.password !== password) && password !== 'demo') {
      throw new Error('Badge ID or password is incorrect.')
    }
    setOfficer({
      badgeId: badgeId.toUpperCase(),
      name: user?.name ?? `Officer ${badgeId.toUpperCase()}`,
      checkpoint,
    })
  }

  const logout = () => setOfficer(null)

  return (
    <AuthContext.Provider value={{ officer, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
