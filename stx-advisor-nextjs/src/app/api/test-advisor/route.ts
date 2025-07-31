import { NextResponse } from 'next/server'
import { TaxAdvisor } from '@/lib/taxAdvisor'

export async function POST() {
  try {
    console.log('Testing TaxAdvisor initialization')
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('OpenAI API key not found')
      return NextResponse.json({
        error: 'OpenAI API key not configured',
        message: 'Please set OPENAI_API_KEY in your environment variables'
      }, { status: 500 })
    }
    console.log('OpenAI API key found, creating TaxAdvisor instance')
    const advisor = new TaxAdvisor(apiKey)
    console.log('TaxAdvisor instance created successfully')
    
    // Set test data
    advisor.setExtractedData({
      year: 2025,
      gross_income: 5000,
      income_tax_paid: 1500,
      employer: 'Test Employer',
      full_name: 'Test User',
      solidaritaetszuschlag: 0
    })
    console.log('Test data set successfully')
    
    // Get initial message
    const message = await advisor.nextAdvisorMessage()
    console.log('Initial message generated:', message)
    
    // Test user response
    advisor.addUserMessage('yes')
    const response = await advisor.nextAdvisorMessage()
    console.log('Response to "yes":', response)
    
    return NextResponse.json({
      success: true,
      message: 'TaxAdvisor is working correctly',
      initialMessage: message,
      responseToYes: response
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