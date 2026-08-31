// ── API response types matching the backend exactly ──────────────────────────

export interface ExtractedFields {
  document_type?: string
  document_number?: string
  doc_number?: string
  full_name?: string
  surname?: string
  given_names?: string
  nationality?: string
  country?: string
  date_of_birth?: string
  expiry_date?: string
  expiration_date?: string
  issue_date?: string
  sex?: string
  father_name?: string
  address?: string
  personal_number?: string
  mrz_lines?: string[]
  raw_text?: string[]
  full_text?: string
  [key: string]: any
}

export interface ValidationResult {
  doc_number: string
  found: boolean
  status: 'valid' | 'expired' | 'blacklisted' | 'not_found'
  expiry_date: string | null
  is_valid: boolean
  message: string
}

export interface TamperingResult {
  tampering_score: number
  ela_score: number
  metadata_score: number
  noise_score: number
  suspicious_tags: string[]
  num_outlier_blocks: number
  heatmap_path: string
  heatmap_url: string | null
  mean_ela: number
  ela_outlier_fraction: number
  cv_of_variance: number
}

export interface FaceVerificationResult {
  matched: boolean | null
  distance: number | null
  threshold: number
  note: string
  match_status: 'ok' | 'no_selfie' | 'no_face_in_doc' | 'no_face_in_selfie' | 'library_unavailable' | 'error'
}

export interface RiskBreakdownComponent {
  sub_score: number
  weight: number
  weighted: number
  status?: string
  distance?: number | null
  flag?: boolean
}

export interface RiskBreakdown {
  validation: RiskBreakdownComponent
  tampering: RiskBreakdownComponent
  face: RiskBreakdownComponent
  blacklist: RiskBreakdownComponent
}

export interface RiskResult {
  score: number
  band: 'LOW' | 'MEDIUM' | 'HIGH'
  forced_high: boolean
  breakdown: RiskBreakdown
}

export interface AnalysisResponse {
  extracted_fields: ExtractedFields
  ocr_method: string
  validation: ValidationResult
  tampering: TamperingResult
  face_verification: FaceVerificationResult
  risk: RiskResult
}
