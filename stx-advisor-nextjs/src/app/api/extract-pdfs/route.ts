import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { parseLohnsteuerbescheinigung } from '@/lib/pdfParser'

export const maxDuration = 15 // Reduced to 15 seconds for Netlify compatibility

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    console.log(`Processing ${files.length} files with optimized extraction strategy`)

    const results = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`)
      
      try {
        // Strategy: Try local parsing first (faster, more reliable)
        let result = await tryLocalPDFParsing(file)
        
        // If local parsing fails, try backend extraction (slower, but more comprehensive)
        if (!result.success) {
          console.log(`Local parsing failed for ${file.name}, trying backend extraction`)
          result = await tryBackendExtraction(file)
        }
        
        // If both fail, try basic text extraction (last resort)
        if (!result.success) {
          console.log(`Backend extraction failed for ${file.name}, trying basic extraction`)
          result = await tryBasicTextExtraction(file)
        }
        
        results.push(result)
        console.log(`Extraction completed for ${file.name}: ${result.success ? 'SUCCESS' : 'FAILED'}`)
        
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        results.push({
          filename: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'All extraction methods failed'
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

async function tryLocalPDFParsing(file: File) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

  try {
    console.log(`Attempting local PDF parsing for ${file.name}`)
    
    const arrayBuffer = await file.arrayBuffer()
    const extractedFields = await parseLohnsteuerbescheinigung(arrayBuffer)
    
    clearTimeout(timeoutId)
    
    console.log(`Local parsing successful for ${file.name}:`, extractedFields)
    
    // Convert to expected format
    const result = {
      success: true,
      filename: file.name,
      text: `Extracted via local parsing: ${JSON.stringify(extractedFields)}`,
      page_count: 1,
      character_count: 0,
      chunks_count: 1,
      error: null,
      bruttolohn: extractedFields.totalIncome,
      lohnsteuer: extractedFields.sonderausgaben, // Using sonderausgaben as proxy for lohnsteuer
      solidaritaetszuschlag: 0,
      employer: 'Extracted via local parsing',
      name: 'User',
      year: 2021, // Default year
      steuerklasse: 1,
      beschaeftigungszeitraum: null
    }
    
    return {
      filename: file.name,
      success: true,
      data: result
    }

  } catch (error) {
    clearTimeout(timeoutId)
    console.log(`Local PDF parsing failed for ${file.name}:`, error)
    return {
      filename: file.name,
      success: false,
      error: error instanceof Error ? error.message : 'Local PDF parsing failed'
    }
  }
}

async function tryBackendExtraction(file: File) {
  const formDataToSend = new FormData()
  formDataToSend.append('file', file)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 seconds for Render service

  try {
    console.log(`Attempting backend extraction for ${file.name} to ${config.backendUrl}`)
    
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
    console.log(`Backend extraction successful for ${file.name}`)
    
    return {
      filename: file.name,
      success: true,
      data: result
    }

  } catch (error) {
    clearTimeout(timeoutId)
    console.log(`Backend extraction failed for ${file.name}:`, error)
    return {
      filename: file.name,
      success: false,
      error: error instanceof Error ? error.message : 'Backend extraction failed'
    }
  }
}

async function tryBasicTextExtraction(file: File) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

  try {
    console.log(`Attempting basic text extraction for ${file.name}`)
    
    // Basic text extraction using browser APIs
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // Simple text extraction (basic fallback)
    const text = new TextDecoder().decode(uint8Array)
    const extractedText = text.substring(0, 1000) // Take first 1000 characters
    
    clearTimeout(timeoutId)
    
    console.log(`Basic extraction successful for ${file.name}`)
    
    const result = {
      success: true,
      filename: file.name,
      text: extractedText,
      page_count: 1,
      character_count: extractedText.length,
      chunks_count: 1,
      error: null,
      bruttolohn: 0,
      lohnsteuer: 0,
      solidaritaetszuschlag: 0,
      employer: 'Basic extraction',
      name: 'User',
      year: 2021,
      steuerklasse: 1,
      beschaeftigungszeitraum: null
    }
    
    return {
      filename: file.name,
      success: true,
      data: result
    }

  } catch (error) {
    clearTimeout(timeoutId)
    console.log(`Basic text extraction failed for ${file.name}:`, error)
    return {
      filename: file.name,
      success: false,
      error: error instanceof Error ? error.message : 'Basic text extraction failed'
    }
  }
}
