import { clsx } from 'clsx'

interface ScoreBarProps {
  value: number        // 0..1
  label: string
  sublabel?: string
  weight?: number
  colorScheme?: 'risk' | 'match' | 'neutral'
  showValue?: boolean
}

function getBarColor(value: number, scheme: 'risk' | 'match' | 'neutral'): string {
  if (scheme === 'neutral') return 'bg-blue-500'
  if (scheme === 'match') {
    // Inverted: low value = good (face match distance)
    if (value < 0.4) return 'bg-emerald-500'
    if (value < 0.7) return 'bg-amber-500'
    return 'bg-red-500'
  }
  // risk scheme: high = bad
  if (value < 0.35) return 'bg-emerald-500'
  if (value < 0.65) return 'bg-amber-500'
  return 'bg-red-500'
}

export function ScoreBar({
  value,
  label,
  sublabel,
  weight,
  colorScheme = 'risk',
  showValue = true,
}: ScoreBarProps) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  const barColor = getBarColor(value, colorScheme)

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <div>
          <span className="text-sm text-slate-300 font-medium">{label}</span>
          {sublabel && (
            <span className="ml-2 text-xs text-slate-500">{sublabel}</span>
          )}
          {weight !== undefined && (
            <span className="ml-2 text-xs text-slate-500">w={weight}</span>
          )}
        </div>
        {showValue && (
          <span className="text-sm font-mono font-semibold text-slate-200">
            {pct}%
          </span>
        )}
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700 ease-out', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
