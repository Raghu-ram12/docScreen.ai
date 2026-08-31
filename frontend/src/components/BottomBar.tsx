import { RotateCcw, Trash2, AlertOctagon, Hash } from 'lucide-react'
import { AnalysisResponse } from '../types'

interface BottomBarProps {
  result: AnalysisResponse | null
  loading: boolean
  recordId: string
  onRescan: () => void
  onClear: () => void
  onEscalate: () => void
}

export function BottomBar({ result, loading, recordId, onRescan, onClear, onEscalate }: BottomBarProps) {
  const band = result?.risk.band
  const showEscalate = band === 'MEDIUM' || band === 'HIGH'

  return (
    <footer
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--hairline)',
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 1rem',
        gap: '0.75rem',
        flexShrink: 0,
      }}
    >
      {/* Record ID */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-faint)', fontSize: 11 }}>
        <Hash style={{ width: 11, height: 11 }} />
        <span style={{ fontFamily: '"IBM Plex Mono"' }}>{recordId}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Request re-scan */}
      <button
        className="btn-ghost"
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
        onClick={onRescan}
        disabled={loading}
      >
        <RotateCcw style={{ width: 12, height: 12 }} />
        Re-scan
      </button>

      {/* Clear traveler */}
      <button
        className="btn-ghost"
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
        onClick={onClear}
      >
        <Trash2 style={{ width: 12, height: 12 }} />
        Clear traveler
      </button>

      {/* Escalate — only shown for medium/high risk */}
      {showEscalate && (
        <button
          className="btn-danger-outline"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          onClick={onEscalate}
        >
          <AlertOctagon style={{ width: 12, height: 12 }} />
          Escalate — secondary inspection
        </button>
      )}
    </footer>
  )
}
