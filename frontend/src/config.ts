// Base URL for the backend API.
// In development, Vite proxy routes relative paths to localhost:8000.
// In separate production deployment (e.g. Vercel + Render), set VITE_API_URL in environment variables.
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${cleanPath}`
}
