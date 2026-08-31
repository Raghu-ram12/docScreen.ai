import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAnalyze } from '../hooks/useAnalyze'
import { TopBar } from '../components/TopBar'
import { LeftPanel } from '../components/LeftPanel'
import { CenterPanel } from '../components/CenterPanel'
import { RightPanel } from '../components/RightPanel'
import { BottomBar } from '../components/BottomBar'
import { AlertCircle } from 'lucide-react'

function generateRecordId() {
  return `REC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
}

export default function Console() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const { result, loading, error, analyze, reset } = useAnalyze()
  const [recordId, setRecordId] = useState(generateRecordId)
  const [escalated, setEscalated] = useState(false)

  const handleLogout = () => {
    reset()
    logout()
    navigate('/login')
  }

  const handleUpload = (doc: File, selfie: File | null) => {
    setEscalated(false)
    analyze(doc, selfie)
  }

  const handleClear = () => {
    reset()
    setEscalated(false)
    setRecordId(generateRecordId())
  }

  const handleRescan = () => {
    reset()
    setEscalated(false)
  }

  const handleEscalate = () => {
    setEscalated(true)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <TopBar onLogout={handleLogout} />

      {/* Escalation banner */}
      {escalated && (
        <div
          role="alert"
          style={{
            background: 'var(--high-soft)',
            borderBottom: '1px solid var(--high)',
            padding: '6px 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: 'var(--high)',
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
          Traveler escalated for secondary inspection — supervisor has been notified.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--high-soft)',
            borderBottom: '1px solid var(--hairline)',
            padding: '6px 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--high)',
            flexShrink: 0,
          }}
        >
          <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} />
          <span style={{ fontFamily: '"IBM Plex Mono"' }}>{error}</span>
        </div>
      )}

      {/* Three-panel layout */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '280px 1fr 260px',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Left */}
        <div
          className="panel"
          style={{
            borderTop: 'none',
            borderBottom: 'none',
            borderLeft: 'none',
            borderRadius: 0,
            overflow: 'auto',
          }}
        >
          <LeftPanel
            result={result}
            loading={loading}
            onUpload={handleUpload}
            onClear={handleClear}
          />
        </div>

        {/* Center */}
        <div
          style={{
            background: 'var(--bg)',
            borderRight: '1px solid var(--hairline)',
            borderLeft: '1px solid var(--hairline)',
            overflow: 'auto',
          }}
        >
          <CenterPanel result={result} loading={loading} />
        </div>

        {/* Right */}
        <div
          className="panel"
          style={{
            borderTop: 'none',
            borderBottom: 'none',
            borderRight: 'none',
            borderRadius: 0,
            overflow: 'auto',
          }}
        >
          <RightPanel result={result} loading={loading} />
        </div>
      </div>

      <BottomBar
        result={result}
        loading={loading}
        recordId={recordId}
        onRescan={handleRescan}
        onClear={handleClear}
        onEscalate={handleEscalate}
      />
    </div>
  )
}
