# PDF Extractor Service for STX Advisor

A lightweight FastAPI microservice for extracting text from PDF files using PyMuPDF.

## Features

- Extract text from PDF files
- RESTful API with FastAPI
- Health check endpoint
- CORS enabled for web applications
- Docker support for easy deployment

## API Endpoints

### `GET /`
Returns service information and version.

### `GET /health`
Health check endpoint.

### `POST /extract-text`
Extract text from uploaded PDF file.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: PDF file upload

**Response:**
```json
{
  "success": true,
  "filename": "document.pdf",
  "text": "Extracted text content...",
  "page_count": 3,
  "character_count": 1250
}
```

## Local Development

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the service:
```bash
python main.py
```

The service will be available at `http://localhost:8001`

## Docker Deployment

1. Build the image:
```bash
docker build -t pdf-extractor-service .
```

2. Run the container:
```bash
docker run -p 8001:8001 pdf-extractor-service
```

## Production Deployment

For production deployment, consider:
- Setting up proper CORS origins instead of allowing all
- Adding authentication if needed
- Using a production WSGI server configuration
- Setting up monitoring and logging
- Implementing rate limiting

## Environment Variables

Currently no environment variables are required, but you may want to add:
- `PORT`: Service port (default: 8001)
- `CORS_ORIGINS`: Allowed CORS origins
- `LOG_LEVEL`: Logging level

## Error Handling

The service returns appropriate HTTP status codes:
- 200: Success
- 400: Bad request (invalid file type)
- 422: Unprocessable entity (no text extracted)
- 500: Internal server error
