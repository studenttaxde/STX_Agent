import fitz  # PyMuPDF
import openai
import os
from dotenv import load_dotenv

load_dotenv()

openai.api_key = os.getenv("OPENAI_API_KEY")


def extract_text_from_pdf(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    return full_text


def extract_fields(pdf_path: str) -> dict:
    document_text = extract_text_from_pdf(pdf_path)

    prompt = f"""
You are a German tax assistant. Extract the following fields from the document below:
- Employer Name
- Steuer-ID
- Bruttoarbeitslohn (Gross Income)
- Lohnsteuer (Income Tax Paid)
- Kirchensteuer (Church Tax)
- Krankenversicherung (Health Insurance)

Give your response as valid JSON.

--- START DOCUMENT ---
{document_text}
--- END DOCUMENT ---
"""

    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1
    )

    return response.choices[0].message.content
