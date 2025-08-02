import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const maxDuration = 25 // Increased for Render service

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    console.log(`Processing ${files.length} files with real PDF extraction only`)

    const results = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`)
      
      try {
        // Only use real PDF extraction service - no fake data
        const result = await tryBackendExtraction(file)
        
        results.push(result)
        console.log(`Extraction completed for ${file.name}: ${result.success ? 'SUCCESS' : 'FAILED'}`)
        
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        results.push({
          filename: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Real PDF extraction failed'
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
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function tryBackendExtraction(file: File) {
  const formDataToSend = new FormData()
  formDataToSend.append('file', file)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000) // 20 seconds for Render service

  try {
    console.log(`Attempting real PDF extraction for ${file.name} to ${config.backendUrl}`)
    
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
    return {
      filename: file.name,
      success: false,
      error: error instanceof Error ? error.message : 'Real PDF extraction failed - please try again or contact support'
    }
  }
}
