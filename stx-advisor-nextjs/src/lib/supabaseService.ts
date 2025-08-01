import { supabase } from './supabase';
import { ExtractedData, DeductionSummary, TaxCalculation } from '@/types';

export interface LossCarryforwardData {
  used: number;
  remaining: number;
  year: number;
  userId: string;
}

export interface TaxFilingResult {
  user_id: string;
  tax_year: number;
  gross_income: number;
  tax_paid: number;
  taxable_income: number;
  total_deductions: number;
  loss_carryforward_used: number;
  loss_carryforward_remaining: number;
  estimated_refund: number;
  refund_type: 'full' | 'partial' | 'none';
  refund_reason: string;
  filing_date: string;
  filing_json: any;
  agent_notes?: string;
}

// Legacy interfaces for backward compatibility
export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaxFiling {
  id: string;
  user_id: string;
  year: number;
  gross_income: number;
  tax_paid: number;
  total_deductions: number;
  estimated_refund: number;
  filing_data: any;
  created_at: string;
  updated_at: string;
}

export interface UserDeduction {
  id: string;
  user_id: string;
  year: number;
  category: string;
  amount: number;
  description: string;
  created_at: string;
}

// Generate a simple user ID based on browser fingerprint or create a new one
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

// Get or create user profile
export const getUserProfile = async (): Promise<UserProfile | null> => {
  const userId = generateUserId()
  
  try {
    // Try to get existing profile
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected for new users
      console.error('Error fetching user profile:', error)
      return null
    }

    if (data) {
      return data
    }

    // Create new profile
    const { data: newProfile, error: createError } = await supabase
      .from('user_profiles')
      .insert({
        id: userId,
        email: null,
        full_name: null
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating user profile:', createError)
      return null
    }

    return newProfile
  } catch (error) {
    console.error('getUserProfile error:', error)
    return null
  }
}

// Save tax filing
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

// Get tax filings for a user
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

// Get tax filing by year
export const getTaxFilingByYear = async (userId: string, year: number): Promise<TaxFiling | null> => {
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching tax filing by year:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('getTaxFilingByYear error:', error)
    return null
  }
}

// Save user deduction
export const saveUserDeduction = async (deduction: Omit<UserDeduction, 'id' | 'created_at'>): Promise<UserDeduction | null> => {
  try {
    const { data, error } = await supabase
      .from('user_deductions')
      .insert(deduction)
      .select()
      .single()

    if (error) {
      console.error('Error saving user deduction:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('saveUserDeduction error:', error)
    return null
  }
}

// Get user deductions by year
export const getUserDeductionsByYear = async (userId: string, year: number): Promise<UserDeduction[]> => {
  try {
    const { data, error } = await supabase
      .from('user_deductions')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)

    if (error) {
      console.error('Error fetching user deductions:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('getUserDeductionsByYear error:', error)
    return []
  }
}

// Update user profile
export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating user profile:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('updateUserProfile error:', error)
    return null
  }
}

// Check if user has existing data for a year
export const hasExistingData = async (userId: string, year: number): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .select('id')
      .eq('user_id', userId)
      .eq('year', year)
      .limit(1)

    if (error) {
      console.error('Error checking existing data:', error)
      return false
    }

    return (data && data.length > 0) || false
  } catch (error) {
    console.error('hasExistingData error:', error)
    return false
  }
}

// Get suggested deductions based on previous years
export const getSuggestedDeductions = async (userId: string, year: number): Promise<any[]> => {
  try {
    // Get deductions from previous years
    const { data, error } = await supabase
      .from('user_deductions')
      .select('category, amount')
      .eq('user_id', userId)
      .lt('year', year)
      .order('year', { ascending: false })

    if (error) {
      console.error('Error fetching suggested deductions:', error)
      return []
    }

    // Group by category and calculate average
    const categoryMap = new Map<string, { total: number; count: number }>()
    
    data?.forEach(deduction => {
      const category = deduction.category
      const amount = parseFloat(deduction.amount) || 0
      
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { total: 0, count: 0 })
      }
      
      const current = categoryMap.get(category)!
      current.total += amount
      current.count += 1
    })

    // Convert to suggested deductions format
    const suggestions = Array.from(categoryMap.entries()).map(([category, stats]) => ({
      category,
      amount: Math.round(stats.total / stats.count * 100) / 100, // Average
      frequency: stats.count
    }))

    return suggestions
  } catch (error) {
    console.error('getSuggestedDeductions error:', error)
    return []
  }
}

