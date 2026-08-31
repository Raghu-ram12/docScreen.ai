import { useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  Database,
  User,
  Calendar,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileText,
} from 'lucide-react'
import { AnalysisResponse } from '../types'

interface CenterPanelProps {
  result: AnalysisResponse | null
  loading: boolean
}

function FieldIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return <MinusCircle style={{ width: 12, height: 12, color: 'var(--ink-faint)', flexShrink: 0 }} />
  return ok
    ? <CheckCircle2 style={{ width: 12, height: 12, color: 'var(--low)', flexShrink: 0 }} />
    : <AlertTriangle style={{ width: 12, height: 12, color: 'var(--high)', flexShrink: 0 }} />
}

function KeyFieldRow({
  label,
  value,
  badge,
  badgeType,
  ok,
}: {
  label: string
  value: string | undefined | null
  badge?: string
  badgeType?: 'low' | 'med' | 'high' | 'steel'
  ok?: boolean | null
}) {
  const displayVal = value && String(value).trim() ? String(value) : null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '5px 0',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
        {ok !== undefined && <FieldIcon ok={ok} />}
        <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'right' }}>
        {displayVal ? (
          <span style={{ fontFamily: '"IBM Plex Mono"', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>
            {displayVal}
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Not detected</span>
        )}

        {badge && (
          <span
            style={{
              fontSize: 10,
              fontFamily: '"IBM Plex Mono"',
              padding: '1px 5px',
              borderRadius: 2,
              background:
                badgeType === 'low'
                  ? 'var(--low-soft)'
                  : badgeType === 'high'
                  ? 'var(--high-soft)'
                  : badgeType === 'med'
                  ? 'var(--med-soft)'
                  : 'var(--steel-soft)',
              color:
                badgeType === 'low'
                  ? 'var(--low)'
                  : badgeType === 'high'
                  ? 'var(--high)'
                  : badgeType === 'med'
                  ? 'var(--med)'
                  : 'var(--steel)',
            }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

function DBRow({
  label,
  value,
  ok,
}: {
  label: string
  value: string
  ok: boolean | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 0',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <FieldIcon ok={ok} />
      <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', flex: 1 }}>{label}</span>
      <span
        style={{
          fontFamily: '"IBM Plex Mono"',
          fontSize: 11,
          color: ok === true ? 'var(--low)' : ok === false ? 'var(--high)' : 'var(--ink-faint)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function SkeletonLines({ count = 8 }: { count?: number }) {
  return (
    <div style={{ padding: '16px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            borderRadius: 2,
            background: 'var(--hairline)',
            marginBottom: 12,
            width: `${50 + (i % 4) * 12}%`,
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  )
}

export function CenterPanel({ result, loading }: CenterPanelProps) {
  const [showRawText, setShowRawText] = useState(false)
  const [copied, setCopied] = useState(false)

  if (loading) return <SkeletonLines count={12} />

  if (!result) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: 'var(--ink-faint)',
          fontSize: 12.5,
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <Database style={{ width: 26, height: 26, opacity: 0.4 }} />
        <span>Upload a document to extract key fields</span>
      </div>
    )
  }

  const { extracted_fields, ocr_method, validation } = result
  const rawList = extracted_fields.raw_text || []
  const mrzLines = extracted_fields.mrz_lines || []

  // Check if dates are expired
  let isExpired = false
  if (extracted_fields.expiry_date || validation.expiry_date) {
    const exp = extracted_fields.expiry_date || validation.expiry_date
    try {
      const expDate = new Date(exp!)
      if (!isNaN(expDate.getTime()) && expDate < new Date()) {
        isExpired = true
      }
    } catch {
      // ignore
    }
  }

  const handleCopyRaw = () => {
    const textToCopy = extracted_fields.full_text || rawList.join('\n')
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ overflow: 'auto', height: '100%', paddingBottom: '1.5rem' }}>
      {/* ── Document Type & OCR Method Header Bar ────────────────────────────── */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--steel-soft)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CreditCard style={{ width: 13, height: 13, color: 'var(--steel)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--steel)' }}>
            {extracted_fields.document_type || 'Identity Document'}
          </span>
        </div>
        <span style={{ fontFamily: '"IBM Plex Mono"', fontSize: 11, color: 'var(--steel)' }}>
          {ocr_method === 'passporteye_mrz' ? 'MRZ Engine (passporteye)' : 'Deep OCR (EasyOCR + Heuristics)'}
        </span>
      </div>

      {/* ── 1. Primary Identity Fields ───────────────────────────────────────── */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-soft)',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <User style={{ width: 12, height: 12 }} /> Primary Identity
        </div>

        <KeyFieldRow
          label="Document number"
          value={extracted_fields.document_number || extracted_fields.doc_number || validation.doc_number}
          ok={validation.is_valid}
          badge={validation.status === 'valid' ? 'VALID' : validation.status === 'blacklisted' ? 'BLACKLISTED' : undefined}
          badgeType={validation.status === 'valid' ? 'low' : 'high'}
        />

        <KeyFieldRow
          label="Full name"
          value={extracted_fields.full_name || (extracted_fields.given_names ? `${extracted_fields.given_names} ${extracted_fields.surname || ''}`.trim() : undefined)}
          ok={Boolean(extracted_fields.full_name || extracted_fields.given_names)}
        />

        {extracted_fields.surname && (
          <KeyFieldRow label="Surname" value={extracted_fields.surname} />
        )}

        {extracted_fields.given_names && (
          <KeyFieldRow label="Given names" value={extracted_fields.given_names} />
        )}

        <KeyFieldRow
          label="Nationality / Country"
          value={extracted_fields.nationality || extracted_fields.country}
          ok={Boolean(extracted_fields.nationality || extracted_fields.country)}
        />
      </div>

      {/* ── 2. Dates & Demographics ─────────────────────────────────────────── */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-soft)',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Calendar style={{ width: 12, height: 12 }} /> Dates & Demographics
        </div>

        <KeyFieldRow
          label="Date of birth"
          value={extracted_fields.date_of_birth}
          ok={Boolean(extracted_fields.date_of_birth)}
        />

        <KeyFieldRow
          label="Date of expiry"
          value={extracted_fields.expiry_date || extracted_fields.expiration_date || validation.expiry_date}
          ok={!isExpired && validation.status === 'valid'}
          badge={isExpired ? 'EXPIRED' : extracted_fields.expiry_date ? 'ACTIVE' : undefined}
          badgeType={isExpired ? 'high' : 'low'}
        />

        {extracted_fields.issue_date && (
          <KeyFieldRow label="Date of issue" value={extracted_fields.issue_date} />
        )}

        <KeyFieldRow
          label="Sex / Gender"
          value={extracted_fields.sex}
        />

        {extracted_fields.father_name && (
          <KeyFieldRow label="Father / Guardian" value={extracted_fields.father_name} />
        )}

        {extracted_fields.address && (
          <KeyFieldRow label="Address" value={extracted_fields.address} />
        )}
      </div>

      {/* ── 3. MRZ Monospace Block (if available) ────────────────────────────── */}
      {mrzLines.length > 0 && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>
            Machine Readable Zone (MRZ)
          </div>
          <div
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11.5,
              letterSpacing: '0.08em',
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderRadius: 2,
              padding: '8px 10px',
              lineHeight: 1.8,
              color: 'var(--ink)',
              wordBreak: 'break-all',
            }}
          >
            {mrzLines.map((line, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--ink-faint)', userSelect: 'none', width: 14 }}>{idx + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Database Registry Cross-Check ─────────────────────────────────── */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-soft)',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Database style={{ width: 12, height: 12 }} /> Database Registry Cross-Check
        </div>
        <DBRow
          label="Registry document status"
          value={validation.status.toUpperCase()}
          ok={validation.status === 'valid'}
        />
        <DBRow
          label="Registry expiration date"
          value={validation.expiry_date ?? 'Not recorded'}
          ok={validation.status === 'valid'}
        />
        <DBRow
          label="Security watchlist / blacklist"
          value={validation.status === 'blacklisted' ? 'MATCH FOUND (FLAGGED)' : 'Clear (0 flags)'}
          ok={validation.status !== 'blacklisted'}
        />
        <DBRow
          label="Lost / stolen passport index"
          value={validation.found ? 'Document on file' : 'Unregistered entry'}
          ok={validation.found ? true : null}
        />
      </div>

      {/* ── 5. Collapsible Raw OCR Transcript ────────────────────────────────── */}
      <div style={{ padding: '10px 14px' }}>
        <div
          onClick={() => setShowRawText(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '4px 0',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
            <FileText style={{ width: 12, height: 12 }} />
            Raw OCR Recognised Text ({rawList.length} tokens)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-faint)' }}>
            {showRawText ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
          </div>
        </div>

        {showRawText && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                onClick={handleCopyRaw}
                aria-label="Copy raw text"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  background: 'none',
                  border: '1px solid var(--hairline)',
                  borderRadius: 2,
                  padding: '2px 6px',
                  fontSize: 10,
                  color: 'var(--ink-soft)',
                  cursor: 'pointer',
                }}
              >
                {copied ? <Check style={{ width: 10, height: 10, color: 'var(--low)' }} /> : <Copy style={{ width: 10, height: 10 }} />}
                {copied ? 'Copied' : 'Copy text'}
              </button>
            </div>
            <div
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                background: 'var(--bg)',
                border: '1px solid var(--hairline)',
                borderRadius: 2,
                padding: '8px 10px',
                maxHeight: 180,
                overflowY: 'auto',
                color: 'var(--ink)',
                lineHeight: 1.6,
              }}
            >
              {rawList.length > 0 ? (
                rawList.map((line: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--ink-faint)', userSelect: 'none', width: 20, textAlign: 'right' }}>
                      {i + 1}
                    </span>
                    <span>{line}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>No raw text tokens recognized.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
