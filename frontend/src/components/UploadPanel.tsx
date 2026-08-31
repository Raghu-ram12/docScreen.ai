import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Camera, X, FileImage, Loader2, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'

interface UploadPanelProps {
  loading: boolean
  onAnalyze: (document: File, selfie: File | null) => void
  onReset: () => void
  hasResult: boolean
}

interface FilePreview {
  file: File
  url: string
}

function DropZone({
  label,
  hint,
  icon: Icon,
  preview,
  onDrop,
  onClear,
  accept,
  required,
}: {
  label: string
  hint: string
  icon: typeof Upload
  preview: FilePreview | null
  onDrop: (f: File) => void
  onClear: () => void
  accept: Record<string, string[]>
  required?: boolean
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => accepted[0] && onDrop(accepted[0]),
    accept,
    multiple: false,
    maxSize: 10 * 1024 * 1024,
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {required && <span className="text-xs text-red-400">required</span>}
        {!required && <span className="text-xs text-slate-500">optional</span>}
      </div>

      {preview ? (
        <div className="relative group rounded-xl overflow-hidden border border-white/10 bg-navy-800">
          <img
            src={preview.url}
            alt={label}
            className="w-full h-36 object-cover"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={onClear}
              className="flex items-center gap-2 text-white text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
            <p className="text-white text-xs truncate flex items-center gap-1">
              <FileImage className="w-3 h-3 shrink-0" />
              {preview.file.name}
            </p>
          </div>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 min-h-[9rem]',
            isDragActive
              ? 'border-blue-400 bg-blue-500/10'
              : 'border-white/10 hover:border-white/20 bg-white/2 hover:bg-white/5',
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-7 h-7 text-slate-500" />
          <p className="text-sm text-slate-400 text-center">
            {isDragActive ? 'Drop it here…' : 'Drag & drop or click to browse'}
          </p>
          <p className="text-xs text-slate-600 text-center">{hint}</p>
        </div>
      )}
    </div>
  )
}

const IMG_ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
}

export function UploadPanel({ loading, onAnalyze, onReset, hasResult }: UploadPanelProps) {
  const [docFile, setDocFile] = useState<FilePreview | null>(null)
  const [selfieFile, setSelfieFile] = useState<FilePreview | null>(null)

  const setPreview = useCallback(
    (setter: typeof setDocFile) => (file: File) => {
      setter({ file, url: URL.createObjectURL(file) })
    },
    [],
  )

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
    onAnalyze(docFile.file, selfieFile?.file ?? null)
  }

  const handleReset = () => {
    clearDoc()
    clearSelfie()
    onReset()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="section-title">Upload Documents</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Upload an identity document (passport, ID card) and an optional live selfie
          for face verification. Max 10 MB per file.
        </p>
      </div>

      <DropZone
        label="Identity Document"
        hint="JPG, PNG, WEBP, BMP — passport / ID card"
        icon={FileImage}
        preview={docFile}
        onDrop={setPreview(setDocFile)}
        onClear={clearDoc}
        accept={IMG_ACCEPT}
        required
      />

      <DropZone
        label="Live Selfie"
        hint="Photo of the person for face matching"
        icon={Camera}
        preview={selfieFile}
        onDrop={setPreview(setSelfieFile)}
        onClear={clearSelfie}
        accept={IMG_ACCEPT}
      />

      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={handleAnalyze}
          disabled={!docFile || loading}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200',
            docFile && !loading
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40'
              : 'bg-white/5 text-slate-500 cursor-not-allowed',
          )}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Analyze Document
            </>
          )}
        </button>

        {hasResult && (
          <button
            onClick={handleReset}
            className="w-full py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
          >
            Clear & Start Over
          </button>
        )}
      </div>

      {/* Seeded test doc hint */}
      <div className="rounded-xl bg-white/3 border border-white/5 p-3 space-y-1">
        <p className="text-xs font-semibold text-slate-400">Seeded test documents</p>
        <div className="space-y-1 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-slate-300">IND1234567</span>
            <span className="text-emerald-400">✅ valid</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-300">IND9999999</span>
            <span className="text-amber-400">⏳ expired</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-300">IND0000001</span>
            <span className="text-red-400">🚫 blacklisted</span>
          </div>
        </div>
      </div>
    </div>
  )
}
