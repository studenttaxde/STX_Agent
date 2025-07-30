"""
PDF Text Extraction Microservice
Enhanced FastAPI service that extracts text from single or multiple PDF files using PyMuPDF and LangChain
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import fitz  # PyMuPDF
import tempfile
import os
import logging

# LangChain imports for enhanced text processing
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import re

# LangSmith tracing setup
from langchain.callbacks import LangChainTracer

# Configure LangSmith tracing
def setup_langsmith_tracing():
    """Setup LangSmith tracing if environment variables are available"""
    api_key = os.getenv('LANGCHAIN_API_KEY')
    endpoint = os.getenv('LANGCHAIN_ENDPOINT')
    project_name = os.getenv('LANGCHAIN_PROJECT', 'stx-advisor-backend')
    
    if api_key:
        try:
            # Set environment variables for LangChain
            os.environ['LANGCHAIN_TRACING_V2'] = 'true'
            os.environ['LANGCHAIN_PROJECT'] = project_name
            
            if endpoint:
                os.environ['LANGCHAIN_ENDPOINT'] = endpoint
            
            # Initialize tracer
            tracer = LangChainTracer()
            
            logging.info(f"LangSmith tracing enabled for project: {project_name}")
            return True
        except Exception as e:
            logging.warning(f"Failed to setup LangSmith tracing: {e}")
            return False
    else:
        logging.info("LangSmith API key not found, tracing disabled")
        return False

# Initialize tracing
tracing_enabled = setup_langsmith_tracing()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="PDF Extractor Service", version="3.0.0")

# Enable CORS for all origins (configure as needed for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize LangChain components
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    length_function=len,
    separators=["\n\n", "\n", " ", ""]
)

def clean_text(text: str) -> str:
    """
    Clean and normalize extracted text using LangChain and regex
    """
    if not text:
        return ""
    
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Remove special characters that might interfere with processing
    text = re.sub(r'[^\w\s\.\,\-\€\(\)\:\;]', '', text)
    
    # Normalize line breaks
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    # Remove empty lines
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    text = '\n'.join(lines)
    
    # Enhanced number processing - look for patterns that might be incorrectly parsed numbers
    # This helps with cases where "58075" should be "580.75" or "291125" should be "2911.25"
    
    # Pattern to find potential salary/tax amounts that might be missing decimal points
    # Look for 4-6 digit numbers that could be currency amounts
    def fix_number_format(match):
        number = match.group(0)
        # If it's a 4-6 digit number that could be a currency amount, add decimal
        if len(number) >= 4 and len(number) <= 6:
            # Check if it looks like a currency amount (reasonable range for German salaries)
            num_val = int(number)
            if 1000 <= num_val <= 999999:  # Reasonable salary range
                # For 5-6 digit numbers, insert decimal before last 2 digits for cents
                if len(number) >= 5:
                    return number[:-2] + '.' + number[-2:]
                # For 4 digit numbers, check if it's likely a salary amount
                elif num_val > 2000:  # Likely a salary amount
                    return number[:-2] + '.' + number[-2:]
        return number
    
    # Apply number fixing to potential currency amounts
    text = re.sub(r'\b\d{4,6}\b', fix_number_format, text)
    
    # Additional pattern for larger numbers that might be salary amounts
    def fix_large_number_format(match):
        number = match.group(0)
        # Handle cases like "291125" -> "2911.25"
        if len(number) >= 6:
            num_val = int(number)
            if 100000 <= num_val <= 999999:  # Large salary range
                # Insert decimal before last 2 digits
                return number[:-2] + '.' + number[-2:]
        return number
    
    # Apply large number fixing
    text = re.sub(r'\b\d{6,7}\b', fix_large_number_format, text)
    
    return text.strip()

def enhance_text_with_llm(text: str, filename: str) -> str:
    """
    Use LangChain LLM to enhance and structure extracted text
    """
    try:
        # Only use LLM enhancement if OpenAI API key is available
        openai_api_key = os.getenv('OPENAI_API_KEY')
        if not openai_api_key:
            logger.info("OpenAI API key not available, skipping LLM enhancement")
            return text
        
        llm = ChatOpenAI(
            openai_api_key=openai_api_key,
            model_name="gpt-4o-mini",
            temperature=0.1
        )
        
        prompt = PromptTemplate(
            input_variables=["text", "filename"],
            template="""
You are a document processing expert specializing in German tax documents. Clean and structure the following text extracted from a German tax document.
Maintain all important information while improving readability and structure.

IMPORTANT: Pay special attention to number formatting:
- Currency amounts should be properly formatted with decimal points
- If you see numbers like "58075" for salary/tax amounts, convert them to "580.75"
- Ensure all monetary values are correctly formatted as currency

Document: {filename}
Extracted text:
{text}

