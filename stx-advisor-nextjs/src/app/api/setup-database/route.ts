import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST() {
  try {
    // Create tables if they don't exist
    const setupQueries = [
      // User Profiles Table
      `CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        email TEXT,
        full_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // Tax Filings Table
      `CREATE TABLE IF NOT EXISTS tax_filings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id TEXT NOT NULL,
        year INTEGER NOT NULL,
        gross_income DECIMAL(10,2) NOT NULL,
        income_tax_paid DECIMAL(10,2) NOT NULL,
        employer TEXT,
        full_name TEXT,
        deductions JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // User Deductions Table
      `CREATE TABLE IF NOT EXISTS user_deductions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id TEXT NOT NULL,
        year INTEGER NOT NULL,
        category TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    ]

    // Enable RLS
    const rlsQueries = [
      'ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE tax_filings ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE user_deductions ENABLE ROW LEVEL SECURITY'
    ]

    // Create RLS policies for anonymous access
    const policyQueries = [
      // User profiles policies
      `CREATE POLICY IF NOT EXISTS "Allow anonymous access to user_profiles" ON user_profiles FOR ALL USING (true)`,
      `CREATE POLICY IF NOT EXISTS "Allow anonymous insert to user_profiles" ON user_profiles FOR INSERT WITH CHECK (true)`,
      `CREATE POLICY IF NOT EXISTS "Allow anonymous update to user_profiles" ON user_profiles FOR UPDATE USING (true)`,
      
      // Tax filings policies
      `CREATE POLICY IF NOT EXISTS "Allow anonymous access to tax_filings" ON tax_filings FOR ALL USING (true)`,
      `CREATE POLICY IF NOT EXISTS "Allow anonymous insert to tax_filings" ON tax_filings FOR INSERT WITH CHECK (true)`,
      `CREATE POLICY IF NOT EXISTS "Allow anonymous update to tax_filings" ON tax_filings FOR UPDATE USING (true)`,
      
      // User deductions policies
      `CREATE POLICY IF NOT EXISTS "Allow anonymous access to user_deductions" ON user_deductions FOR ALL USING (true)`,
      `CREATE POLICY IF NOT EXISTS "Allow anonymous insert to user_deductions" ON user_deductions FOR INSERT WITH CHECK (true)`,
      `CREATE POLICY IF NOT EXISTS "Allow anonymous update to user_deductions" ON user_deductions FOR UPDATE USING (true)`
    ]

    // Execute setup queries
    for (const query of setupQueries) {
      const { error } = await supabase.rpc('exec_sql', { sql: query })
      if (error) {
        console.error('Setup query error:', error)
        // Continue anyway, tables might already exist
      }
    }

    // Execute RLS queries
    for (const query of rlsQueries) {
      const { error } = await supabase.rpc('exec_sql', { sql: query })
      if (error) {
        console.error('RLS query error:', error)
      }
    }

    // Execute policy queries
    for (const query of policyQueries) {
      const { error } = await supabase.rpc('exec_sql', { sql: query })
      if (error) {
        console.error('Policy query error:', error)
      }
    }

    // Test the connection
    const { data, error } = await supabase
      .from('user_profiles')
      .select('count')
      .limit(1)

    if (error) {
      return NextResponse.json({
        status: 'error',
        message: 'Database setup completed but connection test failed',
        error: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      status: 'success',
      message: 'Database setup completed successfully',
      data: data
    })

  } catch (error) {
    console.error('Database setup error:', error)
    return NextResponse.json({
      status: 'error',
      message: 'Database setup failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 