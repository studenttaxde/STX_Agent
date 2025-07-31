import { NextRequest, NextResponse } from 'next/server'

interface DeductionItem {
  category: string
  basis: number
  cap: number | null
  deductible: number
  label?: string
  rationale?: string
}

interface TaxRules {
  basicAllowance: number
  categories: Record<string, {
    maxAmount: number
    percentage: number
    label: string
  }>
}

interface ExtractedData {
  totalIncome: number
  [key: string]: number
}

// Stub implementation for parsing PDF
function parseLohnsteuerbescheinigung(buffer: ArrayBuffer): Record<string, number> {
  // This would contain actual PDF parsing logic
  // For now, return mock data
  return {
    totalIncome: 25000,
    bruttoarbeitslohn: 25000,
    lohnsteuer: 4500,
    solidaritaetszuschlag: 247,
    krankenversicherung: 2000,
    rentenversicherung: 2300,
    arbeitslosenversicherung: 500,
    pflegeversicherung: 300
  }
}

// Stub implementation for loading tax rules
function loadRulesForYear(year: number): TaxRules {
  return {
    basicAllowance: 10908, // 2024 basic allowance
    categories: {
      'werbungskosten': {
        maxAmount: 1200,
        percentage: 100,
        label: 'Werbungskosten'
      },
      'sozialversicherung': {
        maxAmount: 5000,
        percentage: 100,
        label: 'Sozialversicherungsbeiträge'
      },
      'sonderausgaben': {
        maxAmount: 3000,
        percentage: 100,
        label: 'Sonderausgaben'
      }
    }
  }
}

// Stub implementation for filtering categories based on status
function filterCategories(rules: TaxRules, statusKey: string, extracted: ExtractedData): TaxRules {
  // Filter categories based on status and extracted data
  const filteredCategories: Record<string, any> = {}
  
  // Always include werbungskosten for all statuses
  if (rules.categories.werbungskosten) {
    filteredCategories.werbungskosten = rules.categories.werbungskosten
  }
  
  // Include sozialversicherung if relevant data exists
  if (extracted.krankenversicherung || extracted.rentenversicherung || extracted.arbeitslosenversicherung || extracted.pflegeversicherung) {
    if (rules.categories.sozialversicherung) {
      filteredCategories.sozialversicherung = rules.categories.sozialversicherung
    }
  }
  
  // Include sonderausgaben for certain statuses
  if (['bachelor', 'master', 'graduated_same_year'].includes(statusKey)) {
    if (rules.categories.sonderausgaben) {
      filteredCategories.sonderausgaben = rules.categories.sonderausgaben
    }
  }
  
  return {
    ...rules,
    categories: filteredCategories
  }
}

// Stub implementation for computing deductions
function computeDeductions(filtered: TaxRules, extracted: ExtractedData): DeductionItem[] {
  const deductions: DeductionItem[] = []
  
  // Compute Werbungskosten
  if (filtered.categories.werbungskosten) {
    const basis = Math.min(1200, extracted.totalIncome * 0.05) // 5% of income or 1200€ max
    deductions.push({
      category: 'werbungskosten',
      basis: basis,
      cap: filtered.categories.werbungskosten.maxAmount,
      deductible: Math.min(basis, filtered.categories.werbungskosten.maxAmount),
      label: filtered.categories.werbungskosten.label
    })
  }
  
  // Compute Sozialversicherung
  if (filtered.categories.sozialversicherung) {
    const socialTotal = (extracted.krankenversicherung || 0) + 
                       (extracted.rentenversicherung || 0) + 
                       (extracted.arbeitslosenversicherung || 0) + 
                       (extracted.pflegeversicherung || 0)
    
    if (socialTotal > 0) {
      deductions.push({
        category: 'sozialversicherung',
        basis: socialTotal,
        cap: filtered.categories.sozialversicherung.maxAmount,
        deductible: Math.min(socialTotal, filtered.categories.sozialversicherung.maxAmount),
        label: filtered.categories.sozialversicherung.label
      })
    }
  }
  
  // Compute Sonderausgaben
  if (filtered.categories.sonderausgaben) {
    const sonderausgaben = (extracted.lohnsteuer || 0) + (extracted.solidaritaetszuschlag || 0)
    if (sonderausgaben > 0) {
      deductions.push({
        category: 'sonderausgaben',
        basis: sonderausgaben,
        cap: filtered.categories.sonderausgaben.maxAmount,
        deductible: Math.min(sonderausgaben, filtered.categories.sonderausgaben.maxAmount),
        label: filtered.categories.sonderausgaben.label
      })
    }
  }
  
  return deductions
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
      if (pdfFile.type !== 'application/pdf') {
        continue // Skip non-PDF files
      }
      
      const buffer = await pdfFile.arrayBuffer()
      const parsed = parseLohnsteuerbescheinigung(buffer)
      
      // Aggregate the data
      Object.entries(parsed).forEach(([key, value]) => {
        if (typeof value === 'number') {
          aggregatedData[key] = (aggregatedData[key] || 0) + value
        }
      })
    }
    
    // Load rules and compute deductions
    const rules = loadRulesForYear(2024)
    const filtered = filterCategories(rules, statusKey, aggregatedData)
    const deductions = computeDeductions(filtered, aggregatedData)
    
    // Check if income is below basic allowance
    if (aggregatedData.totalIncome <= rules.basicAllowance) {
      return NextResponse.json({
        message: `Your total income (€${aggregatedData.totalIncome.toLocaleString('de-DE')}) is below the basic allowance (€${rules.basicAllowance.toLocaleString('de-DE')}). No deductions needed.`
      })
    }
    
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