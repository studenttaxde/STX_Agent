import React, { useState, useRef, useEffect } from "react";
import stxLogo from "./stx_logo.png";

interface Message {
  sender: "user" | "agent";
  text: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ [q: string]: string }>({});
  const [step, setStep] = useState<"idle" | "extracting" | "asking" | "done">("idle");
  const [loading, setLoading] = useState(false);
  const [filedSummaries, setFiledSummaries] = useState<string[]>([]); // Store summaries for each year
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, filedSummaries]);

  // Helper to detect if agent is asking about filing for another year
  const isFileAnotherYearPrompt = (msg: string) =>
    /file for another year|file for past year|file for previous year|file for next year/i.test(msg);

  // Handle file upload and extraction
  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setMessages([{ sender: "user", text: `Uploaded: ${file.name}` }]);
    setStep("extracting");
    // Upload file
    await fetch("/upload", {
      method: "POST",
      body: (() => { const fd = new FormData(); fd.append('file', file); return fd; })(),
    });
    // Extract fields
    const formData = new FormData();
    formData.append("filename", file.name);
    await fetch("/extract", {
      method: "POST",
      body: formData,
    });
    // Get follow-up question (which will be the advisor's summary)
    const qres = await fetch("/questions", { method: "POST" });
    const qdata = await qres.json();
    if (qdata.questions && qdata.questions.length > 0) {
      setCurrentQuestion(qdata.questions[0]);
      setMessages((msgs) => [
        ...msgs,
        { sender: "agent", text: qdata.questions[0] },
      ]);
      setStep("asking");
    } else {
      setStep("done");
      setMessages((msgs) => [
        ...msgs,
        { sender: "agent", text: "No further questions. Extraction complete." },
      ]);
    }
    setLoading(false);
  };

  // Handle user answer to a question
  const handleAnswer = async (q: string, v: string) => {
    setAnswers((a) => ({ ...a, [q]: v }));
    setMessages((msgs) => [...msgs, { sender: "user", text: v }]);
    setLoading(true);
    const res = await fetch("/fill-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...answers, [q]: v }),
    });
    const data = await res.json();
    if (data.done === false && data.advisor_message) {
      setCurrentQuestion(data.advisor_message);
      setMessages((msgs) => [
        ...msgs,
        { sender: "agent", text: data.advisor_message },
      ]);
      setStep("asking");
    } else {
      // Save the summary for this year
      setFiledSummaries((prev) => [
        ...prev,
        data.advisor_message || JSON.stringify(data.filled_form, null, 2)
      ]);
      setMessages((msgs) => [
        ...msgs,
        { sender: "agent", text: `Final summary:\n${JSON.stringify(data.filled_form, null, 2)}` },
      ]);
      setCurrentQuestion(null);
      setStep("done");
    }
    setLoading(false);
  };

  // Handler for filing another year
  const handleFileAnotherYear = () => {
    setFile(null);
    setMessages([]);
    setCurrentQuestion(null);
    setAnswers({});
    setStep("idle");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fa", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "#2563eb", color: "#fff", padding: "1.5rem 0", textAlign: "center", fontSize: 28, fontWeight: 700, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={stxLogo} alt="STX_Advisor Logo" style={{ height: 48, marginRight: 18, verticalAlign: 'middle', borderRadius: 8, background: '#fff', padding: 4 }} />
        <span style={{ verticalAlign: 'middle' }}>STX_Advisor</span>
      </header>
      <main style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "2rem 0" }}>
        <div style={{ width: "100%", maxWidth: 600, background: "#fff", borderRadius: 12, boxShadow: "0 2px 16px #0001", padding: 32, minHeight: 500 }}>
          {/* Show filed year summaries */}
          {filedSummaries.length > 0 && (
            <div style={{ marginBottom: 24, background: "#f3f4f6", borderRadius: 8, padding: 12, border: "1px solid #e5e7eb" }}>
              <b>Filed Years:</b>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {filedSummaries.map((summary, idx) => (
                  <li key={idx} style={{ marginBottom: 8, whiteSpace: "pre-line", fontSize: 15 }}>{summary}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ minHeight: 200, marginBottom: 16, maxHeight: 320, overflowY: "auto", paddingRight: 8, transition: "background 0.2s" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
                margin: "8px 0"
              }}>
                <span style={{
                  display: "inline-block",
                  background: msg.sender === "user" ? "#2563eb" : "#e5e7eb",
                  color: msg.sender === "user" ? "#fff" : "#222",
                  borderRadius: 18,
                  padding: "10px 18px",
                  maxWidth: "80%",
                  fontSize: 16,
                  boxShadow: msg.sender === "user" ? "0 2px 8px #2563eb22" : "0 2px 8px #0001",
                  whiteSpace: msg.sender === "agent" ? "pre-line" : undefined,
                  transition: "background 0.2s"
                }}>{msg.sender === "agent"
                  ? msg.text.split('\n').map((line, idx) => (
                      <React.Fragment key={idx}>
                        {line}
                        <br />
                      </React.Fragment>
                    ))
                  : msg.text}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {step === "idle" && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="file-upload" style={{ fontWeight: 500, fontSize: 15, marginBottom: 6, display: "block" }}>
                Upload your tax PDF <span title="Only PDF files are supported">📄</span>
              </label>
              <input
                id="file-upload"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ marginBottom: 12 }}
                aria-label="Upload PDF"
              />
              <br />
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                style={{ padding: "10px 28px", borderRadius: 8, background: loading ? "#a5b4fc" : "#2563eb", color: "#fff", border: "none", fontWeight: 600, fontSize: 16, cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 2px 8px #2563eb22" }}
                title={!file ? "Please select a PDF file first" : "Upload and extract"}
              >
                {loading ? <span>Uploading...</span> : "Upload & Extract"}
              </button>
            </div>
          )}
          {step === "asking" && currentQuestion && (
            <form onSubmit={e => {
              e.preventDefault();
              const input = (e.currentTarget.elements[0] as HTMLInputElement);
              const v = input.value;
              if (v) handleAnswer(currentQuestion, v);
              input.value = "";
            }} style={{ marginTop: 16, display: "flex", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Type your answer..."
                style={{ width: "80%", padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 16 }}
                disabled={loading}
                aria-label="Type your answer"
                autoFocus
              />
              <button type="submit" style={{ marginLeft: 8, padding: "10px 20px", borderRadius: 8, background: loading ? "#a5b4fc" : "#2563eb", color: "#fff", border: "none", fontWeight: 600, fontSize: 16, cursor: loading ? "not-allowed" : "pointer" }} disabled={loading}>
                Send
              </button>
            </form>
          )}
          {loading && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <span className="spinner" style={{ display: "inline-block", width: 32, height: 32, border: "4px solid #c7d2fe", borderTop: "4px solid #2563eb", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {/* Show file another year button if agent prompts for it */}
          {step === "done" && messages.length > 0 && isFileAnotherYearPrompt(messages[messages.length - 1].text) && (
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={handleFileAnotherYear} style={{ padding: "10px 28px", borderRadius: 8, background: "#16a34a", color: "#fff", border: "none", fontWeight: 600, fontSize: 16, cursor: "pointer", boxShadow: "0 2px 8px #16a34a22" }}>
                File for another year
              </button>
            </div>
          )}
          {step === "done" && (
            <div style={{ textAlign: "center", marginTop: 24, color: "#16a34a", fontWeight: 600, fontSize: 18 }}>
              All done!
            </div>
          )}
        </div>
      </main>
      <footer style={{ textAlign: "center", padding: "1rem 0", color: "#888", fontSize: 15, background: "#f3f4f6", borderTop: "1px solid #e5e7eb" }}>
        Tax Agent &copy; {new Date().getFullYear()} &mdash; Need help? <a href="mailto:support@example.com" style={{ color: "#2563eb" }}>Contact Support</a>
      </footer>
    </div>
  );
}
