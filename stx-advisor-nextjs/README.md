# STX_Advisor - STX Advisor Next.js Application

A modern, unified Next.js + TypeScript application for AI-powered German tax return assistance. This application provides an intuitive interface for uploading tax documents, extracting data, and receiving personalized tax advice through an AI advisor.

## Features

- **Modern Tech Stack**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **AI-Powered Advisor**: Intelligent tax advisor using OpenAI GPT-4
- **PDF Processing**: Integration with separate PDF extraction microservice
- **Conversation Management**: Stateful conversation handling with session management
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS
- **Type Safety**: Full TypeScript implementation with comprehensive type definitions
- **API Routes**: RESTful API endpoints for all backend functionality

## Architecture

### Frontend
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Responsive design** for all devices

### Backend (API Routes)
- **PDF Extraction**: Communicates with Python microservice
- **Tax Advisor**: AI-powered conversation management
- **Session Management**: In-memory session storage (Redis recommended for production)
- **Health Checks**: Service health monitoring

### External Services
- **OpenAI API**: For AI tax advisor functionality
- **PDF Extractor Service**: Separate Python microservice for PDF text extraction

## Project Structure

```
stx-advisor-nextjs/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── advisor/route.ts      # Tax advisor API
│   │   │   ├── extract-pdf/route.ts  # PDF extraction API
│   │   │   └── health/route.ts       # Health check API
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Main application page
│   ├── lib/
│   │   └── taxAdvisor.ts            # Tax advisor service class
│   └── types/
│       └── index.ts                 # TypeScript type definitions
├── .env.local                       # Environment variables
├── package.json                     # Dependencies and scripts
└── README.md                        # This file
```

## Setup and Installation

### Prerequisites
- Node.js 18+ and npm
- OpenAI API key
- PDF Extractor Service running (see pdf-extractor-service/)

### Installation

1. **Install dependencies:**
```bash
cd stx-advisor-nextjs
npm install
```

2. **Configure environment variables:**
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your configuration:
```env
OPENAI_API_KEY=your_openai_api_key_here
PDF_EXTRACTOR_URL=http://localhost:8001
```

3. **Start the PDF Extractor Service:**
```bash
# In a separate terminal, start the PDF extraction microservice
cd ../pdf-extractor-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

4. **Start the Next.js application:**
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## API Endpoints

### `POST /api/extract-pdf`
Extract and process PDF documents.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: PDF file upload

**Response:**
```json
{
  "success": true,
  "filename": "document.pdf",
  "extractedData": {
    "full_name": "John Doe",
    "gross_income": 50000,
    "income_tax_paid": 8000,
    "year": 2024
  },
  "rawText": "...",
  "pageCount": 3,
  "characterCount": 1250
}
```

### `POST /api/advisor`
Interact with the AI tax advisor.

**Actions:**
- `initialize`: Start new conversation with extracted data
- `respond`: Send user message and get advisor response
- `reset`: Reset conversation state
- `get_state`: Get current conversation state

**Request:**
```json
{
  "action": "respond",
  "sessionId": "abc123",
  "userMessage": "Yes, that's correct"
}
```

**Response:**
```json
{
  "success": true,
  "advisor_message": "Great! Now let me ask about...",
  "done": false,
  "conversation_history": [...],
  "user_data": {...}
}
```

### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "stx-advisor-nextjs",
  "checks": {
    "openai_configured": true,
    "pdf_extractor_healthy": true
  }
}
```

## Development

### Scripts
- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint
- `npm run type-check`: Run TypeScript type checking

### Code Structure

#### Types (`src/types/index.ts`)
Comprehensive TypeScript definitions for all data structures used throughout the application.

#### Tax Advisor Service (`src/lib/taxAdvisor.ts`)
Core business logic for the AI tax advisor, including:
- Conversation management
- Tax threshold calculations
- OpenAI API integration
- Session state management

#### API Routes (`src/app/api/`)
Next.js API routes handling:
- PDF extraction coordination
- AI advisor interactions
- Health monitoring

#### Main Application (`src/app/page.tsx`)
React component providing:
- File upload interface
- Chat conversation UI
- State management
- User interaction handling

## Production Deployment

### Environment Variables
Set the following environment variables in production:

```env
OPENAI_API_KEY=your_production_openai_key
PDF_EXTRACTOR_URL=https://your-pdf-service.com
NEXT_PUBLIC_APP_NAME=STX_Advisor
```

### Deployment Considerations

1. **Session Storage**: Replace in-memory session storage with Redis or database
2. **PDF Service**: Deploy PDF extractor service independently
3. **Security**: Implement proper authentication and rate limiting
4. **Monitoring**: Add logging and monitoring for production use
5. **Scaling**: Consider horizontal scaling for high traffic

### Docker Deployment

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t stx-advisor-nextjs .
docker run -p 3000:3000 --env-file .env.local stx-advisor-nextjs
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Contact: support@example.com

## Changelog

### v1.0.0
- Initial release with Next.js 14 and TypeScript
- AI-powered tax advisor functionality
- PDF extraction integration
- Modern responsive UI
