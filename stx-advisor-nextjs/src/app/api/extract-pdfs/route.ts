import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const maxDuration = 10 // Netlify limit - 10 seconds maximum

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    console.log(`Processing ${files.length} files with ultra-fast extraction`)

    const results = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`)
      
      try {
        const result = await extractWithUltraFastBackend(file)
        results.push(result)
        console.log(`Ultra-fast extraction successful for ${file.name}`)
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        results.push({
          filename: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Ultra-fast extraction failed'
        })
      }

      // No delay between files for maximum speed
    }

    console.log(`Completed processing ${results.length} files`)
    
    return NextResponse.json({
      success: true,
      results: results
    })

  } catch (error) {
    console.error('PDF extraction error:', error)
    return NextResponse.json({
      error: 'Extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function extractWithUltraFastBackend(file: File) {
  const formDataToSend = new FormData()
  formDataToSend.append('file', file)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 6000) // 6 second timeout for ultra-fast processing

  try {
    const response = await fetch(`${config.backendUrl}/extract-text`, {
      method: 'POST',
      body: formDataToSend,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Backend service error: ${response.status}`)
    }

    const result = await response.json()
    return {
      filename: file.name,
      success: true,
      data: result
    }

  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}
