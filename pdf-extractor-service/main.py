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
import re

# LangChain imports for enhanced text processing
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import json

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

def parse_german_tax_document(text: str) -> dict:
    """
    Parse German tax document text and extract relevant fields
    """
    result = {
        "bruttolohn": 0,
        "lohnsteuer": 0,
        "solidaritaetszuschlag": 0,
        "employer": "Unknown",
        "name": "User",
        "year": None,
        "steuerklasse": None,
        "beschaeftigungszeitraum": None
    }
    
    try:
        # Extract year from text - look for "20.21" format and convert to 2021
        year_match = re.search(r'Veranlagungszeitraum:\s*(\d{2})\.(\d{2})', text)
        if year_match:
            # Convert "20.21" to 2021
            year_str = f"20{year_match.group(2)}"  # Use the second group (21) and prepend 20
            result["year"] = int(year_str)
        
        # Extract employer - look for multiple patterns
        employer_patterns = [
            r'Arbeitgeber\s+Name des Arbeitgebers\s+([A-Za-z\s]+?)(?=\s+Betroffenes Jahr|$)',
            r'Arbeitgeber\s+([A-Za-z\s]+?)(?=\s+Betroffenes Jahr|$)',
            r'Name des Arbeitgebers\s+([A-Za-z\s]+?)(?=\s+Betroffenes Jahr|$)',
            r'Arbeitgeber\s+([A-Za-z\s]+?)(?=\s+Steuerklasse|$)',
            r'Arbeitgeber\s+([A-Za-z\s]+?)(?=\s+Identifikationsnummer|$)',
            r'Arbeitgeber\s+([A-Za-z\s]+?)(?=\s+Bruttoarbeitslohn|$)',
            r'Arbeitgeber\s+([A-Za-z\s]+?)(?=\s+einbehaltene|$)',
            r'Arbeitgeber\s+([A-Za-z\s]+?)(?=\s+\d{4}|$)',
            r'Arbeitgeber\s+([A-Za-z\s]+?)(?=\s+[A-Z]|$)',
            r'Arbeitgeber\s+([A-Za-z\s]+?)(?=\s*$)',  # End of line
        ]
        
        for pattern in employer_patterns:
            employer_match = re.search(pattern, text, re.IGNORECASE)
            if employer_match:
                employer_name = employer_match.group(1).strip()
                # Clean up the employer name
                employer_name = re.sub(r'\s+', ' ', employer_name)  # Remove extra spaces
                employer_name = employer_name.strip()
                if employer_name and len(employer_name) > 2:  # Make sure it's not just whitespace
                    result["employer"] = employer_name
                    break
        
        # If still no employer found, try to extract from filename
        if result["employer"] == "Unknown":
            # Extract employer from filename (common pattern: "EmployerName_2021.pdf")
            filename_employer = re.search(r'([A-Za-z\s]+?)_\d{4}', filename)
            if filename_employer:
                result["employer"] = filename_employer.group(1).replace('_', ' ').strip()
        
        # Extract name (Identifikationsnummer) - get the full number
        name_match = re.search(r'Identifikationsnummer\s+(\d+\s+\d+\s+\d+)', text)
        if name_match:
            result["name"] = f"User {name_match.group(1)}"
        
        # Extract tax class
        steuerklasse_match = re.search(r'Steuerklasse\s+(\d+)', text)
        if steuerklasse_match:
            result["steuerklasse"] = int(steuerklasse_match.group(1))
        
        # Extract employment period
        beschaeftigungszeitraum_match = re.search(r'Beschäftigungsjahr\s+\d{4}\s+vom\s+(\d{2}\.\d{2})\s+bis\s+(\d{2}\.\d{2})', text)
        if beschaeftigungszeitraum_match:
            result["beschaeftigungszeitraum"] = f"{beschaeftigungszeitraum_match.group(1)} - {beschaeftigungszeitraum_match.group(2)}"
        
        # Extract Bruttoarbeitslohn (gross income)
        bruttolohn_match = re.search(r'Bruttoarbeitslohn\s+([\d\.,]+)', text)
        if bruttolohn_match:
            bruttolohn_str = bruttolohn_match.group(1).replace('.', '').replace(',', '.')
            try:
                result["bruttolohn"] = float(bruttolohn_str)
            except ValueError:
                pass
        
        # Extract einbehaltene Lohnsteuer (income tax paid)
        lohnsteuer_match = re.search(r'einbehaltene Lohnsteuer\s+([\d\.,]+)', text)
        if lohnsteuer_match:
            lohnsteuer_str = lohnsteuer_match.group(1).replace('.', '').replace(',', '.')
            try:
                result["lohnsteuer"] = float(lohnsteuer_str)
            except ValueError:
                pass
        
        # Extract einbehaltener Solidaritätszuschlag
        solidaritaetszuschlag_match = re.search(r'einbehaltener Solidaritätszuschlag\s+([\d\.,]+)', text)
        if solidaritaetszuschlag_match:
            solidaritaetszuschlag_str = solidaritaetszuschlag_match.group(1).replace('.', '').replace(',', '.')
            try:
                result["solidaritaetszuschlag"] = float(solidaritaetszuschlag_str)
            except ValueError:
                pass
        
        # If no year found, try to extract from filename or text
        if not result["year"]:
            year_from_text = re.search(r'(\d{4})', text)
            if year_from_text:
                result["year"] = int(year_from_text.group(1))
        
        logger.info(f"Parsed tax document: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Error parsing German tax document: {e}")
        return result

