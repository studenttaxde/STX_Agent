# processor.py
"""
Handles document extraction from various formats (PDF, JSON, CSV).
"""

import os
import fitz  # PyMuPDF
from dotenv import load_dotenv
import openai
import re

load_dotenv()

class DocumentProcessor:
    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        openai.api_key = self.openai_api_key

    def extract(self, file_path: str) -> dict:
        """
        Extracts data from the given document using PyMuPDF and OpenAI.
        Args:
            file_path (str): Path to the document file.
        Returns:
            dict: Extracted data.
        """
        try:
            # Extract text from PDF using PyMuPDF
            text = ""
            if file_path.lower().endswith(".pdf"):
                doc = fitz.open(file_path)
                for page in doc:
                    text += page.get_text()
                doc.close()
            else:
                with open(file_path, "r", encoding="utf-8") as f:
                    text = f.read()
            if not text.strip():
                return {"error": "No text extracted from document."}
            if self.openai_api_key:
                response = openai.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a tax assistant. Extract tax-relevant fields from documents."},
                        {"role": "user", "content": (
                            "Extract the following fields from this document text and return ONLY valid JSON (no explanation, no markdown, no comments, no code block, no triple backticks):\n"
                            "Fields: full_name, address, employer, total_hours, gross_income, income_tax_paid, year\n"
                            f"Document text:\n{text}\n"
                            "Respond ONLY with a valid JSON object."
                        )}
                    ]
                )
                import json
                content = response.choices[0].message.content or ""
                print("[OpenAI raw response]", content)  # Log the raw response
                # Remove markdown code fences and 'json' label if present
                content_clean = re.sub(r"^```json\\s*|^```|```$", "", content.strip(), flags=re.IGNORECASE | re.MULTILINE).strip()
                try:
                    fields = json.loads(content_clean)
                    print("[OpenAI parsed fields]", fields)  # Log parsed fields
                    return fields
                except Exception as e:
                    print(f"[OpenAI JSON parse error] {e}")
                    # Fallback: return the raw response so the UI can show it
                    return {"fallback": content}
            else:
                return {"error": "OpenAI API key not configured."}
        except Exception as e:
            return {"error": f"Extraction failed: {str(e)}"} 