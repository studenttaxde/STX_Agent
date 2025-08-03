import { NextRequest, NextResponse } from 'next/server';
import { parseLohnsteuerbescheinigung, type ExtractedFields } from '@/utils/pdfParser';
import { AutodetectSchema } from '@/types/validation';

interface DeductionItem {
  category: string;
  basis: number;
  cap: number | null;
  deductible: number;
  label?: string;
  rationale?: string;
}

interface ExtractedData {
  totalIncome: number;
  [key: string]: number;
}

// Tax rules by year
const TAX_RULES = {
  2021: {
    basicAllowance: 9744,
    categories: {
      Werbungskosten: { maxAmount: 1000, formula: 'totalIncome * 0.05' },
      Sozialversicherung: { maxAmount: 5000, formula: 'direct' },
      Sonderausgaben: { maxAmount: 3000, formula: 'incomeTax * 0.1' }
    }
  },
  2024: {
    basicAllowance: 10908,
    categories: {
      Werbungskosten: { maxAmount: 1000, formula: 'totalIncome * 0.05' },
      Sozialversicherung: { maxAmount: 5000, formula: 'direct' },
      Sonderausgaben: { maxAmount: 3000, formula: 'incomeTax * 0.1' }
    }
  }
};

/**
 * Convert ExtractedFields to Record<string, number> for compatibility
 */
function convertExtractedFields(fields: ExtractedFields): Record<string, number> {
  return {
    totalIncome: fields.totalIncome,
    werbungskosten: fields.werbungskosten,
    sozialversicherung: fields.sozialversicherung,
    sonderausgaben: fields.sonderausgaben
  };
}

/**
 * Load rules for a specific year
 */
function loadRulesForYear(year: number) {
  return TAX_RULES[year as keyof typeof TAX_RULES] || TAX_RULES[2024];
}

/**
 * Filter categories based on status and extracted data
 */
function filterCategories(rules: any, statusKey: string, extractedData: any) {
  const categories = rules.categories;
  const filtered: any = {};
  
  // Map status keys to relevant categories
  const statusCategoryMap: Record<string, string[]> = {
    bachelor: ['Werbungskosten', 'Sozialversicherung'],
    master: ['Werbungskosten', 'Sozialversicherung', 'Sonderausgaben'],
    new_employee: ['Werbungskosten', 'Sozialversicherung'],
    full_time: ['Werbungskosten', 'Sozialversicherung', 'Sonderausgaben']
  };
  
  const relevantCategories = statusCategoryMap[statusKey] || ['Werbungskosten'];
  
  relevantCategories.forEach(category => {
    if (categories[category]) {
      filtered[category] = categories[category];
    }
  });
  
  return filtered;
}

/**
 * Compute deductions based on rules and extracted data
 */
function computeDeductions(filteredRules: any, extractedData: any) {
  const deductions: any[] = [];
  
  Object.entries(filteredRules).forEach(([category, rule]: [string, any]) => {
    let amount = 0;
    let rationale = '';
    
    if (rule.formula === 'direct') {
      // Use direct extracted value
      amount = extractedData[category.toLowerCase()] || 0;
      rationale = `Direct extraction: €${amount}`;
    } else if (rule.formula.includes('totalIncome')) {
      // Calculate based on total income
      amount = Math.min(extractedData.totalIncome * 0.05, rule.maxAmount);
      rationale = `Calculated: ${extractedData.totalIncome} * 0.05 = €${amount}`;
    } else {
      // Default to extracted value or 0
      amount = extractedData[category.toLowerCase()] || 0;
      rationale = `Default extraction: €${amount}`;
    }
    
    // Cap the amount
    const finalAmount = Math.min(amount, rule.maxAmount);
    
    deductions.push({
      categoryKey: category,
      label: category,
      basis: amount,
      cap: rule.maxAmount,
      deductible: finalAmount,
      rationale: `${rationale} (capped at €${rule.maxAmount})`
    });
  });
  
  return deductions;
}

/**
 * Convert DeductionResult to DeductionItem for compatibility
 */
function convertDeductionResult(result: any): DeductionItem {
  return {
    category: result.categoryKey,
    basis: result.basis,
    cap: result.cap,
    deductible: result.deductible,
    label: result.label,
    rationale: result.rationale
  };
}

/**
 * Process PDF files and extract tax data
 */
