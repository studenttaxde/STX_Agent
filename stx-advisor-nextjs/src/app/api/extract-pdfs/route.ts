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

    console.log(`Processing ${files.length} files`)

    // Process files with backend extraction only
    const results = []
    const failedResults = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`)
      
      try {
        // Use backend extraction with proper timeout
        const backendResult = await tryBackendExtraction(file)
        if (backendResult.success) {
          results.push(backendResult)
          console.log(`Backend extraction successful for ${file.name}`)
        } else {
          failedResults.push({
            filename: file.name,
            success: false,
            error: 'Backend extraction failed'
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

      // Add delay between files to prevent overwhelming
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    console.log(`Completed processing. Successful: ${results.length}, Failed: ${failedResults.length}`)

    // Check if any files were processed successfully
    if (results.length === 0) {
      return NextResponse.json({
        error: 'All files failed to process',
        details: failedResults
      }, { status: 500 })
    }

    // If some files failed, return partial success
    if (failedResults.length > 0) {
      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} files successfully, ${failedResults.length} failed`,
        results: results,
        failed: failedResults
      })
    }

    // All files processed successfully
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

async function tryBackendExtraction(file: File) {
  const formDataToSend = new FormData()
  formDataToSend.append('file', file)

  // Use a longer timeout for proper PDF extraction (20 seconds)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

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
      throw new Error(`Backend error: ${response.status}`)
    }

    const result = await response.json()
    return {
      filename: file.name,
      success: true,
      data: result
    }

  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Backend request timed out')
    }
    throw error
  }
}
