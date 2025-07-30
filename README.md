# STX_Advisor - Modern Tax Advisor Architecture

A modernized tax advisor system built with Next.js + TypeScript and a separate Python PDF extraction microservice. This project demonstrates a clean separation of concerns with a unified frontend and independent backend services.

## 🏗️ Architecture Overview

### Before (Original)
- **Monolithic FastAPI backend** with React frontend
- All logic (PDF extraction, AI advisor, form filling) in Python
- Tightly coupled components
- Single deployment unit

### After (Modernized)
- **Next.js + TypeScript** unified application
- **Separate Python microservice** for PDF extraction only
- Clean API boundaries
- Independent scaling and deployment

## 📁 Project Structure

```
STX_Advisor/
├── pdf-extractor-service/          # Python microservice for PDF text extraction
│   ├── main.py                     # FastAPI service with PyMuPDF
│   ├── requirements.txt            # Python dependencies
│   ├── Dockerfile                  # Container configuration
│   └── README.md                   # Service documentation
│
├── stx-advisor-nextjs/               # Next.js + TypeScript application
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/                # Next.js API routes
│   │   │   │   ├── advisor/        # AI tax advisor logic
│   │   │   │   ├── extract-pdf/    # PDF processing coordinator
│   │   │   │   └── health/         # Health checks
│   │   │   ├── layout.tsx          # Root layout
│   │   │   └── page.tsx            # Main application
│   │   ├── lib/
│   │   │   └── taxAdvisor.ts       # Tax advisor service class
│   │   └── types/
│   │       └── index.ts            # TypeScript definitions
│   ├── .env.local                  # Environment configuration
│   └── README.md                   # Application documentation
│
├── stx-advisor-backend/              # Original FastAPI implementation (reference)
└── README.md                       # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+
- OpenAI API key

### 1. Start PDF Extraction Service

```bash
cd pdf-extractor-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start service
python main.py
```

The PDF service will run on `http://localhost:8001`

### 2. Start Next.js Application

```bash
cd stx-advisor-nextjs

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local and add your OPENAI_API_KEY

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

### 3. Test the System

1. Open `http://localhost:3000`
2. Upload a tax PDF document
3. Interact with the AI tax advisor
4. Follow the conversation flow

## 🔧 Services

### PDF Extractor Service (Port 8001)
- **Technology**: Python + FastAPI + PyMuPDF
- **Purpose**: Extract raw text from PDF files
- **Endpoints**:
  - `POST /extract-text`: Extract text from uploaded PDF
  - `GET /health`: Service health check
- **Scaling**: Independent horizontal scaling
- **Deployment**: Docker container ready

### Next.js Application (Port 3000)
- **Technology**: Next.js 14 + TypeScript + Tailwind CSS
- **Purpose**: Complete tax advisor application
- **Features**:
  - Modern React UI with TypeScript
  - AI-powered tax advisor (OpenAI GPT-4)
  - Session management
  - Conversation state handling
  - PDF processing coordination
- **API Routes**:
  - `/api/extract-pdf`: Coordinates PDF extraction and AI processing
  - `/api/advisor`: Handles AI tax advisor conversations
  - `/api/health`: Application health monitoring

## 🔄 Data Flow

1. **User uploads PDF** → Next.js frontend
2. **PDF forwarded** → PDF Extractor Service (PyMuPDF)
3. **Raw text returned** → Next.js API route
4. **Text processed** → OpenAI API (structured data extraction)
5. **Structured data** → Tax Advisor Service (Next.js)
6. **AI conversation** → OpenAI API (tax advice)
7. **Response displayed** → User interface

## 🛠️ Development

### Environment Variables

**Next.js Application (.env.local):**
```env
OPENAI_API_KEY=your_openai_api_key_here
PDF_EXTRACTOR_URL=http://localhost:8001
```

### Health Checks

- **Next.js App**: `http://localhost:3000/api/health`
- **PDF Service**: `http://localhost:8001/health`

### Development Commands

```bash
# Next.js application
cd stx-advisor-nextjs
npm run dev          # Start development server
npm run build        # Build for production
npm run type-check   # TypeScript type checking
npm run health       # Check application health

# PDF service
cd pdf-extractor-service
python main.py       # Start service
```

## 🚢 Production Deployment

### Docker Deployment

**PDF Extractor Service:**
```bash
cd pdf-extractor-service
docker build -t pdf-extractor .
docker run -p 8001:8001 pdf-extractor
```

**Next.js Application:**
```bash
cd stx-advisor-nextjs
docker build -t stx-advisor-nextjs .
docker run -p 3000:3000 --env-file .env.local stx-advisor-nextjs
```

### Production Considerations

1. **Session Storage**: Replace in-memory sessions with Redis/Database
2. **Authentication**: Implement user authentication
3. **Rate Limiting**: Add API rate limiting
4. **Monitoring**: Set up logging and monitoring
5. **Security**: Configure CORS, HTTPS, and security headers
6. **Scaling**: Use load balancers for horizontal scaling

## 🔍 Key Improvements

### Architecture Benefits
- **Separation of Concerns**: PDF extraction isolated from business logic
- **Technology Optimization**: Python for PDF processing, TypeScript for application logic
- **Independent Scaling**: Services can scale based on different requirements
- **Modern Stack**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Better DX**: Improved developer experience with TypeScript and modern tooling

### Performance Benefits
- **Faster Development**: Hot reload for both frontend and API routes
- **Type Safety**: Full TypeScript coverage prevents runtime errors
- **Optimized Builds**: Next.js optimization for production
- **Caching**: Built-in Next.js caching strategies

### Maintenance Benefits
- **Clear Boundaries**: Well-defined service interfaces
- **Independent Updates**: Services can be updated independently
- **Better Testing**: Easier to test isolated services
- **Documentation**: Comprehensive TypeScript types serve as documentation

## 📊 Migration Summary

| Aspect | Original (FastAPI + React) | Modernized (Next.js + Microservice) |
|--------|---------------------------|-------------------------------------|
| **Frontend** | React (separate build) | Next.js with App Router |
| **Backend** | Monolithic FastAPI | Next.js API routes + Python service |
| **Language** | Python + JavaScript | TypeScript + Python (minimal) |
| **PDF Processing** | Embedded in main app | Independent microservice |
| **AI Logic** | Python with OpenAI | TypeScript with OpenAI |
| **Type Safety** | Limited | Full TypeScript coverage |
| **Deployment** | Single unit | Independent services |
| **Scaling** | Monolithic scaling | Service-specific scaling |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test both services
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Issues**: Create GitHub issues for bugs and feature requests
- **Documentation**: Check individual service README files
- **Health Checks**: Use `/api/health` endpoints for service status

---

**Built with ❤️ using Next.js, TypeScript, and Python**
