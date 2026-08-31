import { clsx } from 'clsx'

type Variant = 'valid' | 'expired' | 'blacklisted' | 'not_found' | 'LOW' | 'MEDIUM' | 'HIGH' | 'matched' | 'unmatched' | 'unknown'

interface StatusBadgeProps {
  variant: Variant
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

const VARIANT_STYLES: Record<Variant, string> = {
  valid:       'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  LOW:         'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  matched:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  expired:     'bg-amber-500/20   text-amber-300   border-amber-500/30',
  not_found:   'bg-amber-500/20   text-amber-300   border-amber-500/30',
  MEDIUM:      'bg-amber-500/20   text-amber-300   border-amber-500/30',
  blacklisted: 'bg-red-500/20     text-red-300     border-red-500/30',
  HIGH:        'bg-red-500/20     text-red-300     border-red-500/30',
  unmatched:   'bg-red-500/20     text-red-300     border-red-500/30',
  unknown:     'bg-slate-500/20   text-slate-300   border-slate-500/30',
}

const VARIANT_DOTS: Record<Variant, string> = {
  valid:       'bg-emerald-400',
  LOW:         'bg-emerald-400',
  matched:     'bg-emerald-400',
  expired:     'bg-amber-400',
  not_found:   'bg-amber-400',
  MEDIUM:      'bg-amber-400',
  blacklisted: 'bg-red-400 animate-pulse',
  HIGH:        'bg-red-400 animate-pulse',
  unmatched:   'bg-red-400',
  unknown:     'bg-slate-400',
}

const DEFAULT_LABELS: Record<Variant, string> = {
  valid:       'Valid',
  LOW:         'Low Risk',
  matched:     'Face Matched',
  expired:     'Expired',
  not_found:   'Not Found',
  MEDIUM:      'Medium Risk',
  blacklisted: 'Blacklisted',
  HIGH:        'High Risk',
  unmatched:   'No Match',
  unknown:     'Unknown',
}

export function StatusBadge({ variant, label, size = 'md' }: StatusBadgeProps) {
  const displayLabel = label ?? DEFAULT_LABELS[variant]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 border rounded-full font-semibold tracking-wide',
        VARIANT_STYLES[variant],
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-3 py-1 text-xs',
        size === 'lg' && 'px-4 py-1.5 text-sm',
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', VARIANT_DOTS[variant])} />
      {displayLabel}
    </span>
  )
}
