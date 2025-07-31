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
    const pdfFiles = formData.getAll('pdfs') as File[]
    
    if (!statusKey || !pdfFiles || pdfFiles.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: statusKey and pdfs' },
        { status: 400 }
      )
    }
    
    // Process each PDF and aggregate results
    const aggregatedData: ExtractedData = {
      totalIncome: 0
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
    }
    
    // Load rules and compute deductions
    const rules = loadRulesForYear(2024)
    const filtered = filterCategories(rules, statusKey, aggregatedData)
    const deductionResults = computeDeductions(filtered, aggregatedData)
    
    // Check if income is below basic allowance
    if (aggregatedData.totalIncome <= rules.basicAllowance) {
      return NextResponse.json({
        message: `Your total income (€${aggregatedData.totalIncome.toLocaleString('de-DE')}) is below the basic allowance (€${rules.basicAllowance.toLocaleString('de-DE')}). No deductions needed.`
      })
    }
    
    // Convert DeductionResult to DeductionItem for compatibility
    const deductions = deductionResults.map(convertDeductionResult)
    
    // Return deductions array
    return NextResponse.json(deductions)
    
  } catch (error) {
    console.error('Autodetect error:', error)
    return NextResponse.json(
      { error: 'Failed to process PDFs' },
      { status: 500 }
    )
  }
} 