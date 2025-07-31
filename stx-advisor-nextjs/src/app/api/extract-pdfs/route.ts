import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const maxDuration = 60 // Extend to 60 seconds for Netlify

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    console.log(`Processing ${files.length} files`)

    // Process files sequentially to avoid overwhelming the backend
    const results = []
    const failedResults = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`)
      
      try {
        const formDataToSend = new FormData()
        formDataToSend.append('file', file)

        // Use a longer timeout for each individual file (40 seconds)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 40000) // 40 second timeout per file

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

        console.log(`Successfully processed ${file.name}`)

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.error(`Timeout for ${file.name} after 40 seconds`)
          failedResults.push({
            filename: file.name,
            success: false,
            error: 'Request timed out after 40 seconds. Please try with a smaller file or fewer files.'
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

      // Add a small delay between files to prevent overwhelming the backend
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
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
