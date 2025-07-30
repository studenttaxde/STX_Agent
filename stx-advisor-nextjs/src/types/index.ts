// Core types for the tax agent application

export interface ExtractedData {
  full_name?: string;
  address?: string;
  employer?: string;
  total_hours?: number;
  gross_income?: number;
  income_tax_paid?: number;
  year?: number;
  fallback?: string;
  error?: string;
}

// Enhanced German tax document fields
export interface GermanTaxFields {
  name?: string;
  employer?: string;
  time_period_from?: string; // Format: DD.MM.YYYY
  time_period_to?: string;   // Format: DD.MM.YYYY
  bruttolohn?: number;       // Gross income
  lohnsteuer?: number;       // Income tax
  solidaritaetszuschlag?: number; // Solidarity tax
  year?: number;
  error?: string;
}

// German Tax Advisor Types
export type UserStatus = 'bachelor' | 'master' | 'new_employee' | 'full_time';

export interface DeductionQuestion {
  id: string;
  question: string;
  category: string;
  maxAmount?: number;
  required?: boolean;
  dependsOn?: string; // ID of another question that must be answered first
}

export interface DeductionAnswer {
  questionId: string;
  answer: boolean;
  amount?: number;
  details?: string;
}

export interface DeductionFlow {
  status: UserStatus;
  questions: DeductionQuestion[];
  order: string[]; // Array of question IDs in order
}

export interface TaxCalculation {
  grossIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  estimatedTax: number;
  taxPaid: number;
  refund: number;
  year: number;
}

export interface DeductionSummary {
  totalDeductions: number;
  deductions: Array<{
    category: string;
    amount: number;
    description: string;
  }>;
  taxableIncome: number;
  refund: number;
}

// Single PDF extraction result
export interface PDFExtractionResult {
  success: boolean;
  filename: string;
  text: string;
  page_count: number;
  character_count: number;
  extractedData?: GermanTaxFields;
  error?: string;
}

// Multiple PDF extraction response
export interface MultiPDFExtractionResponse {
  success: boolean;
  total_files: number;
  successful_extractions: number;
  failed_extractions: number;
  results: PDFExtractionResult[];
  summary: TaxSummary;
}

// Summary of all processed PDFs
export interface TaxSummary {
  total_bruttolohn: number;
  total_lohnsteuer: number;
  total_solidaritaetszuschlag: number;
  processed_files: number;
  failed_files: number;
  time_periods: Array<{
    filename: string;
    from: string;
    to: string;
  }>;
}

export interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

export interface ConversationState {
  messages: Message[];
  extractedData: ExtractedData | null;
  multiPDFData: MultiPDFExtractionResponse | null;
  currentQuestion: string | null;
  answers: Record<string, string>;
  step: 'idle' | 'extracting' | 'asking' | 'done';
  loading: boolean;
  filedSummaries: string[];
  uploadProgress: Record<string, number>; // filename -> progress percentage
}

export interface TaxAdvisorResponse {
  advisor_message: string;
  filled_form?: Record<string, unknown>;
  done: boolean;
}

export interface PDFExtractionResponse {
  success: boolean;
  filename: string;
  text: string;
  page_count: number;
  character_count: number;
}

// PDF Extractor Service Response Types
export interface PDFExtractorSingleResponse {
  success: boolean;
  filename: string;
  text: string;
  page_count: number;
  character_count: number;
  error?: string;
}

export interface PDFExtractorMultipleResponse {
  success: boolean;
  total_files: number;
  successful_extractions: number;
  failed_extractions: number;
  total_pages: number;
  total_characters: number;
  results: PDFExtractorSingleResponse[];
}

export interface TaxThresholds {
  [year: number]: number;
}

export interface UserData {
  year?: number;
  gross_income?: number;
  income_tax_paid?: number;
  intended_year?: string;
  status?: UserStatus;
  [key: string]: string | number | undefined;
}

export interface ConversationHistory {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface TaxAdvisorState {
  conversationHistory: ConversationHistory[];
  extractedData: ExtractedData;
  userData: UserData;
  askedQuestions: Set<string>;
  filedYears: Set<number>;
  deductionAnswers: Record<string, DeductionAnswer>;
  currentQuestionIndex: number;
  deductionFlow?: DeductionFlow;
  taxCalculation?: TaxCalculation;
  done?: boolean;
}

// File upload progress tracking
export interface FileUploadProgress {
  filename: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}
