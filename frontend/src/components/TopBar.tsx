import { useEffect, useState } from 'react'
import { Wifi, WifiOff, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from './ThemeToggle'
import { getApiUrl } from '../config'
import axios from 'axios'

interface TopBarProps {
  onLogout: () => void
}

function useClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function TopBar({ onLogout }: TopBarProps) {
  const { officer } = useAuth()
  const time = useClock()
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    axios.get(getApiUrl('/health'), { timeout: 4000 })
      .then(() => setOnline(true))
      .catch(() => setOnline(false))
  }, [])

  return (
    <header
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--hairline)',
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 1rem',
        gap: '0.75rem',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
        <ShieldCheck style={{ width: 15, height: 15, color: 'var(--steel)' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>DocScreen</span>
      </div>

      <span style={{ width: 1, height: 16, background: 'var(--hairline)' }} />

      {/* Checkpoint */}
      <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: '"IBM Plex Mono"' }}>
        {officer?.checkpoint}
      </span>

      {/* Connection status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {online === true && <Wifi style={{ width: 12, height: 12, color: 'var(--low)' }} />}
        {online === false && <WifiOff style={{ width: 12, height: 12, color: 'var(--high)' }} />}
        {online === null && (
          <span
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--ink-faint)',
              display: 'inline-block',
            }}
          />
        )}
        <span style={{ fontSize: 11, color: online ? 'var(--low)' : 'var(--ink-faint)' }}>
          {online === true ? 'Online' : online === false ? 'Offline' : '…'}
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Officer */}
      <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
        {officer?.name} ·{' '}
        <span style={{ fontFamily: '"IBM Plex Mono"', fontSize: 11 }}>{officer?.badgeId}</span>
      </span>

      {/* Clock */}
      <span
        style={{
          fontFamily: '"IBM Plex Mono"',
          fontSize: 12,
          color: 'var(--ink-soft)',
          minWidth: 72,
          textAlign: 'right',
        }}
      >
        {time}
      </span>

      <span style={{ width: 1, height: 16, background: 'var(--hairline)' }} />

      <ThemeToggle />

      {/* Logout */}
      <button
        onClick={onLogout}
        aria-label="Sign out"
        title="Sign out"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink-faint)',
          padding: '2px 4px',
          borderRadius: 3,
          fontSize: 11,
        }}
      >
        <LogOut style={{ width: 13, height: 13 }} />
      </button>
    </header>
  )
}
