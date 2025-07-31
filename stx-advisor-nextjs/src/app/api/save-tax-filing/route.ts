import { NextRequest, NextResponse } from 'next/server'
import { saveTaxFiling } from '@/lib/supabaseService'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Validate required fields
    const requiredFields = ['taxYear', 'statusKey', 'deductions']
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    // Validate tax year
    const currentYear = new Date().getFullYear()
    if (data.taxYear < 2018 || data.taxYear > currentYear + 1) {
      return NextResponse.json(
        { error: 'Invalid tax year. Must be between 2018 and current year + 1' },
        { status: 400 }
      )
    }

    // Validate deductions
    if (!Array.isArray(data.deductions) || data.deductions.length === 0) {
      return NextResponse.json(
        { error: 'At least one deduction is required' },
        { status: 400 }
      )
    }

    // Generate user ID (in a real app, this would come from authentication)
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Calculate total income from extracted fields or use a default
    const totalIncome = data.extractedFields?.totalIncome || 0

    // Prepare tax filing data
    const taxFilingData = {
      user_id: userId,
      year: data.taxYear,
      gross_income: totalIncome,
      income_tax_paid: data.extractedFields?.sonderausgaben || 0,
      employer: data.extractedFields?.employer || 'Unknown',
      full_name: 'User',
      deductions: data.deductions,
      taxable_income: totalIncome - (data.totalDeductions || 0),
      refund: 0 // Will be calculated by tax system
    }

    console.log('Saving tax filing:', taxFilingData)

    // Save to database
    const savedFiling = await saveTaxFiling(taxFilingData)

    if (!savedFiling) {
      return NextResponse.json(
        { error: 'Failed to save tax filing to database' },
        { status: 500 }
      )
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Tax filing saved successfully',
      filingId: savedFiling.id,
      summary: {
        year: data.taxYear,
        totalIncome,
        totalDeductions: data.totalDeductions || 0,
        taxableIncome: totalIncome - (data.totalDeductions || 0)
      }
    })

  } catch (error) {
    console.error('Save tax filing error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to save tax filing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 