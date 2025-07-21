# main.py
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from agent.processor import DocumentProcessor
from agent.questioner import Questioner
from agent.form_filler import FormFiller
from agent.memory import Memory
import logging
from fastapi import HTTPException
from agent.advisor import TaxAdvisor
import sys
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import pathlib

logging.basicConfig(level=logging.INFO)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()

# Pre-flight checks
if not os.path.exists('.env'):
    logging.error(".env file not found! Please create one with your OpenAI API key.")
    sys.exit(1)
if not os.getenv("OPENAI_API_KEY"):
    logging.error("OPENAI_API_KEY not set in .env! Please add it.")
    sys.exit(1)

processor = DocumentProcessor()
questioner = Questioner()
form_filler = FormFiller()
memory = Memory()
advisor = TaxAdvisor()
conversation_history = []

UPLOAD_DIR = "data/sample_docs/"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Serve React build directory
frontend_build_path = pathlib.Path(__file__).parent / "frontend" / "build"
if frontend_build_path.exists():
    app.mount("/static", StaticFiles(directory=frontend_build_path / "static"), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(frontend_build_path / "index.html")

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Serve index.html for any unknown path (for React Router)
        return FileResponse(frontend_build_path / "index.html")

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    try:
        file_location = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_location, "wb") as f:
            f.write(await file.read())
        logging.info(f"File uploaded: {file.filename}")
        return {"filename": file.filename, "path": file_location}
    except Exception as e:
        logging.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/extract")
async def extract_fields(filename: str = Form(...)):
    try:
        file_path = os.path.join(UPLOAD_DIR, filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found.")
        extracted = processor.extract(file_path)
        memory.store_data(extracted)
        advisor.set_extracted_data(extracted)
        # Optionally reset conversation history for a new case
        advisor.conversation_history = []
        return extracted
    except Exception as e:
        logging.error(f"Extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@app.post("/questions")
async def generate_questions():
    # Use advisor to generate the next message/question
    next_message = advisor.next_advisor_message()
    # For now, treat each advisor message as a single question
    return {"questions": [next_message]}

@app.post("/fill-form")
async def fill_form(answers: dict):
    # Add user answers to conversation history
    for q, a in answers.items():
        advisor.add_user_message(a)
    # Get the next advisor message (could be a summary or next question)
    next_message = advisor.next_advisor_message()
    # Optionally, also return the filled form as before
    extracted = memory.get_data()
    final_form = form_filler.fill_form(extracted, answers)
    # Heuristic: if advisor message contains certain keywords, consider it done
    done_keywords = ["all done", "summary", "refund", "no further questions", "file for another year", "eligible for a full refund"]
    done = any(kw.lower() in next_message.lower() for kw in done_keywords)
    return {"advisor_message": next_message, "filled_form": final_form, "done": done}

@app.get("/")
def root():
    return {"message": "Tax Agent Backend API is running."}

@app.get("/health")
def health():
    return {"status": "ok"}

