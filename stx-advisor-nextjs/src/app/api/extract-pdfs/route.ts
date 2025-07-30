import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GermanTaxFields, MultiPDFExtractionResponse, TaxSummary, PDFExtractionResult } from '@/types';

const PDF_EXTRACTOR_URL = process.env.PDF_EXTRACTOR_URL || 'http://localhost:8001';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    // Get all files from formData with key 'files'
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length === 1) {
      // Single file processing
      const file = files[0];

      // Forward the file to the PDF extraction microservice
      const extractorFormData = new FormData();
      extractorFormData.append('file', file);

      const extractorResponse = await fetch(`${PDF_EXTRACTOR_URL}/extract-text`, {
        method: 'POST',
        body: extractorFormData,
      });

      if (!extractorResponse.ok) {
        const errorData = await extractorResponse.json();
        return NextResponse.json({ error: errorData.detail || 'PDF extraction failed' }, { status: extractorResponse.status });
      }

      const extractorData = await extractorResponse.json();
      const extractedText = extractorData.text;

      // Process the extracted text with OpenAI
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
      }

      const openai = new OpenAI({ apiKey: openaiApiKey });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a tax assistant. Extract tax-relevant fields from documents."
          },
          {
            role: "user",
            content: `Extract the following fields from this document text and return ONLY valid JSON (no explanation, no markdown, no comments, no code block, no triple backticks):
Fields: full_name, address, employer, total_hours, gross_income, income_tax_paid, year
Document text:
${extractedText}

Respond ONLY with a valid JSON object.`
          }
        ]
      });

      const content = response.choices[0].message?.content || '';
      console.log('[OpenAI raw response]', content);

      // Clean up the response and parse JSON
      const contentClean = content
        .replace(/^```json\s*|^```|```$/gim, '')
        .trim();

      try {
        const fields = JSON.parse(contentClean);
        console.log('[OpenAI parsed fields]', fields);
        
        return NextResponse.json({
          success: true,
          total_files: 1,
          results: [{
            success: true,
            filename: file.name,
            extractedData: fields,
            rawText: extractedText,
            pageCount: extractorData.page_count,
            characterCount: extractorData.character_count
          }]
        });
      } catch (parseError) {
        console.error('[OpenAI JSON parse error]', parseError);
        // Return fallback response
        return NextResponse.json({
          success: true,
          total_files: 1,
          results: [{
            success: true,
            filename: file.name,
            extractedData: { fallback: content },
            rawText: extractedText,
            pageCount: extractorData.page_count,
            characterCount: extractorData.character_count
          }]
        });
      }
    } else {
      // Multiple files processing
      // Forward the files to the PDF extraction microservice
      const extractorFormData = new FormData();
      files.forEach(file => {
        extractorFormData.append('files', file);
      });

      const extractorResponse = await fetch(`${PDF_EXTRACTOR_URL}/extract-multiple`, {
        method: 'POST',
        body: extractorFormData,
      });

      if (!extractorResponse.ok) {
        const errorData = await extractorResponse.json();
        return NextResponse.json({ error: errorData.detail || 'PDF extraction failed' }, { status: extractorResponse.status });
      }

      const extractorData = await extractorResponse.json();

      // Process each extracted text with OpenAI
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
        if (!extractorResult.success) {
          results.push({
            success: false,
            filename: extractorResult.filename,
            text: '',
            page_count: 0,
            character_count: 0,
            error: extractorResult.error
          });
          failedFiles++;
          continue;
        }

        try {
          // Process with OpenAI to extract German tax fields
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
            ]
          });

          const content = response.choices[0].message?.content || '';
          console.log(`[OpenAI raw response for ${extractorResult.filename}]`, content);

          // Clean up the response and parse JSON
          const contentClean = content
            .replace(/^```json\s*|^```|```$/gim, '')
            .trim();

          try {
            const fields: GermanTaxFields = JSON.parse(contentClean);
            console.log(`[OpenAI parsed fields for ${extractorResult.filename}]`, fields);

            // Add to summary totals if values are valid numbers
            if (fields.bruttolohn !== null && fields.bruttolohn !== undefined) {
              const bruttolohnValue = typeof fields.bruttolohn === 'string' ? parseFloat(fields.bruttolohn) : fields.bruttolohn;
              if (!isNaN(bruttolohnValue)) {
                totalBruttolohn += bruttolohnValue;
              }
            }
            if (fields.lohnsteuer !== null && fields.lohnsteuer !== undefined) {
              const lohnsteuerValue = typeof fields.lohnsteuer === 'string' ? parseFloat(fields.lohnsteuer) : fields.lohnsteuer;
              if (!isNaN(lohnsteuerValue)) {
                totalLohnsteuer += lohnsteuerValue;
              }
            }
            if (fields.solidaritaetszuschlag !== null && fields.solidaritaetszuschlag !== undefined) {
              const solidaritaetszuschlagValue = typeof fields.solidaritaetszuschlag === 'string' ? parseFloat(fields.solidaritaetszuschlag) : fields.solidaritaetszuschlag;
              if (!isNaN(solidaritaetszuschlagValue)) {
                totalSolidaritaetszuschlag += solidaritaetszuschlagValue;
              }
            }

            // Add time period if available
            if (fields.time_period_from && fields.time_period_to) {
              timePeriods.push({
                filename: extractorResult.filename,
                from: fields.time_period_from,
                to: fields.time_period_to
              });
            }

            results.push({
              success: true,
              filename: extractorResult.filename,
              text: extractorResult.text,
              page_count: extractorResult.page_count,
              character_count: extractorResult.character_count,
              extractedData: fields
            });

            processedFiles++;

          } catch (parseError) {
            console.error(`[OpenAI JSON parse error for ${extractorResult.filename}]`, parseError);
            
            // Return fallback response for this file
            results.push({
              success: true,
              filename: extractorResult.filename,
              text: extractorResult.text,
              page_count: extractorResult.page_count,
              character_count: extractorResult.character_count,
              extractedData: { 
                error: 'Failed to parse AI response',
                name: undefined,
                employer: undefined,
                time_period_from: undefined,
                time_period_to: undefined,
                bruttolohn: undefined,
                lohnsteuer: undefined,
                solidaritaetszuschlag: undefined,
                year: undefined
              }
            });
            failedFiles++;
          }

        } catch (aiError) {
          console.error(`[OpenAI API error for ${extractorResult.filename}]`, aiError);
          
          results.push({
            success: false,
            filename: extractorResult.filename,
            text: extractorResult.text,
            page_count: extractorResult.page_count,
            character_count: extractorResult.character_count,
            error: `AI processing failed: ${aiError instanceof Error ? aiError.message : 'Unknown error'}`
          });
          failedFiles++;
        }
      }

      // Create summary
      const summary: TaxSummary = {
        total_bruttolohn: Math.round(totalBruttolohn * 100) / 100, // Round to 2 decimal places
        total_lohnsteuer: Math.round(totalLohnsteuer * 100) / 100,
        total_solidaritaetszuschlag: Math.round(totalSolidaritaetszuschlag * 100) / 100,
        processed_files: processedFiles,
        failed_files: failedFiles,
        time_periods: timePeriods
      };

      const response: MultiPDFExtractionResponse = {
        success: true,
        total_files: files.length,
        successful_extractions: processedFiles,
        failed_extractions: failedFiles,
        results,
        summary
      };

      return NextResponse.json(response);

    }
  } catch (error) {
    console.error('PDF extraction error:', error);
    return NextResponse.json(
      { error: `Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
