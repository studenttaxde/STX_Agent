import { NextRequest, NextResponse } from 'next/server'
import { loadRulesForYear, filterCategories, computeDeductions, type YearRules, type RuleConfig, type DeductionResult } from '@/lib/taxAdvisor'
import { parseLohnsteuerbescheinigung, type ExtractedFields } from '@/lib/pdfParser'

interface DeductionItem {
  category: string
  basis: number
  cap: number | null
  deductible: number
  label?: string
  rationale?: string
}

interface ExtractedData {
  totalIncome: number
  [key: string]: number
}

// Convert ExtractedFields to Record<string, number> for compatibility
function convertExtractedFields(fields: ExtractedFields): Record<string, number> {
  return {
    totalIncome: fields.totalIncome,
    werbungskosten: fields.werbungskosten,
    sozialversicherung: fields.sozialversicherung,
    sonderausgaben: fields.sonderausgaben
  }
}

// Convert DeductionResult to DeductionItem for compatibility
function convertDeductionResult(result: DeductionResult): DeductionItem {
  return {
    category: result.categoryKey,
    basis: result.basis,
    cap: result.cap,
    deductible: result.deductible,
    label: result.label,
    rationale: result.rationale
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const statusKey = formData.get('statusKey') as string
    const taxYearStr = formData.get('taxYear') as string
    const pdfFiles = formData.getAll('pdfs') as File[]
    
    if (!statusKey || !pdfFiles || pdfFiles.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: statusKey and pdfs' },
        { status: 400 }
      )
    }
    
    // Parse tax year (default to current year if not provided)
    const taxYear = taxYearStr ? parseInt(taxYearStr) : new Date().getFullYear()
    const currentYear = new Date().getFullYear()
    
    if (taxYear < 2018 || taxYear > currentYear + 1) {
      return NextResponse.json(
        { error: 'Invalid tax year. Must be between 2018 and current year + 1' },
        { status: 400 }
      )
    }
    
    // Process each PDF and aggregate results
    const aggregatedData: ExtractedData = {
      totalIncome: 0
    }
    
    const extractedFields: ExtractedFields = {
      totalIncome: 0,
      werbungskosten: 0,
      sozialversicherung: 0,
      sonderausgaben: 0,
      year: taxYear,
      employer: 'Unknown'
    }
    
    for (const pdfFile of pdfFiles) {
      // For testing, process any file type
      // In production, this should only process PDFs
      const buffer = await pdfFile.arrayBuffer()
      const parsed = await parseLohnsteuerbescheinigung(buffer)
      const converted = convertExtractedFields(parsed)
      
      // Aggregate the data
      Object.entries(converted).forEach(([key, value]) => {
        if (typeof value === 'number') {
          aggregatedData[key] = (aggregatedData[key] || 0) + value
        }
      })
      
      // Update extracted fields
      extractedFields.totalIncome += parsed.totalIncome
      extractedFields.werbungskosten += parsed.werbungskosten
      extractedFields.sozialversicherung += parsed.sozialversicherung
      extractedFields.sonderausgaben += parsed.sonderausgaben
      
      // Extract employer from filename if available
      if (pdfFile.name.toLowerCase().includes('employer')) {
        extractedFields.employer = pdfFile.name.replace('.pdf', '').replace(/\d+/g, '').trim()
      }
    }
    
    console.log('Processing deductions for:', { statusKey, taxYear, totalIncome: aggregatedData.totalIncome })
    
    // Load rules for the specified year
    const rules = loadRulesForYear(taxYear)
    console.log('Loaded rules for year:', taxYear, 'Basic allowance:', rules.basicAllowance)
    
    const filtered = filterCategories(rules, statusKey, aggregatedData)
    console.log('Filtered categories for status:', statusKey, 'Count:', filtered.length)
    
    const deductionResults = computeDeductions(filtered, aggregatedData)
    console.log('Computed deductions:', deductionResults.length, 'results')
    
    // Check if income is below basic allowance
    if (aggregatedData.totalIncome <= rules.basicAllowance) {
      return NextResponse.json({
        message: `Your total income (€${aggregatedData.totalIncome.toLocaleString('de-DE')}) is below the basic allowance (€${rules.basicAllowance.toLocaleString('de-DE')}) for ${taxYear}. No deductions needed.`
      })
    }
    
    // Convert DeductionResult to DeductionItem for compatibility
    const deductions = deductionResults.map(convertDeductionResult)
    console.log('Final deductions for frontend:', deductions)
    
    // Return deductions array with extracted fields for validation
    return NextResponse.json({
      deductions,
      extractedFields,
      taxYear,
      summary: {
        totalIncome: aggregatedData.totalIncome,
        basicAllowance: rules.basicAllowance,
        year: taxYear
      }
    })
    
  } catch (error) {
    console.error('Autodetect error:', error)
    return NextResponse.json(
      { error: 'Failed to process PDFs' },
      { status: 500 }
    )
  }
} 