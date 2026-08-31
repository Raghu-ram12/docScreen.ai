import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`w-8 h-8 flex items-center justify-center rounded text-ink-soft hover:text-ink hover:bg-steel-soft transition-colors ${className}`}
      style={{ border: '1px solid var(--hairline)' }}
    >
      {theme === 'dark'
        ? <Sun className="w-4 h-4" />
        : <Moon className="w-4 h-4" />}
    </button>
  )
}
