import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const envVars = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET',
      BACKEND_URL: process.env.BACKEND_URL ? 'SET' : 'NOT SET',
      LANGCHAIN_API_KEY: process.env.LANGCHAIN_API_KEY ? 'SET' : 'NOT SET',
      LANGCHAIN_PROJECT: process.env.LANGCHAIN_PROJECT ? 'SET' : 'NOT SET',
      LANGCHAIN_ENDPOINT: process.env.LANGCHAIN_ENDPOINT ? 'SET' : 'NOT SET',
      LANGCHAIN_TRACING_V2: process.env.LANGCHAIN_TRACING_V2 ? 'SET' : 'NOT SET',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
      NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ? 'SET' : 'NOT SET',
      NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ? 'SET' : 'NOT SET'
    }

    return NextResponse.json({
      status: 'success',
      environment: process.env.NODE_ENV,
      variables: envVars,
      openaiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
    })

  } catch (error) {
    console.error('Environment test error:', error)
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 