def parse_with_llm(text: str, filename: str) -> dict:
    """
    Use LLM to parse German tax document and extract structured data
    """
    try:
        openai_api_key = os.getenv('OPENAI_API_KEY')
        if not openai_api_key:
            logger.info("OpenAI API key not available, using regex parsing")
            return parse_german_tax_document(text)
        
        llm = ChatOpenAI(
            openai_api_key=openai_api_key,
            model_name="gpt-4o-mini",
            temperature=0.1
        )
        
        prompt = PromptTemplate(
            input_variables=["text", "filename"],
            template="""
You are a German tax document parser. Extract the following information from the provided German tax document text and return it as a JSON object.

Required fields:
- bruttolohn: Gross income (Bruttoarbeitslohn) as a number
- lohnsteuer: Income tax paid (einbehaltene Lohnsteuer) as a number  
- solidaritaetszuschlag: Solidarity surcharge (einbehaltener Solidaritätszuschlag) as a number
- employer: Employer name (Arbeitgeber Name des Arbeitgebers) - extract the full company name
- name: Employee name or identification number
- year: Tax year (Veranlagungszeitraum)
- steuerklasse: Tax class (Steuerklasse) as a number
- beschaeftigungszeitraum: Employment period

Important: For the employer field, look for patterns like:
- "Arbeitgeber Name des Arbeitgebers [Company Name]"
- "Arbeitgeber [Company Name]"
- "Name des Arbeitgebers [Company Name]"

Document: {filename}
Text: {text}

Return ONLY a valid JSON object with these fields. If a field is not found, use null or 0 as appropriate.
Example format:
{{
  "bruttolohn": 50000.0,
  "lohnsteuer": 8000.0,
  "solidaritaetszuschlag": 440.0,
  "employer": "Example GmbH",
  "name": "User 123456789",
  "year": 2024,
  "steuerklasse": 1,
  "beschaeftigungszeitraum": "01.01 - 31.12"
}}
"""
        )
        
        chain = LLMChain(llm=llm, prompt=prompt)
        result = chain.run(text=text[:4000], filename=filename)
        
        # Parse the JSON response
        try:
            parsed_result = json.loads(result.strip())
            logger.info(f"LLM parsed result: {parsed_result}")
            return parsed_result
        except json.JSONDecodeError:
            logger.warning("LLM returned invalid JSON, falling back to regex parsing")
            return parse_german_tax_document(text)
        
    except Exception as e:
        logger.warning(f"LLM parsing failed: {e}, falling back to regex parsing")
        return parse_german_tax_document(text)

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
        # Validate file content
        if len(file_content) == 0:
            raise Exception("Empty file provided")
        
        # Add specific try-except for file opening
        try:
            doc = fitz.open(temp_file_path)
        except Exception as open_error:
            # Clean up temporary file
            os.unlink(temp_file_path)
            logger.error(f"Could not open or parse {filename}: {open_error}")
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
        
        if page_count == 0:
            doc.close()
            os.unlink(temp_file_path)
            return {
                "success": False,
                "filename": filename,
                "text": "",
                "page_count": 0,
                "character_count": 0,
                "error": "PDF file contains no pages."
            }
        
        for page_num in range(page_count):
            try:
                page = doc[page_num]
                page_text = page.get_text()
                extracted_text += page_text + "\n"
            except Exception as page_error:
                logger.warning(f"Error extracting text from page {page_num} of {filename}: {page_error}")
                # Continue with other pages
                continue
        
        doc.close()
        
        # Clean up temporary file
        os.unlink(temp_file_path)
        
        if not extracted_text.strip():
            return {
                "success": False,
                "filename": filename,
                "text": "",
                "page_count": page_count,
                "character_count": 0,
                "error": "No text could be extracted from the PDF. It might be an image-only document."
            }
        
        # Clean and enhance text using LangChain
        cleaned_text = clean_text(extracted_text)
        
        # Use LangChain text splitter to create chunks for better processing
        documents = [Document(page_content=cleaned_text, metadata={"source": filename})]
        chunks = text_splitter.split_documents(documents)
        
        # Reconstruct text from chunks (this helps with structure)
        processed_text = "\n\n".join([chunk.page_content for chunk in chunks])
        
        # Enhance with LLM if available
        enhanced_text = enhance_text_with_llm(processed_text, filename)
        
        # Parse the German tax document to extract structured data
        parsed_data = parse_with_llm(enhanced_text, filename)
        
        logger.info(f"Successfully extracted and enhanced text from {filename} ({page_count} pages, {len(enhanced_text)} characters)")
        
        return {
            "success": True,
            "filename": filename,
            "text": enhanced_text,
            "page_count": page_count,
            "character_count": len(enhanced_text),
            "chunks_count": len(chunks),
            "error": None,
            **parsed_data  # Include the parsed structured data
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
        "features": ["LangChain Integration", "Text Enhancement", "Intelligent Processing", "LangSmith Tracing", "German Tax Document Parsing"],
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

@app.post("/extract")
async def extract_pdfs(files: List[UploadFile] = File(...)):
    """
    Unified endpoint for extracting text from PDF files (single or multiple)
    
    Args:
        files: List of PDF files to extract text from
        
    Returns:
        dict: Contains results for each file and summary statistics
    """
    import time
    start_time = time.time()
    
    try:
        if not files:
            raise HTTPException(status_code=400, detail="No files provided")
        
        # Validate request size
        if len(files) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 files allowed per request")
        
        logger.info(f"Processing {len(files)} files with unified extract endpoint")
        
        results = []
        successful_extractions = 0
        failed_extractions = 0
        total_pages = 0
        total_characters = 0
        total_size = 0
        
        for i, file in enumerate(files):
            logger.info(f"Processing file {i+1}/{len(files)}: {file.filename}")
            
            # Validate file type
            if not file.filename or not file.filename.lower().endswith('.pdf'):
                result = {
                    "fileName": file.filename or "unknown",
                    "text": "",
                    "page_count": 0,
                    "character_count": 0,
                    "status": "error",
                    "error": "Only PDF files are supported"
                }
                results.append(result)
                failed_extractions += 1
                continue
            
            # Read file content
            content = await file.read()
            file_size = len(content)
            total_size += file_size
            
            # Validate file size (max 10MB per file)
            if file_size > 10 * 1024 * 1024:
                result = {
                    "fileName": file.filename,
                    "text": "",
                    "page_count": 0,
                    "character_count": 0,
                    "status": "error",
                    "error": "File too large. Maximum size is 10MB per file"
                }
                results.append(result)
                failed_extractions += 1
                continue
            
            # Validate total payload size (max 50MB)
            if total_size > 50 * 1024 * 1024:
                result = {
                    "fileName": file.filename,
                    "text": "",
                    "page_count": 0,
                    "character_count": 0,
                    "status": "error",
                    "error": "Total payload too large. Maximum size is 50MB"
                }
                results.append(result)
                failed_extractions += 1
                continue
            
            try:
                # Extract text using helper function with timeout
                import asyncio
                try:
                    # Run extraction with timeout
                    result = await asyncio.wait_for(
                        asyncio.to_thread(extract_text_from_file, content, file.filename),
                        timeout=30.0  # 30 second timeout
                    )
                except asyncio.TimeoutError:
                    logger.error(f"Extraction timeout for {file.filename}")
                    result = {
                        "success": False,
                        "filename": file.filename,
                        "text": "",
                        "page_count": 0,
                        "character_count": 0,
                        "error": "Extraction timed out. Please try with a smaller file."
                    }
                
                # Convert to unified response format
                if result["success"]:
                    unified_result = {
                        "fileName": file.filename,
                        "text": result["text"],
                        "page_count": result["page_count"],
                        "character_count": result["character_count"],
                        "status": "success",
                        "metadata": result.get("metadata", {})
                    }
                    successful_extractions += 1
                    total_pages += result["page_count"]
                    total_characters += result["character_count"]
                else:
                    unified_result = {
                        "fileName": file.filename,
                        "text": "",
                        "page_count": 0,
                        "character_count": 0,
                        "status": "error",
                        "error": result.get("error", "Extraction failed")
                    }
                    failed_extractions += 1
                
                results.append(unified_result)
                
            except Exception as e:
                logger.error(f"Error processing {file.filename}: {str(e)}")
                results.append({
                    "fileName": file.filename,
                    "text": "",
                    "page_count": 0,
                    "character_count": 0,
                    "status": "error",
                    "error": f"Processing error: {str(e)}"
                })
                failed_extractions += 1
        
        processing_time = time.time() - start_time
        
        logger.info(f"Completed processing {len(files)} files in {processing_time:.2f}s: "
                   f"{successful_extractions} successful, {failed_extractions} failed")
        
        return {
            "success": True,
            "total_files": len(files),
            "successful_extractions": successful_extractions,
            "failed_extractions": failed_extractions,
            "total_pages": total_pages,
            "total_characters": total_characters,
            "processing_time_seconds": round(processing_time, 2),
            "results": results
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

# Legacy endpoints - DEPRECATED (kept for backward compatibility but will be removed)
@app.post("/extract-text")
async def extract_text_legacy(file: UploadFile = File(...)):
    """
    DEPRECATED: Legacy single file endpoint - use /extract instead
    """
    logger.warning("Legacy /extract-text endpoint called - use /extract instead")
    return await extract_pdfs([file])

@app.post("/extract-multiple")
async def extract_multiple_legacy(files: List[UploadFile] = File(...)):
    """
    DEPRECATED: Legacy multiple files endpoint - use /extract instead
    """
    logger.warning("Legacy /extract-multiple endpoint called - use /extract instead")
    return await extract_pdfs(files)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
