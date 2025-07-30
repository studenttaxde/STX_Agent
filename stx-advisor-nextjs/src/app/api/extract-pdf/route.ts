import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const PDF_EXTRACTOR_URL = process.env.PDF_EXTRACTOR_URL || 'http://localhost:8001';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

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
        filename: file.name,
        extractedData: fields,
        rawText: extractedText,
        pageCount: extractorData.page_count,
        characterCount: extractorData.character_count
      });
    } catch (parseError) {
      console.error('[OpenAI JSON parse error]', parseError);
      // Return fallback response
      return NextResponse.json({
        success: true,
        filename: file.name,
        extractedData: { fallback: content },
        rawText: extractedText,
        pageCount: extractorData.page_count,
        characterCount: extractorData.character_count
      });
    }

  } catch (error) {
    console.error('PDF extraction error:', error);
    return NextResponse.json(
      { error: `Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
