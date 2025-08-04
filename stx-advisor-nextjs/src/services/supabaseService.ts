import { supabase } from './supabase';
import { 
  ExtractedData, 
  DeductionSummary, 
  TaxCalculation,
  UserProfile,
  TaxFiling,
  UserDeduction,
  LossCarryforwardData,
  TaxFilingResult
} from '@/types';

/**
 * Generate a simple user ID based on browser fingerprint or create a new one
 * @returns A unique user ID string
 */
const generateUserId = (): string => {
  // Try to get existing user ID from localStorage
  let userId = localStorage.getItem('stx_user_id')
  
  if (!userId) {
    // Create a new user ID
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('stx_user_id', userId)
  }
  
  return userId
}

/**
 * Save tax filing data to Supabase
 * @param filing - Tax filing data to save
 * @returns Promise resolving to saved TaxFiling or null if error
 */
export const saveTaxFiling = async (filing: Omit<TaxFiling, 'id' | 'created_at' | 'updated_at'>): Promise<TaxFiling | null> => {
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .insert(filing)
      .select()
      .single()

    if (error) {
      console.error('Error saving tax filing:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('saveTaxFiling error:', error)
    return null
  }
}

/**
 * Get all tax filings for a user from Supabase
 * @param userId - User ID to get filings for
 * @returns Promise resolving to array of TaxFiling objects or empty array if error
 */
export const getTaxFilings = async (userId: string): Promise<TaxFiling[]> => {
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .select('*')
      .eq('user_id', userId)
      .order('year', { ascending: false })

    if (error) {
      console.error('Error fetching tax filings:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('getTaxFilings error:', error)
    return []
  }
}

/**
 * Get tax filing for a specific year from Supabase
 * @param userId - User ID to get filing for
 * @param year - Tax year to get filing for
 * @returns Promise resolving to TaxFiling or null if not found
 */
export const getTaxFilingByYear = async (userId: string, year: number): Promise<TaxFiling | null> => {
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .single()

    if (error) {
      console.error('Error fetching tax filing by year:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('getTaxFilingByYear error:', error)
    return null
  }
}

/**
 * Check if user has existing data for a specific year
 * @param userId - User ID to check for
 * @param year - Tax year to check for
 * @returns Promise resolving to boolean indicating if data exists
 */
export const hasExistingData = async (userId: string, year: number): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .select('id')
      .eq('user_id', userId)
      .eq('year', year)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking existing data:', error)
      return false
    }

    return !!data
  } catch (error) {
    console.error('hasExistingData error:', error)
    return false
  }
}

/**
 * Get suggested deductions based on user's previous filings
 * @param userId - User ID to get suggestions for
 * @param year - Tax year to get suggestions for
 * @returns Promise resolving to array of deduction suggestions
 */
export const getSuggestedDeductions = async (userId: string, year: number): Promise<any[]> => {
  try {
    // Get previous year's deductions to suggest similar ones
    const previousYear = year - 1
    const { data, error } = await supabase
      .from('tax_filings')
      .select('deductions')
      .eq('user_id', userId)
      .eq('year', previousYear)
      .single()

    if (error || !data) {
      return []
    }

         // Parse deductions and return suggestions
     const deductions = data.deductions || {}
     const suggestions = Object.entries(deductions)
       .filter(([_, amount]) => (amount as number) > 0)
       .map(([category, amount]) => ({
         category,
         amount: amount as number,
         year: previousYear
       }))

    return suggestions
  } catch (error) {
    console.error('Error fetching suggested deductions:', error)
    return []
  }
}

/**
 * Supabase service class for advanced database operations
 */
export class SupabaseService {
  /**
   * Calculate German tax based on taxable income and year
   * @param taxableIncome - Taxable income amount
   * @param year - Tax year for calculation
   * @returns Calculated tax amount
   */
  static calculateGermanTax(taxableIncome: number, year: number): number {
    // Simplified German tax calculation
    // In a real implementation, this would use the actual German tax brackets
    
    if (taxableIncome <= 0) return 0
    
    // Basic progressive tax calculation
    let tax = 0
    
    if (taxableIncome <= 9744) {
      tax = 0
    } else if (taxableIncome <= 57918) {
      tax = (taxableIncome - 9744) * 0.14
    } else if (taxableIncome <= 274613) {
      tax = 6744 + (taxableIncome - 57918) * 0.42
    } else {
      tax = 6744 + (274613 - 57918) * 0.42 + (taxableIncome - 274613) * 0.45
    }
    
    return Math.round(tax)
  }

  /**
   * Calculate solidarity surcharge based on income tax
   * @param incomeTax - Income tax amount
   * @returns Solidarity surcharge amount
   */
  static calculateSolidaritySurcharge(incomeTax: number): number {
    return Math.round(incomeTax * 0.055)
  }

  /**
   * Get tax-free thresholds by year
   * @returns Record of year to threshold amount
   */
  static getTaxFreeThresholds(): Record<number, number> {
    return {
      2021: 9744,
      2022: 10347,
      2023: 10908,
      2024: 11604
    }
  }

  /**
   * Check if income is below tax-free threshold
   * @param income - Income amount to check
   * @param year - Tax year for threshold
   * @returns Boolean indicating if income is below threshold
   */
  static isBelowThreshold(income: number, year: number): boolean {
    const thresholds = this.getTaxFreeThresholds()
    const threshold = thresholds[year] || thresholds[2024]
    return income <= threshold
  }
} 