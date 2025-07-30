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

      // Increase timeout to 60 seconds for PDF processing
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

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
          const errorText = await response.text()
          console.error(`Backend error for ${file.name}:`, response.status, errorText)
          throw new Error(`Backend error: ${response.status} - ${errorText}`)
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
          console.error(`Timeout for ${file.name} after 60 seconds`)
          return {
            filename: file.name,
            success: false,
            error: 'Request timed out after 60 seconds. Please try with a smaller file or check your internet connection.'
          }
        }
        
        console.error(`Error processing ${file.name}:`, error)
        return {
          filename: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Extraction failed'
        }
      }
    })

    const results = await Promise.all(uploadPromises)
    
    // Check if any files were processed successfully
    const successfulResults = results.filter(r => r.success)
    const failedResults = results.filter(r => !r.success)
    
    if (successfulResults.length === 0) {
      return NextResponse.json({
        error: 'All files failed to process',
        details: failedResults
      }, { status: 500 })
    }
    
    // If some files failed, return partial success
    if (failedResults.length > 0) {
      return NextResponse.json({
        success: true,
        message: `Processed ${successfulResults.length} files successfully, ${failedResults.length} failed`,
        results: successfulResults,
        failed: failedResults
      })
    }
    
    // All files processed successfully
    return NextResponse.json({
      success: true,
      results: successfulResults
    })

  } catch (error) {
    console.error('PDF extraction error:', error)
    return NextResponse.json({
      error: 'Extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
