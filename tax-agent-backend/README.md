# Tax Agent Backend

A backend system for extracting data from tax documents, dynamically questioning users, and generating pre-filled forms using AI.

## Project Structure

- `main.py`: Entry point
- `agent/`: Core logic modules
  - `processor.py`: Document extraction
  - `questioner.py`: Dynamic questioning
  - `form_filler.py`: Output/form generation
  - `memory.py`: Conversation and data storage
- `prompts/`: Prompt templates for LLMs
- `data/sample_docs/`: Sample documents (PDF, JSON, CSV)
- `.env`: Environment variables (API keys, etc.)
- `requirements.txt`: Dependencies

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   cd tax-agent-backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   cd frontend && npm install && cd ..
   ```
3. Add your API keys to the `.env` file in `tax-agent-backend/`:
   ```env
   OPENAI_API_KEY=sk-...
   ```

## Usage

### Development (hot reload)

- **Backend:**
  ```bash
  cd tax-agent-backend
  source venv/bin/activate
  uvicorn main:app --reload
  ```
- **Frontend:**
  ```bash
  cd tax-agent-backend/frontend
  npm start
  ```

### Production (unified app)

1. Build the frontend:
   ```bash
   cd tax-agent-backend/frontend
   npm run build
   cd ..
   ```
2. Start the backend (serves React build):
   ```bash
   source venv/bin/activate
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
3. Visit [http://localhost:8000](http://localhost:8000)

### One-command Development

- Use the provided script to start both backend and frontend with hot reload:
  ```bash
  cd tax-agent-backend
  ./run_dev.sh
  ```

## Health Check
- Visit [http://localhost:8000/health](http://localhost:8000/health) to check backend status.

## Error Handling & Logging
- The backend logs all OpenAI responses and errors for debugging.
- If extraction fails, clear error messages are returned to the frontend.
- On startup, the backend checks for `.env` and `OPENAI_API_KEY` and will not start if missing.

## Notes
- Ensure the backend is running before using the frontend.
- The frontend communicates with the backend at http://localhost:8000 (CORS is enabled).
- Update the backend logic in `tax-agent-backend/agent/` as needed for your use case.

## License
MIT 