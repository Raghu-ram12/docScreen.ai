import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AnalysisResponse } from '../types'

interface RightPanelProps {
  result: AnalysisResponse | null
  loading: boolean
}

// ── Mini score bar ────────────────────────────────────────────────────────────
function SignalBar({
  label,
  value,
  invert = false,
}: {
  label: string
  value: number | null
  invert?: boolean
}) {
  const pct = value === null ? null : Math.round(Math.min(Math.max(value, 0), 1) * 100)
  const risk = invert ? (pct !== null ? 100 - pct : null) : pct

  const barColor =
    risk === null
      ? 'var(--ink-faint)'
      : risk < 35
        ? 'var(--low)'
        : risk < 65
          ? 'var(--med)'
          : 'var(--high)'

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{label}</span>
        <span style={{ fontFamily: '"IBM Plex Mono"', fontSize: 11, color: 'var(--ink-soft)' }}>
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: 'var(--hairline)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        {pct !== null && (
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: barColor,
              borderRadius: 2,
              transition: 'width 600ms ease-out',
            }}
          />
        )}
      </div>
    </div>
  )
}

// ── Animated score numeral ────────────────────────────────────────────────────
function ScoreNumeral({ score, band }: { score: number; band: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const bandColor =
    band === 'LOW' ? 'var(--low)' : band === 'MEDIUM' ? 'var(--med)' : 'var(--high)'
  const bandBg =
    band === 'LOW' ? 'var(--low-soft)' : band === 'MEDIUM' ? 'var(--med-soft)' : 'var(--high-soft)'

  const displayRef = useRef<HTMLSpanElement>(null)
  const targetRef = useRef(score)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    targetRef.current = score
    let current = 0
    const start = performance.now()
    const duration = 800
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      current = eased * targetRef.current
      if (displayRef.current) {
        displayRef.current.textContent = (current * 100).toFixed(0).padStart(2, '0')
      }
      if (t < 1) frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [score])

  return (
    <div style={{ textAlign: 'center', padding: '16px 0 12px' }}>
      <div
        style={{
          fontFamily: '"IBM Plex Mono"',
          fontSize: 64,
          fontWeight: 500,
          color: bandColor,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        <span ref={displayRef}>00</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>risk score / 100</div>
      <div
        style={{
          display: 'inline-block',
          marginTop: 10,
          padding: '3px 12px',
          background: bandBg,
          color: bandColor,
          fontFamily: '"IBM Plex Mono"',
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 2,
          letterSpacing: '0.08em',
        }}
      >
        {band}
      </div>
    </div>
  )
}

// ── Evidence list ─────────────────────────────────────────────────────────────
function EvidenceItem({ text, severity }: { text: string; severity: 'info' | 'warn' | 'critical' }) {
  const color =
    severity === 'critical'
      ? 'var(--high)'
      : severity === 'warn'
        ? 'var(--med)'
        : 'var(--ink-soft)'
  const icon = severity === 'critical' ? '▲' : severity === 'warn' ? '◆' : '·'

  return (
    <div style={{ display: 'flex', gap: 6, padding: '3px 0', borderBottom: '1px solid var(--hairline)' }}>
      <span style={{ color, fontSize: 10, marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{text}</span>
    </div>
  )
}

function buildEvidence(result: AnalysisResponse): { text: string; severity: 'info' | 'warn' | 'critical' }[] {
  const items: { text: string; severity: 'info' | 'warn' | 'critical' }[] = []
  const { validation, tampering, face_verification, risk } = result

  if (validation.status === 'blacklisted')
    items.push({ text: 'Document is blacklisted — immediate escalation required.', severity: 'critical' })
  if (validation.status === 'expired')
    items.push({ text: `Document expired on ${validation.expiry_date}.`, severity: 'critical' })
  if (validation.status === 'not_found')
    items.push({ text: 'Document number not found in registry.', severity: 'warn' })
  if (validation.status === 'valid')
    items.push({ text: `Document valid until ${validation.expiry_date}.`, severity: 'info' })

  if (tampering.tampering_score > 0.65)
    items.push({ text: `High tampering likelihood (score ${(tampering.tampering_score * 100).toFixed(0)}%).`, severity: 'critical' })
  else if (tampering.tampering_score > 0.35)
    items.push({ text: `Moderate tampering signal (score ${(tampering.tampering_score * 100).toFixed(0)}%).`, severity: 'warn' })
  else
    items.push({ text: `Tampering analysis clean (score ${(tampering.tampering_score * 100).toFixed(0)}%).`, severity: 'info' })

  if (tampering.suspicious_tags.length > 0)
    items.push({ text: `Suspicious EXIF: ${tampering.suspicious_tags.slice(0, 2).join(', ')}.`, severity: 'warn' })
  if (tampering.ela_outlier_fraction > 0.05)
    items.push({ text: `ELA outlier blocks: ${(tampering.ela_outlier_fraction * 100).toFixed(1)}%.`, severity: 'warn' })

  if (face_verification.match_status === 'library_unavailable')
    items.push({ text: 'Face recognition library unavailable — manual verification required.', severity: 'warn' })
  else if (face_verification.matched === false)
    items.push({ text: `Face mismatch (distance ${face_verification.distance?.toFixed(3)}, threshold ${face_verification.threshold}).`, severity: 'critical' })
  else if (face_verification.matched === true)
    items.push({ text: `Face verified (distance ${face_verification.distance?.toFixed(3)}).`, severity: 'info' })

  if (risk.forced_high)
    items.push({ text: 'Risk band forced HIGH due to blacklist flag.', severity: 'critical' })

  return items
}

export function RightPanel({ result, loading }: RightPanelProps) {
  if (loading) {
    return (
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[64, 30, 80, 40, 60, 45, 55].map((w, i) => (
          <div key={i} style={{ height: i === 0 ? 70 : 8, borderRadius: 2, background: 'var(--hairline)', width: `${w}%`, opacity: 0.6 }} />
        ))}
      </div>
    )
  }

  if (!result) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-faint)',
          fontSize: 12,
          padding: '1rem',
          textAlign: 'center',
        }}
      >
        Risk assessment will appear here
      </div>
    )
  }

  const { risk, tampering, face_verification } = result
  const score100 = result.risk.score

  const evidence = buildEvidence(result)
  const critical = evidence.some(e => e.severity === 'critical')

  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      {/* Risk numeral */}
      <div style={{ borderBottom: '1px solid var(--hairline)' }}>
        <ScoreNumeral score={score100} band={risk.band} />
        {critical && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'var(--high-soft)',
              padding: '5px 10px',
              fontSize: 11,
              color: 'var(--high)',
              fontWeight: 500,
            }}
          >
            <AlertTriangle style={{ width: 12, height: 12, flexShrink: 0 }} />
            Critical findings — action required
          </div>
        )}
      </div>

      {/* Signal breakdown */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 8 }}>
          Signal breakdown
        </div>
        <SignalBar label="Document validation" value={1 - risk.breakdown.validation.sub_score} invert={false} />
        <SignalBar label="Tampering likelihood" value={tampering.tampering_score} />
        <SignalBar label="Face match" value={face_verification.distance !== null ? 1 - (face_verification.distance / face_verification.threshold) : null} />
        <SignalBar label="ELA score" value={tampering.ela_score} />
        <SignalBar label="Metadata score" value={tampering.metadata_score} />
        <SignalBar label="Noise variance" value={tampering.noise_score} />
      </div>

      {/* Evidence */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>
          Findings
        </div>
        {evidence.map((e, i) => (
          <EvidenceItem key={i} text={e.text} severity={e.severity} />
        ))}
      </div>

      <div style={{ height: 12 }} />
    </div>
  )
}
