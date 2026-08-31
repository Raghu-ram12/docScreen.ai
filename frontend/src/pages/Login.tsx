import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'

const CHECKPOINTS = [
  'Terminal 1 · Lane 1',
  'Terminal 1 · Lane 2',
  'Terminal 2 · Lane 3',
  'Terminal 2 · Lane 4',
  'Terminal 3 · Lane 5',
  'Terminal 3 · Lane 6',
  'Cargo · Gate A',
  'VIP · Gate B',
]

// MRZ-texture characters for background
const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<<<<<<<<<'

function MrzTexture() {
  const rows = 28
  const cols = 52
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: 0.04,
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '11px',
        lineHeight: '1.7',
        letterSpacing: '0.05em',
        color: 'var(--ink)',
        padding: '1rem',
        wordBreak: 'break-all',
      }}
    >
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ whiteSpace: 'nowrap' }}>
          {Array.from({ length: cols }).map((_, c) =>
            MRZ_CHARS[(r * cols + c * 7 + r * 3) % MRZ_CHARS.length]
          ).join('')}
        </div>
      ))}
    </div>
  )
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [badgeId, setBadgeId] = useState('')
  const [password, setPassword] = useState('')
  const [checkpoint, setCheckpoint] = useState(CHECKPOINTS[0])
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const badgeRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!badgeId.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      await login(badgeId.trim(), password, checkpoint)
      navigate('/console')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
      setLoading(false)
      badgeRef.current?.focus()
    }
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg)' }}
    >
      <MrzTexture />

      {/* Theme toggle — top right */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Login card */}
      <div
        className="relative z-10 w-full"
        style={{
          maxWidth: 380,
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 4,
          padding: '2rem',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-7">
          <div
            style={{
              width: 32,
              height: 32,
              background: 'var(--steel)',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldCheck style={{ width: 16, height: 16, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>
              DocScreen
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
              Border Checkpoint Console
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Badge ID */}
          <div className="mb-4">
            <label
              htmlFor="badgeId"
              style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 5 }}
            >
              Badge ID
            </label>
            <input
              ref={badgeRef}
              id="badgeId"
              className="input-field"
              type="text"
              autoComplete="username"
              spellCheck={false}
              placeholder="e.g. OFF001"
              value={badgeId}
              onChange={e => setBadgeId(e.target.value)}
              disabled={loading}
              required
              style={{ fontFamily: '"IBM Plex Mono", monospace', letterSpacing: '0.04em' }}
            />
          </div>

          {/* Password */}
          <div className="mb-4">
            <label
              htmlFor="password"
              style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 5 }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                className="input-field"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                required
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute',
                  right: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink-faint)',
                  padding: 2,
                  display: 'flex',
                }}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Checkpoint / Lane */}
          <div className="mb-5">
            <label
              htmlFor="checkpoint"
              style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 5 }}
            >
              Checkpoint / lane
            </label>
            <select
              id="checkpoint"
              className="input-field"
              value={checkpoint}
              onChange={e => setCheckpoint(e.target.value)}
              disabled={loading}
            >
              {CHECKPOINTS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Inline error */}
          {error && (
            <div
              role="alert"
              style={{
                fontSize: 12.5,
                color: 'var(--high)',
                marginBottom: '0.875rem',
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', fontSize: 13.5, padding: '0.625rem' }}
            disabled={loading || !badgeId.trim() || !password}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p
          style={{
            marginTop: '1.5rem',
            fontSize: 11,
            color: 'var(--ink-faint)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Demo: any badge ID with password <span style={{ fontFamily: 'IBM Plex Mono', color: 'var(--ink-soft)' }}>demo</span>
        </p>
      </div>
    </div>
  )
}