async function processPDFFiles(pdfFiles: File[], taxYear: number) {
  const aggregatedData: ExtractedData = {
    totalIncome: 0
  };
  
  const extractedFields: ExtractedFields = {
    totalIncome: 0,
    werbungskosten: 0,
    sozialversicherung: 0,
    sonderausgaben: 0,
    year: taxYear,
    employer: 'Unknown'
  };
  
  for (const pdfFile of pdfFiles) {
    // For testing, process any file type
    // In production, this should only process PDFs
    const buffer = await pdfFile.arrayBuffer();
    const parsed = await parseLohnsteuerbescheinigung(buffer);
    const converted = convertExtractedFields(parsed);
    
    // Aggregate the data
    Object.entries(converted).forEach(([key, value]) => {
      if (typeof value === 'number') {
        aggregatedData[key] = (aggregatedData[key] || 0) + value;
      }
    });
    
    // Update extracted fields
    extractedFields.totalIncome += parsed.totalIncome;
    extractedFields.werbungskosten += parsed.werbungskosten;
    extractedFields.sozialversicherung += parsed.sozialversicherung;
    extractedFields.sonderausgaben += parsed.sonderausgaben;
    
    // Extract employer from filename if available
    if (pdfFile.name.includes('_')) {
      const parts = pdfFile.name.split('_');
      if (parts.length > 2) {
        extractedFields.employer = parts.slice(2, -1).join('_') || 'Unknown';
      }
    }
  }
  
  return { aggregatedData, extractedFields };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Validate the form data
    let validatedData;
    try {
      const statusKey = formData.get('statusKey') as string;
      const taxYearStr = formData.get('taxYear') as string;
      const pdfFiles = formData.getAll('pdfs') as File[];
      
      validatedData = {
        statusKey,
        taxYear: taxYearStr,
        pdfs: pdfFiles
      };
      
      // Basic validation (Zod doesn't work well with FormData)
      if (!statusKey || !pdfFiles || pdfFiles.length === 0) {
        return NextResponse.json(
          { error: 'Missing required fields: statusKey and pdfs' },
          { status: 400 }
        );
      }
      
      if (!['bachelor', 'master', 'new_employee', 'full_time'].includes(statusKey)) {
        return NextResponse.json(
          { error: 'Invalid statusKey. Must be one of: bachelor, master, new_employee, full_time' },
          { status: 400 }
        );
      }
      
    } catch (validationError) {
      console.error('Validation error:', validationError);
      return NextResponse.json(
        { error: 'Invalid request data', details: validationError },
        { status: 400 }
      );
    }
    
    const { statusKey, taxYear: taxYearStr, pdfs: pdfFiles } = validatedData;
    
    // Parse tax year (default to current year if not provided)
    const taxYear = taxYearStr ? parseInt(taxYearStr) : new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    
    if (taxYear < 2018 || taxYear > currentYear + 1) {
      return NextResponse.json(
        { error: 'Invalid tax year. Must be between 2018 and current year + 1' },
        { status: 400 }
      );
    }
    
    // Process PDF files
    const { aggregatedData, extractedFields } = await processPDFFiles(pdfFiles, taxYear);
    
    console.log('Final aggregated data:', aggregatedData);
    console.log('Extracted fields:', extractedFields);
    
    // Check if income is below basic allowance
    const rules = loadRulesForYear(taxYear);
    const basicAllowance = rules.basicAllowance;
    
    if (aggregatedData.totalIncome <= basicAllowance) {
      return NextResponse.json({
        message: `Your total income (€${aggregatedData.totalIncome.toLocaleString('de-DE')}) is below the basic allowance (€${basicAllowance.toLocaleString('de-DE')}). No deductions needed.`
      });
    }
    
    // Compute deductions
    const filtered = filterCategories(rules, statusKey, aggregatedData);
    const deductionResults = computeDeductions(filtered, aggregatedData);
    
    // Convert to expected format
    const deductions = deductionResults.map(convertDeductionResult);
    
    console.log('Computed deductions:', deductions);
    
    return NextResponse.json({
      deductions,
      extractedFields,
      taxYear,
      summary: {
        totalIncome: aggregatedData.totalIncome,
        basicAllowance,
        isBelowThreshold: false
      }
    });
    
  } catch (error) {
    console.error('Autodetect error:', error);
    return NextResponse.json(
      { error: 'Failed to process tax documents' },
      { status: 500 }
    );
  }
} 