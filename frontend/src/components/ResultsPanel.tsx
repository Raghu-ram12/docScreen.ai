import { AnalysisResponse } from '../types'
import { StatusBadge } from './StatusBadge'
import { ScoreBar } from './ScoreBar'
import { RiskGauge } from './RiskGauge'
import {
  ScanText,
  ShieldAlert,
  Eye,
  UserCheck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Tag,
  ExternalLink,
} from 'lucide-react'

interface ResultsPanelProps {
  result: AnalysisResponse
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof ScanText
  children: React.ReactNode
}) {
  return (
    <div className="card animate-slide-up space-y-4">
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <Icon className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── Field row ────────────────────────────────────────────────────────────────
function FieldRow({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display =
    value === null || value === undefined || value === ''
      ? <span className="text-slate-600 italic">—</span>
      : String(value)

  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-white/4 last:border-0">
      <span className="field-label shrink-0">{label}</span>
      <span className="field-value text-right break-all">{display}</span>
    </div>
  )
}

export function ResultsPanel({ result }: ResultsPanelProps) {
  const { extracted_fields, ocr_method, validation, tampering, face_verification, risk } = result

  // Determine face badge variant
  const faceVariant =
    face_verification.matched === true
      ? 'matched'
      : face_verification.matched === false
        ? 'unmatched'
        : 'unknown'

  // Clean up extracted fields for display
  const fieldEntries = Object.entries(extracted_fields).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )

  return (
    <div className="space-y-4">
      {/* ── 1. Risk Score (top-level, most important) ─────────────────────── */}
      <div className="card animate-slide-up">
        <div className="flex items-center gap-2 border-b border-white/5 pb-3 mb-4">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200">Overall Risk Assessment</h3>
          {risk.forced_high && (
            <span className="ml-auto flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Blacklist flag — forced HIGH
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Gauge */}
          <div className="shrink-0">
            <RiskGauge score={risk.score} band={risk.band} />
            <div className="flex justify-center mt-1">
              <StatusBadge variant={risk.band} size="lg" />
            </div>
          </div>

          {/* Breakdown */}
          <div className="flex-1 w-full space-y-3">
            <ScoreBar
              value={risk.breakdown.validation.sub_score}
              label="Validation"
              sublabel={`status: ${risk.breakdown.validation.status}`}
              weight={risk.breakdown.validation.weight}
            />
            <ScoreBar
              value={risk.breakdown.tampering.sub_score}
              label="Tampering"
              weight={risk.breakdown.tampering.weight}
            />
            <ScoreBar
              value={risk.breakdown.face.sub_score}
              label="Face Match"
              sublabel={
                risk.breakdown.face.distance != null
                  ? `dist: ${risk.breakdown.face.distance}`
                  : 'unavailable'
              }
              weight={risk.breakdown.face.weight}
              colorScheme="match"
            />
            <ScoreBar
              value={risk.breakdown.blacklist.sub_score}
              label="Blacklist"
              sublabel={risk.breakdown.blacklist.flag ? 'FLAGGED' : 'clear'}
              weight={risk.breakdown.blacklist.weight}
            />
          </div>
        </div>
      </div>

      {/* ── 2. Document Validation ────────────────────────────────────────── */}
      <Section title="Document Validation" icon={ShieldAlert}>
        <div className="flex items-center justify-between">
          <StatusBadge variant={validation.status} size="md" />
          <span className="text-xs text-slate-400">{validation.message}</span>
        </div>
        <div className="mt-2">
          <FieldRow label="Document No." value={validation.doc_number} />
          <FieldRow label="Found in DB" value={validation.found ? 'Yes' : 'No'} />
          <FieldRow label="Expiry Date" value={validation.expiry_date} />
        </div>
      </Section>

      {/* ── 3. OCR / Extracted Fields ─────────────────────────────────────── */}
      <Section title="Extracted Fields (OCR)" icon={ScanText}>
        <div className="flex items-center gap-2 mb-1">
          <Tag className="w-3 h-3 text-slate-500" />
          <span className="text-xs text-slate-500">
            Method:{' '}
            <span className="font-mono text-blue-400">
              {ocr_method === 'passporteye_mrz' ? 'MRZ (passporteye)' : 'General Text (EasyOCR)'}
            </span>
          </span>
        </div>
        {fieldEntries.length > 0 ? (
          fieldEntries.map(([k, v]) => (
            <FieldRow key={k} label={k.replace(/_/g, ' ')} value={v} />
          ))
        ) : (
          <p className="text-sm text-slate-500 italic">No fields could be extracted.</p>
        )}
      </Section>

      {/* ── 4. Tampering Detection ────────────────────────────────────────── */}
      <Section title="Tampering Detection" icon={Eye}>
        <div className="space-y-3">
          <ScoreBar value={tampering.tampering_score} label="Combined Tampering Score" />
          <ScoreBar value={tampering.ela_score} label="ELA Score" sublabel={`mean px diff: ${tampering.mean_ela}`} weight={0.45} />
          <ScoreBar value={tampering.metadata_score} label="Metadata Score" weight={0.25} />
          <ScoreBar value={tampering.noise_score} label="Noise Variance Score" sublabel={`CV: ${tampering.cv_of_variance.toFixed(3)}`} weight={0.30} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white/4 rounded-lg p-2">
            <p className="field-label">ELA Outlier Blocks</p>
            <p className="text-slate-200 font-mono mt-0.5">{(tampering.ela_outlier_fraction * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-white/4 rounded-lg p-2">
            <p className="field-label">Noise Outlier Blocks</p>
            <p className="text-slate-200 font-mono mt-0.5">{tampering.num_outlier_blocks}</p>
          </div>
        </div>

        {tampering.suspicious_tags.length > 0 && (
          <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
            <p className="text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Suspicious EXIF Tags
            </p>
            {tampering.suspicious_tags.map((t, i) => (
              <p key={i} className="text-xs font-mono text-amber-200/80">{t}</p>
            ))}
          </div>
        )}

        {/* ELA Heatmap */}
        {tampering.heatmap_url && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              ELA Heatmap (amplified ×10 — bright = tampered)
            </p>
            <a href={tampering.heatmap_url} target="_blank" rel="noreferrer" className="block">
              <img
                src={tampering.heatmap_url}
                alt="ELA heatmap"
                className="w-full rounded-xl border border-white/10 hover:opacity-90 transition"
              />
            </a>
          </div>
        )}
      </Section>

      {/* ── 5. Face Verification ─────────────────────────────────────────── */}
      <Section title="Face Verification" icon={UserCheck}>
        {/* Library unavailable — prominent warning */}
        {(face_verification.match_status === 'library_unavailable' || face_verification.match_status === 'error') && (
          <div className="flex items-start gap-3 rounded-xl bg-orange-500/10 border border-orange-500/30 p-3 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-300">Face Verification Unavailable</p>
              <p className="text-xs text-orange-300/70 mt-0.5">
                The face recognition library (dlib) is not installed on this server.
                Face matching <strong>could not be performed</strong> — risk score has been
                elevated accordingly. <strong>Manual identity verification is required.</strong>
              </p>
              <p className="text-xs font-mono text-orange-400/60 mt-1">{face_verification.note}</p>
            </div>
          </div>
        )}

        {/* No-face-detected warning */}
        {(face_verification.match_status === 'no_face_in_doc' || face_verification.match_status === 'no_face_in_selfie') && (
          <div className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/30 p-3 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Face Not Detected</p>
              <p className="text-xs text-red-300/70 mt-0.5">{face_verification.note}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <StatusBadge
            variant={faceVariant === 'unknown' ? 'unknown' : faceVariant}
            size="md"
          />
          <span className="text-xs text-slate-400 max-w-[55%] text-right">{face_verification.note}</span>
        </div>

        {face_verification.distance !== null ? (
          <div className="mt-3 space-y-2">
            <ScoreBar
              value={face_verification.distance / face_verification.threshold}
              label="Face Distance"
              sublabel={`${face_verification.distance.toFixed(4)} / threshold ${face_verification.threshold}`}
              colorScheme="match"
            />
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-white/4 rounded-lg p-2">
                <p className="field-label">Distance</p>
                <p className="text-slate-200 font-mono mt-0.5">{face_verification.distance.toFixed(4)}</p>
              </div>
              <div className="bg-white/4 rounded-lg p-2">
                <p className="field-label">Threshold</p>
                <p className="text-slate-200 font-mono mt-0.5">{face_verification.threshold}</p>
              </div>
              <div className="bg-white/4 rounded-lg p-2">
                <p className="field-label">Result</p>
                <p className={`mt-0.5 font-semibold ${face_verification.matched ? 'text-emerald-400' : 'text-red-400'}`}>
                  {face_verification.matched ? '✓ Match' : '✗ No match'}
                </p>
              </div>
            </div>
          </div>
        ) : face_verification.match_status === 'no_selfie' ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5" />
            No selfie was provided — face comparison was skipped.
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5" />
            No face comparison data available (library unavailable or no selfie provided).
          </div>
        )}
      </Section>
    </div>
  )
}
