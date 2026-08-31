import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileImage, Upload, Camera, X } from 'lucide-react'
import { AnalysisResponse } from '../types'
import { WebcamCapture } from './WebcamCapture'

interface LeftPanelProps {
  result: AnalysisResponse | null
  loading: boolean
  onUpload: (doc: File, selfie: File | null) => void
  onClear: () => void
}

interface FilePreview { file: File; url: string }

const IMG_ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
}

function DropZoneSlot({
  label,
  preview,
  onDrop,
  onClear,
  accept,
}: {
  label: string
  preview: FilePreview | null
  onDrop: (f: File) => void
  onClear: () => void
  accept: Record<string, string[]>
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: accepted => accepted[0] && onDrop(accepted[0]),
    accept,
    multiple: false,
    maxSize: 10 * 1024 * 1024,
  })

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>{label}</div>
      {preview ? (
        <div style={{ position: 'relative' }}>
          <img
            src={preview.url}
            alt={label}
            style={{
              width: '100%',
              height: 110,
              objectFit: 'cover',
              border: '1px solid var(--hairline)',
              borderRadius: 2,
              display: 'block',
            }}
          />
          <button
            onClick={onClear}
            aria-label={`Remove ${label}`}
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderRadius: 2,
              cursor: 'pointer',
              padding: '1px 3px',
              display: 'flex',
            }}
          >
            <X style={{ width: 11, height: 11, color: 'var(--ink-soft)' }} />
          </button>
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.5))',
              padding: '6px 6px 4px',
              fontSize: 10,
              fontFamily: '"IBM Plex Mono"',
              color: '#fff',
              borderRadius: '0 0 2px 2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {preview.file.name}
          </div>
        </div>
      ) : (
        <div
          {...getRootProps()}
          style={{
            height: 110,
            border: `1px dashed ${isDragActive ? 'var(--steel)' : 'var(--hairline)'}`,
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            cursor: 'pointer',
            background: isDragActive ? 'var(--steel-soft)' : 'transparent',
            transition: 'all 120ms',
          }}
        >
          <input {...getInputProps()} />
          <Upload style={{ width: 16, height: 16, color: 'var(--ink-faint)' }} />
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center' }}>
            {isDragActive ? 'Drop here' : 'Drop or click'}
          </span>
        </div>
      )}
    </div>
  )
}


export function LeftPanel({ result, loading, onUpload, onClear }: LeftPanelProps) {
  const [docFile, setDocFile] = useState<FilePreview | null>(null)
  const [selfieFile, setSelfieFile] = useState<FilePreview | null>(null)

  const makePreview = useCallback((setter: typeof setDocFile) => (file: File) => {
    setter(prev => { if (prev) URL.revokeObjectURL(prev.url); return { file, url: URL.createObjectURL(file) } })
  }, [])

  const clearDoc = () => {
    if (docFile) URL.revokeObjectURL(docFile.url)
    setDocFile(null)
  }

  const clearSelfie = () => {
    if (selfieFile) URL.revokeObjectURL(selfieFile.url)
    setSelfieFile(null)
  }

  const handleAnalyze = () => {
    if (!docFile) return
    onUpload(docFile.file, selfieFile?.file ?? null)
  }

  const handleClear = () => {
    clearDoc()
    clearSelfie()
    onClear()
  }

  const fv = result?.face_verification

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Capture section */}
      <div style={{ padding: '12px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <FileImage style={{ width: 11, height: 11 }} /> Document scan
        </div>
        <DropZoneSlot
          label="Identity document"
          preview={docFile}
          onDrop={makePreview(setDocFile)}
          onClear={clearDoc}
          accept={IMG_ACCEPT}
        />
      </div>

      <div style={{ padding: '12px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Camera style={{ width: 11, height: 11 }} />
          Live face capture
        </div>
        <WebcamCapture
          captured={selfieFile}
          onCapture={file => {
            if (selfieFile) URL.revokeObjectURL(selfieFile.url)
            setSelfieFile({ file, url: URL.createObjectURL(file) })
          }}
          onClear={clearSelfie}
        />
      </div>

      {/* Face similarity */}
      {fv && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>Face similarity</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              background: fv.matched === true
                ? 'var(--low-soft)'
                : fv.matched === false
                  ? 'var(--high-soft)'
                  : 'var(--steel-soft)',
              borderRadius: 2,
            }}
          >
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: fv.matched === true ? 'var(--low)' : fv.matched === false ? 'var(--high)' : 'var(--ink-soft)',
            }}>
              {fv.matched === true ? '✓ Match' : fv.matched === false ? '✗ No match' : '— Unavailable'}
            </span>
            {fv.distance !== null && (
              <span style={{ fontFamily: '"IBM Plex Mono"', fontSize: 11, color: 'var(--ink-soft)' }}>
                {fv.distance.toFixed(3)}
              </span>
            )}
          </div>
          {fv.match_status === 'library_unavailable' && (
            <p style={{ fontSize: 10.5, color: 'var(--high)', marginTop: 5, lineHeight: 1.4 }}>
              ⚠ dlib not installed — manual verification required
            </p>
          )}
        </div>
      )}

      {/* Seeded test hint */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 5 }}>Test document numbers</div>
        {[
          { num: 'IND1234567', status: 'valid', color: 'var(--low)' },
          { num: 'IND9999999', status: 'expired', color: 'var(--med)' },
          { num: 'IND0000001', status: 'blacklisted', color: 'var(--high)' },
        ].map(({ num, status, color }) => (
          <div key={num} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ fontFamily: '"IBM Plex Mono"', fontSize: 11, color: 'var(--ink)' }}>{num}</span>
            <span style={{ fontSize: 11, color }}>{status}</span>
          </div>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Action buttons */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          className="btn-primary"
          style={{ fontSize: 12.5, padding: '0.5rem 0.75rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={handleAnalyze}
          disabled={!docFile || loading}
        >
          {loading ? 'Analyzing…' : 'Run screening'}
        </button>
        {(result || loading) && (
          <button className="btn-ghost" style={{ fontSize: 12, width: '100%' }} onClick={handleClear}>
            Clear traveler
          </button>
        )}
      </div>
    </div>
  )
}
