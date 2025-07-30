import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwvmhmstwnrwcqgazqtu.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3dm1obXN0d25yd2NxZ2F6cXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MTA2NDEsImV4cCI6MjA2ODE4NjY0MX0.60h2Qyt5aguL6ea1hJTio7ICs7S4bK2mHRsorHjGcXs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface UserProfile {
  id: string
  email?: string
  full_name?: string
  created_at: string
  updated_at: string
}

export interface TaxFiling {
  id: string
  user_id: string
  year: number
  gross_income: number
  income_tax_paid: number
  employer: string
  full_name: string
  taxable_income?: number
  refund?: number
  deductions: Record<string, any>
  created_at: string
  updated_at: string
}

export interface UserDeduction {
  id: string
  user_id: string
  category: string
  amount: number
  details: string
  year: number
  created_at: string
} 