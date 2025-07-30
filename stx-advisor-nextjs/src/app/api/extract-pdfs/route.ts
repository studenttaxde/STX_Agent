import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const uploadPromises = files.map(async (file) => {
      const formDataToSend = new FormData()
      formDataToSend.append('file', file)

      // Add timeout to the fetch request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      try {
        const response = await fetch(`${config.backendUrl}/extract-text`, {
          method: 'POST',
          body: formDataToSend,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`Failed to extract text from ${file.name}: ${response.status}`)
        }

        return response.json()
      } catch (error) {
        clearTimeout(timeoutId)
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Timeout extracting text from ${file.name}`)
        }
        throw error
      }
    })

    const results = await Promise.all(uploadPromises)

    // Aggregate the results
    let totalGrossIncome = 0
    let totalIncomeTaxPaid = 0
    let totalSolidaritaetszuschlag = 0
    let employer = ''
    let fullName = ''
    let year = ''

    results.forEach((result) => {
      if (result.bruttolohn) {
        const bruttolohn = typeof result.bruttolohn === 'string' ? parseFloat(result.bruttolohn) : result.bruttolohn
        if (!isNaN(bruttolohn)) {
          totalGrossIncome += bruttolohn
        }
      }
      
      if (result.lohnsteuer) {
        const lohnsteuer = typeof result.lohnsteuer === 'string' ? parseFloat(result.lohnsteuer) : result.lohnsteuer
        if (!isNaN(lohnsteuer)) {
          totalIncomeTaxPaid += lohnsteuer
        }
      }
      
      if (result.solidaritaetszuschlag) {
        const solidaritaetszuschlag = typeof result.solidaritaetszuschlag === 'string' ? parseFloat(result.solidaritaetszuschlag) : result.solidaritaetszuschlag
        if (!isNaN(solidaritaetszuschlag)) {
          totalSolidaritaetszuschlag += solidaritaetszuschlag
        }
      }

      if (result.employer && !employer) {
        employer = result.employer
      }
      
      if (result.name && !fullName) {
        fullName = result.name
      }
      
      if (result.year && !year) {
        year = result.year.toString()
      }
    })

    const aggregatedData = {
      year: year || new Date().getFullYear().toString(),
      gross_income: totalGrossIncome,
      income_tax_paid: totalIncomeTaxPaid,
      solidaritaetszuschlag: totalSolidaritaetszuschlag,
      employer: employer || 'Unknown',
      full_name: fullName || 'User',
      results: results
    }

    return NextResponse.json(aggregatedData)
  } catch (error) {
    console.error('Error processing files:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process files' },
      { status: 500 }
    )
  }
}