export class SupabaseService {
  /**
   * Get loss carryforward data for a user and year
   */
  static async getLossCarryforward(userId: string, year: number): Promise<LossCarryforwardData | null> {
    try {
      const { data, error } = await supabase
        .from('user_tax_data')
        .select('loss_carryforward, loss_carryforward_used, loss_carryforward_remaining')
        .eq('user_id', userId)
        .eq('tax_year', year - 1) // Get from previous year
        .single();

      if (error) {
        console.error('Error fetching loss carryforward:', error);
        return null;
      }

      if (!data) {
        return {
          used: 0,
          remaining: 0,
          year: year - 1,
          userId
        };
      }

      return {
        used: data.loss_carryforward_used || 0,
        remaining: data.loss_carryforward_remaining || 0,
        year: year - 1,
        userId
      };
    } catch (error) {
      console.error('Error in getLossCarryforward:', error);
      return null;
    }
  }

  /**
   * Apply loss carryforward and update remaining amount
   */
  static async applyLossCarryforward(
    userId: string, 
    year: number, 
    amountToApply: number
  ): Promise<{ applied: number; remaining: number }> {
    try {
      // Get available loss carryforward
      const lossData = await this.getLossCarryforward(userId, year);
      const availableLoss = lossData?.remaining || 0;
      
      // Calculate how much to apply
      const appliedAmount = Math.min(availableLoss, amountToApply);
      const remainingAmount = availableLoss - appliedAmount;

      // Update current year with applied loss
      const { error: currentYearError } = await supabase
        .from('user_tax_data')
        .upsert({
          user_id: userId,
          tax_year: year,
          loss_carryforward_used: appliedAmount,
          loss_carryforward_remaining: remainingAmount,
          updated_at: new Date().toISOString()
        });

      if (currentYearError) {
        console.error('Error updating current year loss carryforward:', currentYearError);
        throw new Error('Failed to update loss carryforward');
      }

      return {
        applied: appliedAmount,
        remaining: remainingAmount
      };
    } catch (error) {
      console.error('Error in applyLossCarryforward:', error);
      throw error;
    }
  }

  /**
   * Store complete tax filing result
   */
  static async storeTaxFilingResult(
    userId: string,
    year: number,
    summary: DeductionSummary,
    extractedData: ExtractedData,
    agentNotes?: string
  ): Promise<TaxFilingResult> {
    try {
      const filingResult: TaxFilingResult = {
        user_id: userId,
        tax_year: year,
        gross_income: extractedData.gross_income || 0,
        tax_paid: extractedData.income_tax_paid || 0,
        taxable_income: summary.taxableIncome,
        total_deductions: summary.totalDeductions,
        loss_carryforward_used: summary.verlustvortrag || 0,
        loss_carryforward_remaining: 0, // Will be calculated based on previous year
        estimated_refund: summary.refund,
        refund_type: summary.isBelowThreshold ? 'full' : (summary.refund > 0 ? 'partial' : 'none'),
        refund_reason: this.generateRefundReason(summary),
        filing_date: new Date().toISOString().split('T')[0],
        filing_json: {
          summary,
          extractedData,
          deductions: summary.deductions,
          timestamp: new Date().toISOString()
        },
        agent_notes: agentNotes
      };

      const { error } = await supabase
        .from('user_tax_data')
        .upsert(filingResult);

      if (error) {
        console.error('Error storing tax filing result:', error);
        throw new Error('Failed to store tax filing result');
      }

      return filingResult;
    } catch (error) {
      console.error('Error in storeTaxFilingResult:', error);
      throw error;
    }
  }

