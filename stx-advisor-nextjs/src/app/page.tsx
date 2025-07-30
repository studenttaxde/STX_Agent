'use client'

import { useState, useRef, useEffect } from 'react'
import { config } from '@/lib/config'
import { TaxAdvisorState, UserData, MultiPDFData } from '@/types'

export default function TaxAdvisorApp() {
  const [state, setState] = useState<TaxAdvisorState>({
    messages: [],
    loading: false,
    step: 'upload',
    extractedData: null,
    multiPDFData: null,
    filedSummaries: [],
    deductionAnswers: {},
    currentQuestionIndex: 0,
    deductionFlow: null,
    taxCalculation: null,
    done: false
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [state.messages])

  const handleFileUpload = async (files: FileList) => {
    if (!files || files.length === 0) return

    setState(prev => ({ ...prev, loading: true }))

    try {
      const formData = new FormData()
      Array.from(files).forEach(file => {
        formData.append('files', file)
      })

      const response = await fetch('/api/extract-pdfs', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Extraction failed')
      }

      const data = await response.json()
      console.log('Data extracted:', data)

      setState(prev => ({
        ...prev,
        extractedData: data,
        multiPDFData: {
          totalFiles: files.length,
          results: data.results || [],
          summary: {
            year: data.year,
            grossIncome: data.gross_income,
            incomeTaxPaid: data.income_tax_paid,
            employer: data.employer,
            fullName: data.full_name
          }
        },
        step: 'advisor',
        loading: false
      }))

      // Initialize advisor with extracted data
      const advisorResponse = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'initialize',
          sessionId: 'default',
          extractedData: data
        })
      })

      if (advisorResponse.ok) {
        const advisorData = await advisorResponse.json()
        setState(prev => ({
          ...prev,
          messages: [
            { sender: 'assistant', text: advisorData.message }
          ]
        }))
      }

    } catch (error) {
      console.error('Upload error:', error)
      setState(prev => ({ ...prev, loading: false }))
    }
  }

  const handleUserResponse = async (message: string) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { sender: 'user', text: message }],
      loading: true
    }))

    try {
      const response = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          sessionId: 'default',
          message: message,
          extractedData: state.extractedData
        })
      })

      if (response.ok) {
        const data = await response.json()
        
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, { sender: 'assistant', text: data.message }],
          loading: false,
          deductionAnswers: data.deduction_answers || prev.deductionAnswers,
          taxCalculation: data.tax_calculation || prev.taxCalculation,
          deductionFlow: data.deduction_flow || prev.deductionFlow,
          done: data.done || false
        }))
      }
    } catch (error) {
      console.error('Advisor error:', error)
      setState(prev => ({ ...prev, loading: false }))
    }
  }

  const handleFileAnotherYear = () => {
    setState({
      messages: [],
      loading: false,
      step: 'upload',
      extractedData: null,
      multiPDFData: null,
      filedSummaries: [...state.filedSummaries, {
        year: state.extractedData?.year || new Date().getFullYear().toString(),
        summary: state.taxCalculation || { taxableIncome: 0, refund: 0 },
        deductions: state.deductionAnswers
      }],
      deductionAnswers: {},
      currentQuestionIndex: 0,
      deductionFlow: null,
      taxCalculation: null,
      done: false
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              German Tax Advisor
            </h1>
            <p className="text-gray-600">
              Upload your tax documents and get personalized advice
            </p>
          </div>

          {state.step === 'upload' && (
            <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
              <div className="text-center">
                <div className="mb-4">
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="mb-4">
                  <label htmlFor="file-upload" className="cursor-pointer bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                    Choose PDF Files
                  </label>
                  <input
                    id="file-upload"
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                    className="hidden"
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Upload your German tax documents (Lohnsteuerbescheinigung, etc.)
                </p>
              </div>
            </div>
          )}

          {state.multiPDFData && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <div className="border-b border-gray-200 pb-4 mb-4">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  📊 Document Analysis Complete
                </h2>
                <p className="text-gray-600">
                  Successfully processed {state.multiPDFData.totalFiles} document{state.multiPDFData.totalFiles !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-600">Total Income</div>
                  <div className="text-2xl font-bold text-blue-900">
                    €{Number(state.multiPDFData.summary.grossIncome).toFixed(2)}
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-red-600">Tax Paid</div>
                  <div className="text-2xl font-bold text-red-900">
                    €{Number(state.multiPDFData.summary.incomeTaxPaid).toFixed(2)}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-green-600">Employer</div>
                  <div className="text-lg font-semibold text-green-900">
                    {state.multiPDFData.summary.employer}
                  </div>
                </div>
              </div>

              <details className="bg-gray-50 rounded-lg p-4">
                <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
                  📄 Individual Document Results
                </summary>
                <div className="mt-4 space-y-3">
                  {state.multiPDFData.results && state.multiPDFData.results.length > 0 && state.multiPDFData.results.map((result: any, index: number) => (
                    <div key={index} className="bg-white rounded border p-3">
                      <div className="font-medium text-gray-900">{result.name || 'Document ' + (index + 1)}</div>
                      <div className="text-sm text-gray-600">
                        Income: €{Number(result.bruttolohn || 0).toFixed(2)} | 
                        Tax: €{Number(result.lohnsteuer || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {state.step === 'advisor' && (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
                <h2 className="text-xl font-semibold text-white">
                  💬 Tax Advisor Chat
                </h2>
              </div>

              <div className="flex flex-col h-96">
                <div 
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto px-4 py-6 space-y-4" 
                  style={{ maxHeight: 'calc(100vh - 200px)' }}
                >
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

                {!state.done && (
                  <div className="border-t border-gray-200 p-4">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const input = e.currentTarget.elements.namedItem('message') as HTMLInputElement
                        if (input.value.trim()) {
                          handleUserResponse(input.value.trim())
                          input.value = ''
                        }
                      }}
                      className="flex space-x-4"
                    >
                      <input
                        type="text"
                        name="message"
                        placeholder="Type your response..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={state.loading}
                      />
                      <button
                        type="submit"
                        disabled={state.loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        Send
                      </button>
                    </form>
                  </div>
                )}

                {state.done && (
                  <div className="border-t border-gray-200 p-4">
                    <button
                      onClick={handleFileAnotherYear}
                      className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      File for Another Year
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {state.filedSummaries && state.filedSummaries.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                📋 Previous Filings
              </h3>
              <div className="space-y-3">
                {state.filedSummaries.map((summary, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-gray-900">Year {summary.year}</div>
                        <div className="text-sm text-gray-600">
                          Taxable Income: €{summary.summary.taxableIncome?.toFixed(2) || '0.00'} | 
                          Refund: €{summary.summary.refund?.toFixed(2) || '0.00'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
