# LangSmith Tracing Setup

This document explains how to configure LangSmith tracing for the STX Advisor project.

## Environment Variables

Create a `.env.local` file in the `stx-advisor-nextjs` directory with the following variables:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# LangSmith Tracing Configuration
LANGCHAIN_API_KEY=your_langsmith_api_key_here
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_PROJECT=stx-advisor-frontend

# Frontend-specific LangSmith config (optional)
NEXT_PUBLIC_LANGCHAIN_API_KEY=your_langsmith_api_key_here
NEXT_PUBLIC_LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
NEXT_PUBLIC_LANGCHAIN_PROJECT=stx-advisor-frontend

# Backend Service URL
PDF_EXTRACTOR_URL=http://localhost:8001
```

## Backend Configuration

For the backend service, add these environment variables to your system or create a `.env` file in the `pdf-extractor-service` directory:

```bash
# LangSmith Tracing Configuration
LANGCHAIN_API_KEY=your_langsmith_api_key_here
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_PROJECT=stx-advisor-backend

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
```

## What Gets Traced

### Frontend (Tax Advisor)
- **Data Extraction**: When user data is set from PDF extraction
- **Tool Usage**: Tax calculations and deduction checks
- **Agent Initialization**: When the LangChain agent is created
- **Conversation Turns**: Each advisor message with context
- **Error Handling**: Failed operations and fallbacks

### Backend (PDF Extractor)
- **Text Processing**: PDF extraction and enhancement
- **LLM Operations**: Text cleaning and structuring
- **Chunking**: Document splitting operations
- **Error Handling**: Processing failures

## Tracing Features

1. **Automatic Tracing**: Most operations are automatically traced
2. **Custom Tags**: Operations are tagged for easy filtering
3. **Error Tracking**: Failed operations are logged with error details
4. **Performance Monitoring**: Track response times and success rates
5. **Context Preservation**: User data and conversation history are preserved

## Viewing Traces

1. Go to [LangSmith Dashboard](https://smith.langchain.com)
2. Navigate to your project
3. View traces in real-time as users interact with the application
4. Filter by tags, operations, or time ranges
5. Analyze performance and identify issues

## Benefits

- **Debugging**: Easily identify where issues occur
- **Performance**: Monitor response times and bottlenecks
- **User Experience**: Understand how users interact with the system
- **Development**: Iterate on prompts and tools based on real usage
- **Monitoring**: Track system health and reliability

## Troubleshooting

If tracing is not working:

1. Check that all environment variables are set correctly
2. Verify your LangSmith API key is valid
3. Ensure the project name matches in LangSmith dashboard
4. Check console logs for any configuration errors
5. Restart both frontend and backend services after configuration changes 