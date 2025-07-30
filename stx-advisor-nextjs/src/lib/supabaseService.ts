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