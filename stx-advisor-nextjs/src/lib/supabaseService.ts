import { supabase, UserProfile, TaxFiling, UserDeduction } from './supabase'

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
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching user profile:', error)
      return null
    }
    
    if (data) {
      return data
    }
    
    // Create new profile if not found
    const { data: newProfile, error: createError } = await supabase
      .from('user_profiles')
      .insert({
        id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (createError) {
      console.error('Error creating user profile:', createError)
      return null
    }
    
    return newProfile
  } catch (error) {
    console.error('Error in getUserProfile:', error)
    return null
  }
}

// Save tax filing data
export const saveTaxFiling = async (filingData: {
  year: number
  gross_income: number
  income_tax_paid: number
  employer: string
  full_name: string
  taxable_income?: number
  refund?: number
  deductions: Record<string, any>
}): Promise<TaxFiling | null> => {
  const userId = generateUserId()
  
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .insert({
        user_id: userId,
        ...filingData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error saving tax filing:', error)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Error in saveTaxFiling:', error)
    return null
  }
}

// Get tax filings for a user
export const getTaxFilings = async (): Promise<TaxFiling[]> => {
  const userId = generateUserId()
  
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
    console.error('Error in getTaxFilings:', error)
    return []
  }
}

// Get tax filing by year
export const getTaxFilingByYear = async (year: number): Promise<TaxFiling | null> => {
  const userId = generateUserId()
  
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching tax filing by year:', error)
      return null
    }
    
    return data || null
  } catch (error) {
    console.error('Error in getTaxFilingByYear:', error)
    return null
  }
}

// Save user deduction
export const saveUserDeduction = async (deductionData: {
  category: string
  amount: number
  details: string
  year: number
}): Promise<UserDeduction | null> => {
  const userId = generateUserId()
  
  try {
    const { data, error } = await supabase
      .from('user_deductions')
      .insert({
        user_id: userId,
        ...deductionData,
        created_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error saving user deduction:', error)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Error in saveUserDeduction:', error)
    return null
  }
}

// Get user deductions by year
export const getUserDeductionsByYear = async (year: number): Promise<UserDeduction[]> => {
  const userId = generateUserId()
  
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
    console.error('Error in getUserDeductionsByYear:', error)
    return []
  }
}

// Update user profile
export const updateUserProfile = async (updates: Partial<UserProfile>): Promise<UserProfile | null> => {
  const userId = generateUserId()
  
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating user profile:', error)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Error in updateUserProfile:', error)
    return null
  }
}

// Check if user has existing data for a year
export const hasExistingData = async (year: number): Promise<boolean> => {
  const userId = generateUserId()
  
  try {
    const { data, error } = await supabase
      .from('tax_filings')
      .select('id')
      .eq('user_id', userId)
      .eq('year', year)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error checking existing data:', error)
      return false
    }
    
    return !!data
  } catch (error) {
    console.error('Error in hasExistingData:', error)
    return false
  }
}

// Get suggested deductions for a year
export const getSuggestedDeductions = async (year: number): Promise<UserDeduction[]> => {
  const userId = generateUserId()
  
  try {
    const { data, error } = await supabase
      .from('user_deductions')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
    
    if (error) {
      console.error('Error fetching suggested deductions:', error)
      return []
    }
    
    return data || []
  } catch (error) {
    console.error('Error in getSuggestedDeductions:', error)
    return []
  }
} 