  /**
   * Get user's tax filing history
   */
  static async getUserTaxHistory(userId: string): Promise<TaxFilingResult[]> {
    try {
      const { data, error } = await supabase
        .from('user_tax_data')
        .select('*')
        .eq('user_id', userId)
        .order('tax_year', { ascending: false });

      if (error) {
        console.error('Error fetching user tax history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getUserTaxHistory:', error);
      return [];
    }
  }

  /**
   * Log errors to Supabase for monitoring
   */
  static async logError(
    conversationId: string,
    errorType: string,
    errorMessage: string,
    additionalData?: any
  ): Promise<void> {
    try {
      await supabase
        .from('supabase-logs')
        .insert({
          conversation_id: conversationId,
          error_type: errorType,
          error_message: errorMessage,
          additional_data: additionalData,
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging to Supabase:', error);
      // Don't throw here to avoid cascading errors
    }
  }

  /**
   * Store conversation state for resuming sessions
   */
  static async storeConversationState(
    conversationId: string,
    userId: string,
    state: any
  ): Promise<void> {
    try {
      await supabase
        .from('conversation_states')
        .upsert({
          conversation_id: conversationId,
          user_id: userId,
          state_data: state,
          updated_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error storing conversation state:', error);
      throw error;
    }
  }

  /**
   * Retrieve conversation state for resuming sessions
   */
  static async getConversationState(
    conversationId: string
  ): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('conversation_states')
        .select('state_data')
        .eq('conversation_id', conversationId)
        .single();

      if (error) {
        console.error('Error retrieving conversation state:', error);
        return null;
      }

      return data?.state_data || null;
    } catch (error) {
      console.error('Error in getConversationState:', error);
      return null;
    }
  }

  /**
   * Generate human-readable refund reason
   */
  private static generateRefundReason(summary: DeductionSummary): string {
    if (summary.isBelowThreshold) {
      return `Full refund: Your taxable income (€${summary.taxableIncome.toFixed(2)}) is below the tax-free threshold (€${summary.threshold?.toFixed(2) || 'unknown'})`;
    } else if (summary.refund > 0) {
      return `Partial refund: Your deductions reduced your taxable income, resulting in a refund of €${summary.refund.toFixed(2)}`;
    } else {
      return 'No refund: Your calculated tax due exceeds the amount already paid';
    }
  }

  /**
   * Get tax-free thresholds by year
   */
  static getTaxFreeThresholds(): Record<number, number> {
    return {
      2021: 9744,
      2022: 10347,
      2023: 10908,
      2024: 10908,
      2025: 11280,
      2026: 11640
    };
  }

  /**
   * Check if income is below tax-free threshold
   */
  static isBelowThreshold(income: number, year: number): boolean {
    const thresholds = this.getTaxFreeThresholds();
    const threshold = thresholds[year];
    return threshold !== undefined && income < threshold;
  }

  /**
   * Calculate progressive German tax brackets
   */
  static calculateGermanTax(taxableIncome: number, year: number): number {
    // German progressive tax calculation
    if (year === 2021) {
      if (taxableIncome <= 9744) return 0;
      if (taxableIncome <= 14753) return (taxableIncome - 9744) * 0.14;
      if (taxableIncome <= 57918) return 701.26 + (taxableIncome - 14753) * 0.42;
      if (taxableIncome <= 274612) return 18149.26 + (taxableIncome - 57918) * 0.42;
      return 113839.26 + (taxableIncome - 274612) * 0.45;
    } else if (year === 2024) {
      if (taxableIncome <= 10908) return 0;
      if (taxableIncome <= 15999) return (taxableIncome - 10908) * 0.14;
      if (taxableIncome <= 62809) return 712.74 + (taxableIncome - 15999) * 0.42;
      if (taxableIncome <= 277825) return 19683.74 + (taxableIncome - 62809) * 0.42;
      return 90421.74 + (taxableIncome - 277825) * 0.45;
    }
    
    // Default simplified calculation for other years
    return Math.max(0, taxableIncome * 0.15);
  }

  /**
   * Calculate solidarity surcharge (5.5% of income tax)
   */
  static calculateSolidaritySurcharge(incomeTax: number): number {
    return incomeTax * 0.055;
  }
} 