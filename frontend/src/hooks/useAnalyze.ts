import { useState } from 'react'
import axios, { AxiosError } from 'axios'
import { AnalysisResponse } from '../types'
import { getApiUrl } from '../config'

interface UseAnalyzeReturn {
  result: AnalysisResponse | null
  loading: boolean
  error: string | null
  analyze: (document: File, selfie: File | null) => Promise<void>
  reset: () => void
}

export function useAnalyze(): UseAnalyzeReturn {
  const [result, setResult] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = async (document: File, selfie: File | null) => {
    setLoading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('document', document)
    if (selfie) {
      formData.append('selfie', selfie)
    }

    try {
      const response = await axios.post<AnalysisResponse>(
        getApiUrl('/analyze-document'),
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120_000, // 2 min — OCR + face verification
        },
      )
      const data = response.data
      if (data.tampering?.heatmap_url && !data.tampering.heatmap_url.startsWith('http')) {
        data.tampering.heatmap_url = getApiUrl(data.tampering.heatmap_url)
      }
      setResult(data)
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail: string }>
      if (axiosErr.response?.data?.detail) {
        setError(axiosErr.response.data.detail)
      } else if (axiosErr.message) {
        setError(axiosErr.message)
      } else {
        setError('Unknown error occurred.')
      }
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setResult(null)
    setError(null)
    setLoading(false)
  }

  return { result, loading, error, analyze, reset }
}
