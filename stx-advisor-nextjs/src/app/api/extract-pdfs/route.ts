import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const maxDuration = 30 // Extend to 30 seconds for Netlify

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Process files sequentially to avoid overwhelming the backend
    const results = []
    const failedResults = []

    for (const file of files) {
      try {
        const formDataToSend = new FormData()
        formDataToSend.append('file', file)

        // Use a shorter timeout for each individual file
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 second timeout per file

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
          const errorText = await response.text()
          console.error(`Backend error for ${file.name}:`, response.status, errorText)
          failedResults.push({
            filename: file.name,
            success: false,
            error: `Backend error: ${response.status} - ${errorText}`
          })
          continue
        }

        const result = await response.json()
        results.push({
          filename: file.name,
          success: true,
          data: result
        })

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.error(`Timeout for ${file.name} after 25 seconds`)
          failedResults.push({
            filename: file.name,
            success: false,
            error: 'Request timed out after 25 seconds. Please try with a smaller file.'
          })
        } else {
          console.error(`Error processing ${file.name}:`, error)
          failedResults.push({
            filename: file.name,
            success: false,
            error: error instanceof Error ? error.message : 'Extraction failed'
          })
        }
      }
    }

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
