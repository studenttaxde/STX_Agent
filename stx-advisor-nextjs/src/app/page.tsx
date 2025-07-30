'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, MessageCircle, FileText, CheckCircle, Send, Calendar, DollarSign, User, Building, BarChart3, ChevronDown } from 'lucide-react';
import { Message, ConversationState, ExtractedData, MultiPDFExtractionResponse } from '@/types';

export default function TaxAdvisorApp() {
  const [state, setState] = useState<ConversationState>({
    messages: [],
    extractedData: null,
    multiPDFData: null,
    currentQuestion: null,
    answers: {},
    step: 'idle',
    loading: false,
    filedSummaries: [],
    uploadProgress: {}
  });

  const [files, setFiles] = useState<File[]>([]);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  const addMessage = (sender: 'user' | 'agent', text: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substring(7),
      sender,
      text,
      timestamp: new Date()
    };
    
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage]
    }));
  };

  const handleFileUpload = async () => {
    if (files.length === 0) return;

    setState(prev => ({ ...prev, loading: true, step: 'extracting' }));
    const fileNames = files && files.length > 0 ? files.map(f => f.name).join(', ') : '';
    addMessage('user', `Uploaded ${files.length} file(s): ${fileNames}`);

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const extractResponse = await fetch('/api/extract-pdfs', {
        method: 'POST',
        body: formData
      });

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json();
        throw new Error(errorData.error || 'PDF extraction failed');
      }

      const extractDataJson = await extractResponse.json();
      
      if (extractDataJson.total_files === 1) {
        const extractedData: ExtractedData = extractDataJson.results[0].extractedData;
        setState(prev => ({ ...prev, extractedData }));
        
        // Remove the manual extracted data display - let the advisor handle it
        // The advisor will provide a comprehensive summary including the extracted data
        
        const advisorResponse = await fetch('/api/advisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'initialize',
            sessionId,
            extractedData
          })
        });

        if (!advisorResponse.ok) {
          throw new Error('Failed to initialize advisor');
        }

        const advisorData = await advisorResponse.json();
        
        if (advisorData.advisor_message) {
          addMessage('agent', advisorData.advisor_message);
          
          // Check if this is a final message (early exit due to threshold)
          if (advisorData.done) {
            setState(prev => ({
              ...prev,
              step: 'done',
              currentQuestion: null,
              filedSummaries: [...prev.filedSummaries, advisorData.advisor_message]
            }));
          } else {
            setState(prev => ({
              ...prev,
              currentQuestion: advisorData.advisor_message,
              step: 'asking'
            }));
          }
        }
      } else {
        const extractData: MultiPDFExtractionResponse = extractDataJson;
        setState(prev => ({ ...prev, multiPDFData: extractDataJson }));
        const summary = extractData.summary;
        const summaryMessage = `
📊 **Processing Complete!**

**📁 Files Processed:** ${extractData.total_files}
**✅ Successful:** ${extractData.successful_extractions}
**❌ Failed:** ${extractData.failed_extractions}

**💰 Financial Summary:**
• **Total Bruttolohn:** €${isNaN(Number(summary.total_bruttolohn)) ? 'N/A' : Number(summary.total_bruttolohn).toFixed(2)}
• **Total Lohnsteuer:** €${isNaN(Number(summary.total_lohnsteuer)) ? 'N/A' : Number(summary.total_lohnsteuer).toFixed(2)}
• **Total Solidaritätszuschlag:** €${isNaN(Number(summary.total_solidaritaetszuschlag)) ? 'N/A' : Number(summary.total_solidaritaetszuschlag).toFixed(2)}

**📅 Time Periods:**
${summary.time_periods && summary.time_periods.length > 0 ? summary.time_periods.map(tp => `• **${tp.filename}:** ${tp.from} to ${tp.to}`).join('\n') : 'No time periods available'}`;
        addMessage('agent', summaryMessage);
        
        // Continue the conversation with the advisor for multi-PDF
        const advisorResponse = await fetch('/api/advisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'initialize',
            sessionId,
            extractedData: {
              full_name: extractData.results[0]?.extractedData?.name || 'User',
              gross_income: Number(summary.total_bruttolohn) || 0,
              income_tax_paid: Number(summary.total_lohnsteuer) || 0,
              year: extractData.results[0]?.extractedData?.year || new Date().getFullYear(),
              employer: extractData.results[0]?.extractedData?.employer || 'Multiple Employers'
            }
          })
        });

        if (advisorResponse.ok) {
          const advisorData = await advisorResponse.json();
          if (advisorData.advisor_message) {
            addMessage('agent', advisorData.advisor_message);
            
            // Set the conversation state based on advisor response
            if (advisorData.done) {
              setState(prev => ({ 
                ...prev, 
                step: 'done',
                currentQuestion: null,
                filedSummaries: [...prev.filedSummaries, advisorData.advisor_message]
              }));
            } else {
              setState(prev => ({ 
                ...prev, 
                step: 'asking',
                currentQuestion: advisorData.advisor_message
              }));
            }
          } else {
            // Fallback message if advisor doesn't respond
            const fallbackMsg = "I've processed your documents. Please confirm the tax year and I'll help you with your tax filing. Type 'yes' to continue or 'no' if you need to upload different documents.";
            addMessage('agent', fallbackMsg);
            setState(prev => ({ 
              ...prev, 
              step: 'asking',
              currentQuestion: fallbackMsg
            }));
          }
        } else {
          // Error handling
          const errorMsg = "I've processed your documents, but there was an issue with the tax advisor. Please try uploading your documents again or contact support.";
          addMessage('agent', errorMsg);
          setState(prev => ({ ...prev, step: 'done' }));
        }
      }

    } catch (error) {
      console.error('Upload error:', error);
      addMessage('agent', `❌ Error: ${error instanceof Error ? error.message : 'Upload failed'}`);
      setState(prev => ({ ...prev, step: 'idle' }));
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const handleAddFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    
    const pdfFiles = Array.from(newFiles).filter(file => 
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );
    
    setFiles(prev => [...prev, ...pdfFiles]);
  };

  const handleUserResponse = async (response: string) => {
    if (!response.trim()) return;

    addMessage('user', response);
    setState(prev => ({ ...prev, loading: true }));

    try {
      const advisorResponse = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          sessionId,
          userMessage: response
        })
      });

      if (!advisorResponse.ok) {
        throw new Error('Failed to get advisor response');
      }

      const advisorData = await advisorResponse.json();

      if (advisorData.advisor_message) {
        addMessage('agent', advisorData.advisor_message);
        
        // Check if the message contains "file a tax return for another year"
        const isAnotherYearQuestion = advisorData.advisor_message.toLowerCase().includes('file a tax return for another year');
        
        // Check if this is a reset message for new year
        const isResetForNewYear = advisorData.advisor_message.toLowerCase().includes('ready for another year') && 
                                 advisorData.advisor_message.toLowerCase().includes('upload the pdf');
        
        if (advisorData.done) {
          setState(prev => ({
            ...prev,
            step: 'done',
            currentQuestion: null,
            filedSummaries: [...prev.filedSummaries, advisorData.advisor_message]
          }));
        } else if (isResetForNewYear) {
          // Reset the UI for new year filing
          setState(prev => ({
            ...prev,
            step: 'idle',
            currentQuestion: null,
            extractedData: null,
            loading: false
          }));
          
          // Clear files for new upload
          setFiles([]);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } else if (isAnotherYearQuestion) {
          // Special handling for "file for another year" question
          setState(prev => ({
            ...prev,
            currentQuestion: advisorData.advisor_message,
            step: 'asking' // Keep in asking mode to allow response
          }));
        } else {
          setState(prev => ({
            ...prev,
            currentQuestion: advisorData.advisor_message,
            step: 'asking'
          }));
        }
      }

    } catch (error) {
      console.error('Response error:', error);
      addMessage('agent', `❌ Error: ${error instanceof Error ? error.message : 'Failed to process response'}`);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const handleFileAnotherYear = () => {
    setFiles([]);
    setState({
      messages: [{
        id: Math.random().toString(36).substring(7),
        sender: 'agent',
        text: "🎯 **Ready for another year!**\n\nPlease upload your PDF for the year you want to file next.",
        timestamp: new Date()
      }],
      extractedData: null,
      multiPDFData: null,
      currentQuestion: null,
      answers: {},
      step: 'idle',
      loading: false,
      filedSummaries: state.filedSummaries,
      uploadProgress: {}
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-2xl">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center space-x-4">
            <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl">
              <FileText className="h-10 w-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">STX Advisor</h1>
              <p className="text-blue-100 text-lg mt-1">AI-Powered Tax Assistant</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col container mx-auto px-4 py-12">
        <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
          <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 min-h-[400px]">
            
            {/* Filed Years Summary */}
            {state.filedSummaries.length > 0 && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-green-500 p-2 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-bold text-green-800 text-xl">Completed Tax Returns</h3>
                </div>
                <div className="space-y-3">
                  {state.filedSummaries && state.filedSummaries.length > 0 && state.filedSummaries.map((summary, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-green-200 shadow-sm">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 font-medium">{summary}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              {state.messages && state.messages.length > 0 && state.messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-6 py-4 rounded-2xl ${
                      message.sender === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.text}</div>
                  </div>
                </div>
              ))}
              
              {state.loading && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-800 border border-gray-200 shadow-sm px-6 py-4 rounded-2xl">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm text-gray-600">Processing...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Multi-PDF Results Display */}
            {state.multiPDFData && state.multiPDFData.results && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-200 shadow-sm">
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <BarChart3 className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Document Processing Complete</h3>
                        <p className="text-sm text-gray-600">Successfully processed {state.multiPDFData.results.length} PDF files</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        €{isNaN(Number(state.multiPDFData.summary?.total_bruttolohn)) ? '0.00' : Number(state.multiPDFData.summary.total_bruttolohn).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">Total Income</div>
                    </div>
                  </div>
                  
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex items-center space-x-3">
                        <div className="bg-green-100 p-2 rounded-lg">
                          <DollarSign className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Total Tax Paid</div>
                          <div className="text-lg font-semibold text-gray-900">
                            €{isNaN(Number(state.multiPDFData.summary?.total_lohnsteuer)) ? '0.00' : Number(state.multiPDFData.summary.total_lohnsteuer).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex items-center space-x-3">
                        <div className="bg-purple-100 p-2 rounded-lg">
                          <DollarSign className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Solidaritätszuschlag</div>
                          <div className="text-lg font-semibold text-gray-900">
                            €{isNaN(Number(state.multiPDFData.summary?.total_solidaritaetszuschlag)) ? '0.00' : Number(state.multiPDFData.summary.total_solidaritaetszuschlag).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex items-center space-x-3">
                        <div className="bg-orange-100 p-2 rounded-lg">
                          <Calendar className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Tax Year</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {state.multiPDFData.results[0]?.extractedData?.year || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Collapsible Details */}
                  <details className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <summary className="p-4 cursor-pointer hover:bg-gray-50 rounded-xl transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <FileText className="h-5 w-5 text-gray-600" />
                          <span className="font-semibold text-gray-800">View Individual Documents ({state.multiPDFData.results.length} files)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">Click to expand</span>
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        </div>
                      </div>
                    </summary>
                    <div className="p-4 border-t border-gray-200 space-y-3 max-h-96 overflow-y-auto">
                      {state.multiPDFData.results && state.multiPDFData.results.length > 0 && state.multiPDFData.results.map((result, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="font-medium text-gray-800 text-sm truncate max-w-xs">{result.filename}</h5>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {result.success ? '✓ Success' : '✗ Failed'}
                            </span>
                          </div>
                          
                          {result.success && result.extractedData && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              {result.extractedData.name && (
                                <div>
                                  <div className="text-gray-500 font-medium">Name</div>
                                  <div className="text-gray-800 truncate">{result.extractedData.name}</div>
                                </div>
                              )}
                              {result.extractedData.employer && (
                                <div>
                                  <div className="text-gray-500 font-medium">Employer</div>
                                  <div className="text-gray-800 truncate">{result.extractedData.employer}</div>
                                </div>
                              )}
                              {result.extractedData.bruttolohn && (
                                <div>
                                  <div className="text-gray-500 font-medium">Income</div>
                                  <div className="text-gray-800 font-semibold">€{isNaN(Number(result.extractedData.bruttolohn)) ? 'N/A' : Number(result.extractedData.bruttolohn).toFixed(2)}</div>
                                </div>
                              )}
                              {result.extractedData.lohnsteuer && (
                                <div>
                                  <div className="text-gray-500 font-medium">Tax</div>
                                  <div className="text-gray-800 font-semibold">€{isNaN(Number(result.extractedData.lohnsteuer)) ? 'N/A' : Number(result.extractedData.lohnsteuer).toFixed(2)}</div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {!result.success && result.error && (
                            <div className="text-red-600 text-xs">
                              <span className="font-medium">Error:</span> {result.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="border-t bg-gradient-to-r from-gray-50 to-blue-50 p-6">
              {state.step === 'idle' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-lg font-semibold text-gray-800 mb-3">
                      📁 Upload Your Tax Documents
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        multiple
                        onChange={(e) => handleAddFiles(e.target.files)}
                        className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 transition-colors"
                      />
                      <button
                        onClick={handleFileUpload}
                        disabled={files.length === 0 || state.loading}
                        className="flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                      >
                        <Upload className="h-5 w-5" />
                        <span className="font-semibold">{state.loading ? 'Processing...' : 'Upload & Analyze'}</span>
                      </button>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      Select one or more PDF files to get started
                    </p>
                  </div>
                </div>
              )}

              {state.step === 'asking' && state.currentQuestion && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem('response') as HTMLInputElement;
                    if (input.value.trim()) {
                      handleUserResponse(input.value);
                      input.value = '';
                    }
                  }}
                  className="flex space-x-4"
                >
                  <input
                    name="response"
                    type="text"
                    placeholder="Type your answer here..."
                    disabled={state.loading}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-lg text-gray-900 bg-white"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={state.loading}
                    className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </form>
              )}

              {state.step === 'done' && (
                <div className="text-center space-y-6">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="bg-green-500 p-3 rounded-full">
                      <CheckCircle className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-800">🎉 All Done!</h3>
                      <p className="text-gray-600">Your tax analysis is complete</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleFileAnotherYear}
                    className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl font-semibold"
                  >
                    📅 File for Another Year
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-gray-300">© {new Date().getFullYear()} STX Advisor. AI-Powered Tax Assistance</p>
          <p className="text-gray-400 text-sm mt-2">
            Built with ❤️ for German taxpayers • <a href="mailto:support@stxadvisor.com" className="text-blue-400 hover:text-blue-300 transition-colors">Get Support</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
