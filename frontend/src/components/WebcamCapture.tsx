import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, RefreshCw, Check, Upload, X, Loader2 } from 'lucide-react'

interface WebcamCaptureProps {
  onCapture: (file: File) => void
  onClear: () => void
  captured: { file: File; url: string } | null
}

type State = 'idle' | 'requesting' | 'streaming' | 'captured' | 'error'

export function WebcamCapture({ onCapture, onClear, captured }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [state, setState] = useState<State>(captured ? 'captured' : 'idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Sync state if captured prop changes externally
  useEffect(() => {
    if (captured) {
      setState('captured')
    } else if (state === 'captured') {
      setState('idle')
    }
  }, [captured])

  // Stop media stream tracks cleanly
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop()
        } catch {
          // ignore
        }
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // Callback ref for the video element to guarantee stream attachment upon DOM mount
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    if (node && streamRef.current) {
      node.muted = true
      node.srcObject = streamRef.current
      node.play().catch(err => {
        console.warn('Auto-play caught:', err)
      })
    }
  }, [])

  // Start the camera
  const openCamera = useCallback(async () => {
    setState('requesting')
    setErrorMsg('')
    stopStream()

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API not supported in this browser. Please use localhost or HTTPS.')
      }

      let stream: MediaStream | null = null

      // Attempt 1: standard user-facing camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
      } catch {
        // Attempt 2: fallback to any available video track
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      }

      if (!stream || stream.getVideoTracks().length === 0) {
        throw new Error('No active video track returned from camera.')
      }

      streamRef.current = stream

      // If video element is already mounted, attach immediately
      if (videoRef.current) {
        videoRef.current.muted = true
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(e => console.warn('Play error:', e))
      }

      setState('streaming')
    } catch (err: unknown) {
      stopStream()
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission') || msg.includes('denied') || msg.includes('NotAllowedError')) {
        setErrorMsg('Camera permission was denied. Please allow camera access in browser address bar.')
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFoundError')) {
        setErrorMsg('No camera device found on this system.')
      } else if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
        setErrorMsg('Camera is in use by another app or browser tab.')
      } else {
        setErrorMsg(`Camera error: ${msg}`)
      }
      setState('error')
    }
  }, [stopStream])

  // Stop camera when unmounting
  useEffect(() => {
    return () => {
      stopStream()
    }
  }, [stopStream])

  // Capture still frame
  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Mirror image horizontally to match preview
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, width, height)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    canvas.toBlob(
      blob => {
        if (!blob) return
        const file = new File([blob], `selfie_${Date.now()}.jpg`, { type: 'image/jpeg' })
        stopStream()
        setState('captured')
        onCapture(file)
      },
      'image/jpeg',
      0.95,
    )
  }, [stopStream, onCapture])

  const retake = useCallback(() => {
    stopStream()
    onClear()
    setState('idle')
  }, [stopStream, onClear])

  const containerStyle: React.CSSProperties = {
    border: '1px solid var(--hairline)',
    borderRadius: 2,
    overflow: 'hidden',
    background: 'var(--bg)',
    position: 'relative',
    minHeight: 130,
  }

  // ── Captured still preview ────────────────────────────────────────────────
  if (captured) {
    return (
      <div style={containerStyle}>
        <img
          src={captured.url}
          alt="Captured live face"
          style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(0,0,0,0.7)',
            padding: '4px 8px',
          }}
        >
          <span style={{ fontSize: 10, fontFamily: '"IBM Plex Mono"', color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check style={{ width: 11, height: 11, color: 'var(--low)' }} />
            Face captured
          </span>
          <button
            onClick={retake}
            aria-label="Retake photo"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 2,
              color: '#fff',
              fontSize: 10.5,
              padding: '2px 7px',
              cursor: 'pointer',
            }}
          >
            <RefreshCw style={{ width: 10, height: 10 }} /> Retake
          </button>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    )
  }

  // ── Live Streaming ────────────────────────────────────────────────────────
  if (state === 'streaming') {
    return (
      <div style={containerStyle}>
        <video
          ref={setVideoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={e => {
            const v = e.currentTarget
            v.play().catch(err => console.warn('Play on loadedmetadata failed:', err))
          }}
          onCanPlay={e => {
            const v = e.currentTarget
            v.play().catch(err => console.warn('Play on canplay failed:', err))
          }}
          style={{
            width: '100%',
            height: 130,
            objectFit: 'cover',
            display: 'block',
            transform: 'scaleX(-1)', // mirror preview
            background: '#000',
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Shutter and Cancel overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '6px',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
          }}
        >
          {/* Shutter button */}
          <button
            onClick={captureFrame}
            aria-label="Capture photo"
            title="Capture photo"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '2px solid #fff',
              background: 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff' }} />
          </button>

          {/* Close camera button */}
          <button
            onClick={() => {
              stopStream()
              setState('idle')
            }}
            aria-label="Close camera"
            title="Close camera"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: 'rgba(0,0,0,0.6)',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              padding: '2px 4px',
            }}
          >
            <X style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>
    )
  }

  // ── Requesting state ──────────────────────────────────────────────────────
  if (state === 'requesting') {
    return (
      <div
        style={{
          ...containerStyle,
          height: 130,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          color: 'var(--ink-soft)',
        }}
      >
        <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite', color: 'var(--steel)' }} />
        <span style={{ fontSize: 11 }}>Opening camera…</span>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div
        style={{
          ...containerStyle,
          height: 130,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px',
          background: 'var(--high-soft)',
          border: '1px solid var(--high)',
        }}
      >
        <CameraOff style={{ width: 16, height: 16, color: 'var(--high)' }} />
        <p style={{ fontSize: 10.5, color: 'var(--high)', textAlign: 'center', lineHeight: 1.35, margin: 0 }}>
          {errorMsg}
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <button
            className="btn-ghost"
            style={{ fontSize: 10.5, padding: '2px 8px' }}
            onClick={() => setState('idle')}
          >
            Retry
          </button>
          <label
            className="btn-ghost"
            style={{
              fontSize: 10.5,
              padding: '2px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Upload style={{ width: 10, height: 10 }} />
            Upload file
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) {
                  setState('captured')
                  onCapture(file)
                }
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    )
  }

  // ── Idle state (default) ──────────────────────────────────────────────────
  return (
    <div
      style={{
        ...containerStyle,
        height: 130,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <button
        onClick={openCamera}
        className="btn-primary"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          padding: '0.45rem 0.9rem',
        }}
      >
        <Camera style={{ width: 13, height: 13 }} />
        Open camera
      </button>

      <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>or</span>

      {/* File upload fallback */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          color: 'var(--steel)',
          cursor: 'pointer',
        }}
      >
        <Upload style={{ width: 11, height: 11 }} />
        Upload selfie image
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) {
              setState('captured')
              onCapture(file)
            }
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
