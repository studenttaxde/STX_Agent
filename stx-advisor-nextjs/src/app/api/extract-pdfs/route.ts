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
      
      // Check file size (max 5MB to avoid timeouts)
      if (file.size > 5 * 1024 * 1024) {
        results.push({
          filename: file.name,
          success: false,
          error: 'File too large (max 5MB). Please use a smaller PDF file to avoid timeouts.'
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
        // Use real PDF extraction with optimized timeout handling
        const result = await tryBackendExtraction(file)
        
        results.push(result)
        console.log(`Extraction completed for ${file.name}: ${result.success ? 'SUCCESS' : 'FAILED'}`)
        
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        
        // Provide specific error messages based on the error type
        let errorMessage = 'PDF extraction failed';
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            errorMessage = 'PDF extraction timed out. The service is taking too long to process your file. Please try with a smaller file (under 5MB) or try again later.';
          } else if (error.message.includes('timeout')) {
            errorMessage = 'PDF extraction service timeout. Please try again with a smaller file or contact support.';
          } else {
            errorMessage = error.message;
          }
        }
        
        results.push({
          filename: file.name,
          success: false,
          error: errorMessage
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
  const timeoutId = setTimeout(() => controller.abort(), 7000) // 7 seconds to stay well under Netlify limit

  try {
    console.log(`Attempting real PDF extraction for ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) to ${config.backendUrl}`)
    
    // First, check if the service is available
    try {
      const healthCheck = await fetch(`${config.backendUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      })
      
      if (!healthCheck.ok) {
        throw new Error(`Backend service is not responding properly (${healthCheck.status}). Please try again later.`)
      }
    } catch (healthError) {
      console.warn('Health check failed, proceeding anyway:', healthError)
    }
    
    const response = await fetch(`${config.backendUrl}/extract`, {
      method: 'POST',
      body: formDataToSend,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    });

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 504) {
        throw new Error('PDF extraction service timeout - the service is taking too long to process your file. Please try again with a smaller file or contact support.')
      }
      throw new Error(`PDF extraction service error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || 'PDF extraction failed')
    }

    // Handle unified response format
    if (data.results && data.results.length > 0) {
      const result = data.results[0] // Single file extraction
      if (result.status === 'success') {
        return {
          filename: file.name,
          success: true,
          data: result.text,
          metadata: result.metadata || {}
        }
      } else {
        throw new Error(result.error || 'PDF extraction failed')
      }
    }

    // Fallback for old format
    return {
      filename: file.name,
      success: true,
      data: data.extracted_text,
      metadata: data.metadata || {}
    }

  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('PDF extraction timed out. Please try with a smaller file (under 5MB) or try again later.')
    }
    
    throw error
  }
}
