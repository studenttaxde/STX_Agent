import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GermanTaxFields, MultiPDFExtractionResponse, TaxSummary, PDFExtractionResult } from '@/types';
import { config } from '@/lib/config';

const PDF_EXTRACTOR_URL = process.env.PDF_EXTRACTOR_URL || config.backendUrl;

export const maxDuration = 10 // Netlify limit - 10 seconds maximum

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Limit number of files to prevent timeouts
    if (files.length > 3) {
      return NextResponse.json({ 
        error: 'Too many files. Maximum 3 files allowed to prevent timeouts.' 
      }, { status: 400 });
    }

    console.log(`Processing ${files.length} files with multiple PDF extraction`);

    // Forward the files to the PDF extraction microservice
    const extractorFormData = new FormData();
    files.forEach(file => {
      extractorFormData.append('files', file);
    });

    console.log(`Calling PDF extraction service at: ${PDF_EXTRACTOR_URL}/extract`);

    // Add timeout for PDF extraction service call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds for PDF extraction

    try {
      const extractorResponse = await fetch(`${PDF_EXTRACTOR_URL}/extract`, {
        method: 'POST',
        body: extractorFormData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`PDF extraction service response status: ${extractorResponse.status}`);

      if (!extractorResponse.ok) {
        const errorText = await extractorResponse.text();
        console.error(`PDF extraction service error: ${extractorResponse.status} - ${errorText}`);
        return NextResponse.json({ 
          error: 'PDF extraction service failed', 
          details: errorText 
        }, { status: extractorResponse.status });
      }

      const extractorData = await extractorResponse.json();
      console.log(`PDF extraction service returned:`, extractorData);

      // Validate response format
      if (!extractorData.success) {
        return NextResponse.json({ 
          error: 'PDF extraction service failed', 
          details: extractorData.error || 'Unknown error'
        }, { status: 500 });
      }

      if (!extractorData.results || !Array.isArray(extractorData.results)) {
        return NextResponse.json({ 
          error: 'Invalid response format from PDF extraction service'
        }, { status: 500 });
      }

      // Process each extracted text with OpenAI (with reduced timeout)
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
      }

      const openai = new OpenAI({ apiKey: openaiApiKey });
      const results: PDFExtractionResult[] = [];
      
      // Initialize summary totals
      let totalBruttolohn = 0;
      let totalLohnsteuer = 0;
      let totalSolidaritaetszuschlag = 0;
      let processedFiles = 0;
      let failedFiles = 0;
      const timePeriods: Array<{ filename: string; from: string; to: string }> = [];

      for (const extractorResult of extractorData.results) {
        console.log(`Processing extractor result for ${extractorResult.fileName}:`, {
          status: extractorResult.status,
          hasText: !!extractorResult.text,
          textLength: extractorResult.text?.length || 0,
          error: extractorResult.error
        });

        if (extractorResult.status !== 'success') {
          console.error(`Extraction failed for ${extractorResult.fileName}:`, extractorResult.error);
          results.push({
            success: false,
            filename: extractorResult.fileName,
            text: '',
            page_count: 0,
            character_count: 0,
            error: extractorResult.error || 'Extraction failed'
          });
          failedFiles++;
          continue;
        }

        if (!extractorResult.text || extractorResult.text.trim().length === 0) {
          console.error(`No text extracted for ${extractorResult.fileName}`);
          results.push({
            success: false,
            filename: extractorResult.fileName,
            text: '',
            page_count: 0,
            character_count: 0,
            error: 'No text extracted from PDF'
          });
          failedFiles++;
          continue;
        }

        try {
          // Process with OpenAI to extract German tax fields (with timeout)
          const openaiController = new AbortController();
          const openaiTimeoutId = setTimeout(() => openaiController.abort(), 8000); // 8 seconds per file (increased from 3)

          try {
            console.log(`[OpenAI] Processing ${extractorResult.fileName} with ${extractorResult.text.length} characters`);
            
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content: "You are a German tax document assistant. Extract specific tax-relevant fields from German payroll documents (Lohnabrechnung/Gehaltsabrechnung)."
                },
                {
                  role: "user",
                  content: `Extract the following fields from this German tax document and return ONLY valid JSON (no explanation, no markdown, no comments, no code block, no triple backticks):

Fields to extract:
- name: Full name of the employee
- employer: Company/employer name
- time_period_from: Start date of the pay period (format as DD.MM.YYYY)
- time_period_to: End date of the pay period (format as DD.MM.YYYY)
- bruttolohn: Gross salary/income amount (number only, no currency symbols)
- lohnsteuer: Income tax amount (number only, no currency symbols)
- solidaritaetszuschlag: Solidarity tax amount (number only, no currency symbols)
- year: Year of the document (extract from dates or document)

Document text:
${extractorResult.text}

Respond ONLY with a valid JSON object containing these fields. Use null for missing values.`
                }
              ],
              max_tokens: 500, // Limit response size for faster processing
              temperature: 0.1 // Lower temperature for more consistent results
            });

            clearTimeout(openaiTimeoutId);

            const content = response.choices[0].message?.content || '';
            console.log(`[OpenAI raw response for ${extractorResult.fileName}]`, content);

            // Clean up the response and parse JSON
            const contentClean = content
              .replace(/^```json\s*|^```|```$/gim, '')
              .trim();

            console.log(`[OpenAI cleaned response for ${extractorResult.fileName}]`, contentClean);

            try {
              const fields: GermanTaxFields = JSON.parse(contentClean);
              console.log(`[OpenAI parsed fields for ${extractorResult.fileName}]`, fields);

              // Add to summary totals if values are valid numbers
              if (typeof fields.bruttolohn === 'number' && !isNaN(fields.bruttolohn)) {
                totalBruttolohn += fields.bruttolohn;
              }
              if (typeof fields.lohnsteuer === 'number' && !isNaN(fields.lohnsteuer)) {
                totalLohnsteuer += fields.lohnsteuer;
              }
              if (typeof fields.solidaritaetszuschlag === 'number' && !isNaN(fields.solidaritaetszuschlag)) {
                totalSolidaritaetszuschlag += fields.solidaritaetszuschlag;
              }

              // Add time period if available
              if (fields.time_period_from && fields.time_period_to) {
                timePeriods.push({
                  filename: extractorResult.fileName,
                  from: fields.time_period_from,
                  to: fields.time_period_to
                });
              }

              results.push({
                success: true,
                filename: extractorResult.fileName,
                text: extractorResult.text,
                page_count: extractorResult.page_count,
                character_count: extractorResult.character_count,
                extractedData: fields
              });

              processedFiles++;

            } catch (parseError) {
              console.error(`JSON parse error for ${extractorResult.fileName}:`, parseError);
              console.error(`Raw content that failed to parse:`, contentClean);
              results.push({
                success: false,
                filename: extractorResult.fileName,
                text: extractorResult.text,
                page_count: extractorResult.page_count,
                character_count: extractorResult.character_count,
                error: `Failed to parse OpenAI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
              });
              failedFiles++;
            }

          } catch (openaiError) {
            clearTimeout(openaiTimeoutId);
            console.error(`OpenAI processing error for ${extractorResult.fileName}:`, openaiError);
            
            if (openaiError instanceof Error && openaiError.name === 'AbortError') {
              results.push({
                success: false,
                filename: extractorResult.fileName,
                text: extractorResult.text,
                page_count: extractorResult.page_count,
                character_count: extractorResult.character_count,
                error: 'OpenAI processing timed out'
              });
            } else {
              // Provide more specific error information
              const errorMessage = openaiError instanceof Error ? openaiError.message : 'Unknown OpenAI error';
              console.error(`OpenAI error details for ${extractorResult.fileName}:`, errorMessage);
              
              results.push({
                success: false,
                filename: extractorResult.fileName,
                text: extractorResult.text,
                page_count: extractorResult.page_count,
                character_count: extractorResult.character_count,
                error: `OpenAI processing failed: ${errorMessage}`
              });
            }
            failedFiles++;
          }

        } catch (error) {
          console.error(`Error processing ${extractorResult.fileName}:`, error);
          results.push({
            success: false,
            filename: extractorResult.fileName,
            text: extractorResult.text,
            page_count: extractorResult.page_count,
            character_count: extractorResult.character_count,
            error: 'Processing error'
          });
          failedFiles++;
        }
      }

      console.log(`Completed processing: ${processedFiles} successful, ${failedFiles} failed`);

      return NextResponse.json({
        success: true,
        total_files: files.length,
        processed_files: processedFiles,
        failed_files: failedFiles,
        results: results,
        summary: {
          total_bruttolohn: Math.round(totalBruttolohn * 100) / 100,
          total_lohnsteuer: Math.round(totalLohnsteuer * 100) / 100,
          total_solidaritaetszuschlag: Math.round(totalSolidaritaetszuschlag * 100) / 100,
          time_periods: timePeriods
        }
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('PDF extraction service fetch error:', fetchError);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json({ 
          error: 'PDF extraction service timeout. Please try with fewer or smaller files.' 
        }, { status: 504 });
      }
      
      return NextResponse.json({ 
        error: 'PDF extraction service unavailable. Please try again later.' 
      }, { status: 503 });
    }

  } catch (error) {
    console.error('Multiple PDF extraction error:', error);
    return NextResponse.json({
      error: 'Extraction failed',
      details: error instanceof Error ? error.message : 'Service timeout - please try again'
    }, { status: 500 });
  }
}
