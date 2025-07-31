import { NextResponse } from 'next/server'
import { TaxAdvisor } from '@/lib/taxAdvisor'

export async function POST() {
  try {
    console.log('Testing TaxAdvisor initialization')
    
    // Check if OpenAI API key is available
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('OpenAI API key not found')
      return NextResponse.json({
        error: 'OpenAI API key not configured',
        message: 'Please set OPENAI_API_KEY in your environment variables'
      }, { status: 500 })
    }
    
    console.log('OpenAI API key found, creating TaxAdvisor instance')
    
    // Try to create a TaxAdvisor instance
    const advisor = new TaxAdvisor(apiKey)
    console.log('TaxAdvisor instance created successfully')
    
    // Try to set some test data
    advisor.setExtractedData({
      year: 2025,
      gross_income: 5000,
      income_tax_paid: 1500,
      employer: 'Test Employer',
      full_name: 'Test User'
    })
    console.log('Test data set successfully')
    
    // Try to get the initial message
    const message = await advisor.nextAdvisorMessage()
    console.log('Initial message generated:', message)
    
    return NextResponse.json({
      success: true,
      message: 'TaxAdvisor is working correctly',
      initialMessage: message
    })
    
  } catch (error) {
    console.error('TaxAdvisor test error:', error)
    return NextResponse.json({
      error: 'TaxAdvisor test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
} 