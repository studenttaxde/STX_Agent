import { NextRequest, NextResponse } from 'next/server';

// TODO: UNUSED - safe to delete after verification
// This API route exists but is not called from any frontend component

interface DeductionItem {
  category: string
  basis: number
  cap: number | null
  deductible: number
  label?: string
  rationale?: string
  overrideReason?: string
  isOverridden?: boolean
}

interface ExportData {
  deductions: DeductionItem[]
  taxYear: number
  statusKey: string
  extractedFields?: any
  summary: {
    totalDeductions: number
    overriddenItems: number
    timestamp: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const data: ExportData = await request.json()
    
    // Validate required fields
    if (!data.deductions || !Array.isArray(data.deductions)) {
      return NextResponse.json(
        { error: 'Invalid deductions data' },
        { status: 400 }
      )
    }

    // Generate HTML content for PDF
    const htmlContent = generatePDFHTML(data)
    
    // For now, return the HTML content as a downloadable file
    // In production, you would use a PDF generation library like puppeteer or pdf-lib
    const blob = new Blob([htmlContent], { type: 'text/html' })
    
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="tax-audit-${data.taxYear}-${new Date().toISOString().split('T')[0]}.html"`
      }
    })

  } catch (error) {
    console.error('PDF export error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF export' },
      { status: 500 }
    )
  }
}

function generatePDFHTML(data: ExportData): string {
  const totalDeductions = data.deductions.reduce((sum, item) => sum + item.deductible, 0)
  const overriddenItems = data.deductions.filter(item => item.isOverridden).length
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tax Audit Summary - ${data.taxYear}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #333;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .summary {
            background-color: #f8fafc;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 15px;
        }
        .summary-item {
            text-align: center;
        }
        .summary-value {
            font-size: 24px;
            font-weight: bold;
            color: #2563eb;
        }
        .summary-label {
            font-size: 14px;
            color: #64748b;
            margin-top: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
        }
        th {
            background-color: #f1f5f9;
            font-weight: bold;
        }
        .overridden {
            background-color: #fef3c7;
        }
        .rationale {
            font-size: 12px;
            color: #64748b;
            margin-top: 5px;
        }
        .override-reason {
            font-size: 12px;
            color: #dc2626;
            font-style: italic;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 12px;
            color: #64748b;
        }
        @media print {
            body { margin: 20px; }
            .header { page-break-after: avoid; }
            table { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Tax Audit Summary</h1>
        <h2>Tax Year: ${data.taxYear}</h2>
        <p>Generated on: ${new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}</p>
    </div>

    <div class="summary">
        <h3>Summary</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="summary-value">€${totalDeductions.toLocaleString('de-DE')}</div>
                <div class="summary-label">Total Deductions</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${data.deductions.length}</div>
                <div class="summary-label">Deduction Categories</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${overriddenItems}</div>
                <div class="summary-label">Overridden Items</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${data.statusKey}</div>
                <div class="summary-label">Tax Status</div>
            </div>
        </div>
    </div>

    <h3>Deduction Details</h3>
    <table>
        <thead>
            <tr>
                <th>Category</th>
                <th>Basis (€)</th>
                <th>Cap (€)</th>
                <th>Deductible (€)</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${data.deductions.map(deduction => `
                <tr class="${deduction.isOverridden ? 'overridden' : ''}">
                    <td>
                        <strong>${deduction.label || deduction.category}</strong>
                        ${deduction.rationale ? `<div class="rationale">${deduction.rationale}</div>` : ''}
                        ${deduction.overrideReason ? `<div class="override-reason">Override: ${deduction.overrideReason}</div>` : ''}
                    </td>
                    <td>€${deduction.basis.toLocaleString('de-DE')}</td>
                    <td>${deduction.cap ? `€${deduction.cap.toLocaleString('de-DE')}` : '—'}</td>
                    <td><strong>€${deduction.deductible.toLocaleString('de-DE')}</strong></td>
                    <td>${deduction.isOverridden ? 'Overridden' : 'Auto-calculated'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    ${data.extractedFields ? `
    <h3>Extracted Data</h3>
    <table>
        <thead>
            <tr>
                <th>Field</th>
                <th>Value</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Total Income</td>
                <td>€${(data.extractedFields.totalIncome || 0).toLocaleString('de-DE')}</td>
            </tr>
            <tr>
                <td>Employer</td>
                <td>${data.extractedFields.employer || 'Unknown'}</td>
            </tr>
            <tr>
                <td>Werbungskosten</td>
                <td>€${(data.extractedFields.werbungskosten || 0).toLocaleString('de-DE')}</td>
            </tr>
            <tr>
                <td>Sozialversicherung</td>
                <td>€${(data.extractedFields.sozialversicherung || 0).toLocaleString('de-DE')}</td>
            </tr>
            <tr>
                <td>Sonderausgaben</td>
                <td>€${(data.extractedFields.sonderausgaben || 0).toLocaleString('de-DE')}</td>
            </tr>
        </tbody>
    </table>
    ` : ''}

    <div class="footer">
        <p>This audit summary was generated by STX Tax Advisor</p>
        <p>For official tax filing, please consult with a qualified tax professional</p>
    </div>
</body>
</html>
  `
} 