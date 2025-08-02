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

    console.log(`Processing ${files.length} files with real PDF extraction`)

    const results = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`)
      
      // Check file size (max 10MB to avoid timeouts)
      if (file.size > 10 * 1024 * 1024) {
        results.push({
          filename: file.name,
          success: false,
          error: 'File too large (max 10MB). Please use a smaller PDF file.'
        })
        continue
      }
      
      // Check file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        results.push({
          filename: file.name,
          success: false,
          error: 'Only PDF files are supported. Please upload a PDF file.'
        })
        continue
      }
      
      try {
        // Use real PDF extraction with proper timeout handling
        const result = await tryBackendExtraction(file)
        
        results.push(result)
        console.log(`Extraction completed for ${file.name}: ${result.success ? 'SUCCESS' : 'FAILED'}`)
        
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        results.push({
          filename: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'PDF extraction service timeout - please try again'
        })
      }
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
      details: error instanceof Error ? error.message : 'Service timeout - please try again'
    }, { status: 500 })
  }
}

async function tryBackendExtraction(file: File) {
  const formDataToSend = new FormData()
  formDataToSend.append('file', file)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 seconds to stay under Netlify limit

  try {
    console.log(`Attempting real PDF extraction for ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) to ${config.backendUrl}`)
    
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
      if (response.status === 504) {
        throw new Error('PDF extraction service timeout - the service is taking too long to process your file. Please try again with a smaller file or contact support.')
      }
      throw new Error(`PDF extraction service error: ${response.status}`)
    }

    const result = await response.json()
    console.log(`Real PDF extraction successful for ${file.name}`)
    
    return {
      filename: file.name,
      success: true,
      data: result
    }

  } catch (error) {
    clearTimeout(timeoutId)
    console.log(`Real PDF extraction failed for ${file.name}:`, error)
    
    let errorMessage = 'Real PDF extraction failed - please try again or contact support'
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'PDF extraction timeout - the service is taking too long. Please try again with a smaller file or contact support.'
      } else if (error.message.includes('timeout')) {
        errorMessage = error.message
      }
    }
    
    return {
      filename: file.name,
      success: false,
      error: errorMessage
    }
  }
}
