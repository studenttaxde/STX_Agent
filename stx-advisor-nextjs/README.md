# German Tax Advisor

A Next.js application that helps users with German tax filing by extracting data from PDF documents and providing personalized tax advice.

## Features

- PDF document extraction and analysis
- German tax calculation and advice
- Supabase integration for data persistence
- AI-powered tax advisor using OpenAI

## Environment Variables

The following environment variables are required:

- `OPENAI_API_KEY`: Your OpenAI API key
- `BACKEND_URL`: URL of the PDF extraction backend
- `LANGCHAIN_API_KEY`: LangSmith API key for tracing
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key

## Development

```bash
npm install
npm run dev
```

## Deployment

The application is deployed on Netlify with automatic deployments from the main branch.

<!-- Trigger redeployment with updated environment variables -->
# Build cache cleared Sun Aug  3 22:42:05 CEST 2025
