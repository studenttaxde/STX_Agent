import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { systemPrompt, userPrompt, targetFile } = await request.json()

    if (!systemPrompt || !userPrompt || !targetFile) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.1,
      max_tokens: 4000,
    })

    const generatedCode = completion.choices[0]?.message?.content

    if (!generatedCode) {
      return NextResponse.json(
        { success: false, error: 'No code generated' },
        { status: 500 }
      )
    }

    // Write the generated code to disk (optional)
    // This could be implemented to actually save the files
    console.log(`Generated code for ${targetFile}:`, generatedCode)

    return NextResponse.json({
      success: true,
      code: generatedCode,
      targetFile
    })

  } catch (error) {
    console.error('Code generation error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
} 