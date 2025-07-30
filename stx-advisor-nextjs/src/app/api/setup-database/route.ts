import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST() {
  try {
    // Test basic connection first
    const { data: testData, error: testError } = await supabase
      .from('user_profiles')
      .select('count')
      .limit(1)

    if (testError) {
      console.error('Initial connection test failed:', testError)
      
      // Try to create a test user profile to see if it's a permissions issue
      const testUserId = 'test_user_' + Date.now()
      const { data: insertData, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: testUserId,
          email: 'test@example.com',
          full_name: 'Test User'
        })
        .select()
        .single()

      if (insertError) {
        console.error('Insert test failed:', insertError)
        return NextResponse.json({
          status: 'error',
          message: 'Database connection failed - RLS policies may be too restrictive',
          error: insertError.message,
          code: insertError.code
        }, { status: 500 })
      }

      // Clean up test data
      await supabase
        .from('user_profiles')
        .delete()
        .eq('id', testUserId)

      return NextResponse.json({
        status: 'success',
        message: 'Database connection working - RLS policies are correct',
        data: insertData
      })
    }

    return NextResponse.json({
      status: 'success',
      message: 'Database connection working',
      data: testData
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