Please return the cleaned and structured text, maintaining all tax-relevant information with proper number formatting:
"""
        )
        
        chain = LLMChain(llm=llm, prompt=prompt)
        result = chain.run(text=text[:4000], filename=filename)  # Limit text length
        
        return result.strip()
        
    except Exception as e:
        logger.warning(f"LLM enhancement failed: {e}, returning original text")
        return text

def extract_text_from_file(file_content: bytes, filename: str) -> dict:
    """
    Extract text from a single PDF file with LangChain enhancement
    
    Args:
        file_content: PDF file content as bytes
        filename: Name of the file
        
    Returns:
        dict: Contains extracted text and metadata
    """
    # Create temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
        temp_file.write(file_content)
        temp_file_path = temp_file.name
    
    try:
        # Add specific try-except for file opening
        try:
            doc = fitz.open(temp_file_path)
        except Exception as open_error: # Catching a broad exception as PyMuPDF can be varied
             # Clean up temporary file
            os.unlink(temp_file_path)
            logger.error(f"Could not open or parse {filename}: {open_error}")
            # Return a structured error
            return {
                "success": False,
                "filename": filename,
                "text": "",
                "page_count": 0,
                "character_count": 0,
                "error": "Invalid or corrupted PDF file. Could not be opened."
            }

        # Extract text using PyMuPDF
        extracted_text = ""
        page_count = len(doc)
        
        for page_num in range(page_count):
            page = doc[page_num]
            page_text = page.get_text()
            extracted_text += page_text + "\n"
        
        doc.close()
        
        # Clean up temporary file
        os.unlink(temp_file_path)
        
        if not extracted_text.strip():
            # This can happen for image-only PDFs without OCR
            raise Exception("No text could be extracted from the PDF. It might be an image-only document.")
        
        # Clean and enhance text using LangChain
        cleaned_text = clean_text(extracted_text)
        
        # Use LangChain text splitter to create chunks for better processing
        documents = [Document(page_content=cleaned_text, metadata={"source": filename})]
        chunks = text_splitter.split_documents(documents)
        
        # Reconstruct text from chunks (this helps with structure)
        processed_text = "\n\n".join([chunk.page_content for chunk in chunks])
        
        # Enhance with LLM if available
        enhanced_text = enhance_text_with_llm(processed_text, filename)
        
        logger.info(f"Successfully extracted and enhanced text from {filename} ({page_count} pages)")
        
        return {
            "success": True,
            "filename": filename,
            "text": enhanced_text,
            "page_count": page_count,
            "character_count": len(enhanced_text),
            "chunks_count": len(chunks),
            "error": None
        }
        
    except Exception as e:
        # General catch-all for other unexpected errors
        # Clean up temporary file in case of error
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        
        logger.error(f"Error processing {filename}: {str(e)}")
        return {
            "success": False,
            "filename": filename,
            "text": "",
            "page_count": 0,
            "character_count": 0,
            "error": str(e)
        }

@app.get("/")
def root():
    return {
        "message": "PDF Extractor Service is running", 
        "version": "3.0.0", 
        "features": ["LangChain Integration", "Text Enhancement", "Intelligent Processing", "LangSmith Tracing"],
        "tracing_enabled": tracing_enabled
    }

@app.get("/health")
def health():
    return {
        "status": "healthy", 
        "service": "pdf-extractor", 
        "version": "3.0.0",
        "tracing_enabled": tracing_enabled
    }

@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """
    Extract text from uploaded PDF file (single file endpoint for backward compatibility)
    
    Args:
        file: PDF file to extract text from
        
    Returns:
        dict: Contains extracted text and metadata
    """
    try:
        # Validate file type
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
        # Read file content
        content = await file.read()
        
        # Extract text using helper function
        result = extract_text_from_file(content, file.filename)
        
        if not result["success"]:
            # Don't raise HTTPException here, just return the result from the helper
            return result
        
        return result
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing {file.filename}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.post("/extract-multiple")
async def extract_multiple(files: List[UploadFile] = File(...)):
    """
    Extract text from multiple uploaded PDF files
    
    Args:
        files: List of PDF files to extract text from
        
    Returns:
        dict: Contains results for each file and summary statistics
    """
    try:
        if not files:
            raise HTTPException(status_code=400, detail="No files provided")
        
        results = []
        successful_extractions = 0
        failed_extractions = 0
        total_pages = 0
        total_characters = 0
        total_chunks = 0
        
        for file in files:
            # Validate file type
            if not file.filename or not file.filename.lower().endswith('.pdf'):
                result = {
                    "success": False,
                    "filename": file.filename or "unknown",
                    "text": "",
                    "page_count": 0,
                    "character_count": 0,
                    "error": "Only PDF files are supported"
                }
                results.append(result)
                failed_extractions += 1
                continue
            
            # Read file content
            content = await file.read()
            
            # Extract text using helper function
            result = extract_text_from_file(content, file.filename)
            results.append(result)
            
            if result["success"]:
                successful_extractions += 1
                total_pages += result["page_count"]
                total_characters += result["character_count"]
                total_chunks += result.get("chunks_count", 0)
            else:
                failed_extractions += 1
        
        logger.info(f"Processed {len(files)} files: {successful_extractions} successful, {failed_extractions} failed")
        
        return {
            "success": True,
            "total_files": len(files),
            "successful_extractions": successful_extractions,
            "failed_extractions": failed_extractions,
            "total_pages": total_pages,
            "total_characters": total_characters,
            "total_chunks": total_chunks,
            "results": results
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing multiple files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
