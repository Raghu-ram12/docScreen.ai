import { useEffect, useRef } from 'react'

interface RiskGaugeProps {
  score: number   // 0..1
  band: 'LOW' | 'MEDIUM' | 'HIGH'
}

function bandColor(band: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (band === 'LOW') return { stroke: '#10b981', text: '#6ee7b7', glow: '#10b98140' }
  if (band === 'MEDIUM') return { stroke: '#f59e0b', text: '#fcd34d', glow: '#f59e0b40' }
  return { stroke: '#ef4444', text: '#fca5a5', glow: '#ef444440' }
}

export function RiskGauge({ score, band }: RiskGaugeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const progressRef = useRef(0)

  const colors = bandColor(band)
  const target = score

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const size = 200
    canvas.width = size
    canvas.height = size

    const cx = size / 2
    const cy = size / 2 + 10
    const r = 70
    const startAngle = Math.PI * 0.75
    const sweepAngle = Math.PI * 1.5

    progressRef.current = 0

    function draw(progress: number) {
      ctx.clearRect(0, 0, size, size)

      // Track
      ctx.beginPath()
      ctx.arc(cx, cy, r, startAngle, startAngle + sweepAngle)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 12
      ctx.lineCap = 'round'
      ctx.stroke()

      // Glow shadow
      ctx.shadowColor = colors.glow
      ctx.shadowBlur = 16

      // Progress arc
      const endAngle = startAngle + sweepAngle * progress
      ctx.beginPath()
      ctx.arc(cx, cy, r, startAngle, endAngle)
      ctx.strokeStyle = colors.stroke
      ctx.lineWidth = 12
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.shadowBlur = 0

      // Score text
      ctx.fillStyle = colors.text
      ctx.font = 'bold 32px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${Math.round(progress * 100)}`, cx, cy - 8)

      // Label
      ctx.fillStyle = 'rgba(148,163,184,0.8)'
      ctx.font = '11px Inter, system-ui, sans-serif'
      ctx.fillText('RISK SCORE', cx, cy + 22)
    }

    let start: number | null = null
    const duration = 900

    function animate(ts: number) {
      if (!start) start = ts
      const elapsed = ts - start
      const t = Math.min(elapsed / duration, 1)
      // Ease out quart
      const eased = 1 - Math.pow(1 - t, 4)
      progressRef.current = eased * target
      draw(progressRef.current)
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate)
      }
    }

    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [score, band, colors, target])

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} className="w-[140px] h-[140px]" />
    </div>
  )
}
