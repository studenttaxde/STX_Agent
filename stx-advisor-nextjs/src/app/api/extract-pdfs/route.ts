import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const maxDuration = 30 // 30 seconds for Netlify

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    console.log(`Processing ${files.length} files with reliable extraction`)

    // Process files with robust, reliable extraction
    const results = []
    const failedResults = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`)
      
      try {
        // Try reliable backend extraction with retries
        const extractionResult = await tryReliableExtraction(file)
        if (extractionResult.success) {
          results.push(extractionResult)
          console.log(`Reliable extraction successful for ${file.name}`)
        } else {
          failedResults.push({
            filename: file.name,
            success: false,
            error: 'error' in extractionResult ? extractionResult.error : 'Extraction failed'
          })
        }

      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        failedResults.push({
          filename: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Extraction failed'
        })
      }

      // Minimal delay between files
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`Completed processing. Successful: ${results.length}, Failed: ${failedResults.length}`)

    // Return detailed results
    if (results.length === 0) {
      return NextResponse.json({
        error: 'All files failed to process',
        details: failedResults
      }, { status: 500 })
    }

    if (failedResults.length > 0) {
      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} files successfully, ${failedResults.length} failed`,
        results: results,
        failed: failedResults
      })
    }

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

async function tryReliableExtraction(file: File) {
  const maxRetries = 2
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries} for ${file.name}`)
      
      // Try backend extraction with optimized timeout
      const result = await tryBackendExtraction(file)
      if (result.success) {
        return result
      }
      
      // If backend returns success: false, try again
      if (attempt < maxRetries) {
        console.log(`Backend returned failure, retrying in 1 second...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')
      console.log(`Attempt ${attempt} failed for ${file.name}:`, lastError.message)
      
      if (attempt < maxRetries) {
        console.log(`Retrying in 1 second...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  // All attempts failed
  return {
    filename: file.name,
    success: false,
    error: lastError?.message || 'All extraction attempts failed'
  }
}

async function tryBackendExtraction(file: File) {
  const formDataToSend = new FormData()
  formDataToSend.append('file', file)

  // Optimized timeout for reliable extraction (15 seconds)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    console.log(`Sending ${file.name} to backend service`)
    
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
      throw new Error(`Backend service error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    console.log(`Backend extraction result for ${file.name}:`, result)
    
    // Validate the result has required fields
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid response format from backend service')
    }

    return {
      filename: file.name,
      success: true,
      data: result
    }

  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Backend service request timed out')
    }
    
    if (error instanceof Error && error.message.includes('fetch')) {
      throw new Error('Backend service is unavailable')
    }
    
    throw error
  }
}
