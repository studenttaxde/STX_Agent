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