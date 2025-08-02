'use client'

import { useState, useRef } from 'react'
import { config } from '@/utils/config'
import { TaxAdvisorState, UserData, MultiPDFData } from '@/types'

// Parse German number format (e.g., "1.713,00" -> 1713.00)
const parseGermanNumber = (value: string): number => {
  if (!value) return 0
  
  // Remove all spaces and trim
  let cleaned = value.replace(/\s/g, '').trim()
  
  // Handle German number format: 1.713,00 -> 1713.00
  // Look for pattern: digits, optional dot, digits, comma, digits
  const germanFormat = /^(\d+)(?:\.(\d+))?,(\d+)$/
  const match = cleaned.match(germanFormat)
  
  if (match) {
    // German format: 1.713,00 -> 1713.00
    const wholePart = match[1] + (match[2] || '')
    const decimalPart = match[3]
    return parseFloat(`${wholePart}.${decimalPart}`) || 0
  }
  
  // Handle simple comma format: 1713,00 -> 1713.00
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0
  }
  
  // Handle dot format: 1713.00 -> 1713.00
  if (cleaned.includes('.')) {
    return parseFloat(cleaned) || 0
  }
  
  // Handle plain number
  return parseFloat(cleaned) || 0
}

// Generate a simple user ID based on browser fingerprint or create a new one
const generateUserId = (): string => {
  // Try to get existing user ID from localStorage
  let userId = localStorage.getItem('stx_user_id')
  
  if (!userId) {
    // Create a new user ID
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('stx_user_id', userId)
  }
  
  return userId
}

// Tax Filing Page Component
export default function TaxFilingPage() {
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

  const [existingData, setExistingData] = useState<any>(null)
  const [suggestedDeductions, setSuggestedDeductions] = useState<any[]>([])
  const [showExistingDataModal, setShowExistingDataModal] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [processingStatus, setProcessingStatus] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize user ID when component mounts
  useState(() => {
    const id = generateUserId()
    setUserId(id)
  })

  const handleFileUpload = async (files: FileList) => {
    if (!files || files.length === 0) return

    // Validate files before processing - only size limits, no count limits
    const maxFileSize = 10 * 1024 * 1024 // 10MB per file
    const maxTotalSize = 100 * 1024 * 1024 // 100MB total (increased from 50MB)

    let totalSize = 0
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > maxFileSize) {
        alert(`File ${files[i].name} is too large. Maximum size is 10MB per file`)
        return
      }
      totalSize += files[i].size
    }

    if (totalSize > maxTotalSize) {
      alert('Total file size exceeds 100MB limit. Please upload fewer files or smaller files.')
      return
    }

    setState(prev => ({ ...prev, loading: true, step: 'upload' }))
    setProcessingStatus('Preparing files for upload...')

    try {
      const formData = new FormData()
      Array.from(files).forEach(file => {
        formData.append('files', file)
      })

      setProcessingStatus('Uploading files to backend...')

      // Add retry logic for production timeouts
      let response: Response | undefined
      let retryCount = 0
      const maxRetries = 1

      // Use config.backendUrl as fallback if NEXT_PUBLIC_BACKEND_URL is not set
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || config.backendUrl

      while (retryCount <= maxRetries) {
        try {
          setProcessingStatus(`Processing ${files.length} documents... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          response = await fetch(`${backendUrl}/extract`, {
            method: 'POST',
            body: formData
          })
          break
        } catch (error) {
          retryCount++
          if (retryCount > maxRetries) {
            throw new Error(`Request failed after ${maxRetries + 1} attempts. Please try again with smaller files.`)
          }
          setProcessingStatus(`Retrying... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
        }
      }

      setProcessingStatus('Analyzing extracted data...')

      if (!response || !response.ok) {
        const errorData = await response?.json().catch(() => ({}))
        throw new Error(errorData?.error || 'Extraction failed')
      }

      const data = await response.json()
      console.log('Data extracted:', data)

      if (!data.success) {
        throw new Error(data.error || 'Extraction failed')
      }

      setProcessingStatus('Processing results...')

      const successfulResults = data.results || []
      const failedResults = data.failed || []
      
      if (successfulResults.length === 0) {
        throw new Error('No files were processed successfully. Please try again with different files.')
      }

      if (failedResults.length > 0) {
        console.warn(`${failedResults.length} files failed to process:`, failedResults)
        setProcessingStatus(`Warning: ${failedResults.length} files failed to process. Continuing with ${successfulResults.length} successful files...`)
      }

      setProcessingStatus('Initializing tax advisor...')

      // Process each result and aggregate data
      const aggregatedData: any = {
        totalIncome: 0,
        lohnsteuer: 0,
        solidaritaetszuschlag: 0,
        employers: [],
        years: new Set(),
        documents: []
      }

      successfulResults.forEach((result: any) => {
        // Check if result is successful
        if (!result.success) {
          console.warn(`Skipping failed result for ${result.filename}:`, result.error || 'No extracted data')
          return
        }

        // Extract data from the result
        const extractedData = result.extractedData || {}
        
        // Parse German numbers
        const income = parseGermanNumber(extractedData.bruttolohn || '0')
        const tax = parseGermanNumber(extractedData.lohnsteuer || '0')
        const solidarity = parseGermanNumber(extractedData.solidaritaetszuschlag || '0')

        // Aggregate data
        if (income > 0) {
          aggregatedData.totalIncome += income
          aggregatedData.lohnsteuer += tax
          aggregatedData.solidaritaetszuschlag += solidarity
        }

        // Collect employers and years
        if (extractedData.employer) {
          aggregatedData.employers.push(extractedData.employer)
        }
        if (extractedData.year) {
          aggregatedData.years.add(extractedData.year)
        }

        // Store document data
        aggregatedData.documents.push({
          filename: result.filename,
          extractedData,
          success: result.success
        })
      })

      console.log('Final aggregated data:', aggregatedData)

      // Create multiPDFData structure
      const multiPDFData: MultiPDFData = {
        summary: {
          totalIncome: aggregatedData.totalIncome,
          incomeTaxPaid: aggregatedData.lohnsteuer,
          solidarityTaxPaid: aggregatedData.solidaritaetszuschlag,
          employers: [...new Set(aggregatedData.employers)],
          years: Array.from(aggregatedData.years).sort(),
          documentCount: successfulResults.length
        },
        documents: aggregatedData.documents,
        rawResults: successfulResults
      }

      setState(prev => ({
        ...prev,
        loading: false,
        step: 'chat',
        multiPDFData,
        extractedData: {
          totalIncome: aggregatedData.totalIncome,
          lohnsteuer: aggregatedData.lohnsteuer,
          solidaritaetszuschlag: aggregatedData.solidaritaetszuschlag,
          employers: [...new Set(aggregatedData.employers)],
          years: Array.from(aggregatedData.years).sort()
        }
      }))

      setProcessingStatus('')

      // Add success message
      setState(prev => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            role: 'assistant',
            content: `✅ Successfully processed ${successfulResults.length} document(s)!\n\n📊 **Summary:**\n• Total Income: €${(aggregatedData.totalIncome / 100).toFixed(2)}\n• Income Tax Paid: €${(aggregatedData.lohnsteuer / 100).toFixed(2)}\n• Solidarity Tax: €${(aggregatedData.solidaritaetszuschlag / 100).toFixed(2)}\n• Employers: ${[...new Set(aggregatedData.employers)].join(', ') || 'Not specified'}\n• Years: ${Array.from(aggregatedData.years).sort().join(', ') || 'Not specified'}\n\nI'm ready to help you with your tax filing! What would you like to know?`
          }
        ]
      }))

    } catch (error) {
      console.error('Upload error:', error)
      setState(prev => ({ ...prev, loading: false }))
      setProcessingStatus('')
      
      setState(prev => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            role: 'assistant',
            content: `❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again with smaller files or fewer files.`
          }
        ]
      }))
    }
  }

  const handleUserResponse = async (message: string) => {
    if (!message.trim()) return

    // Add user message
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { role: 'user', content: message }]
    }))

    setState(prev => ({ ...prev, loading: true }))

    try {
      const advisorData = {
        message,
        userId,
        extractedData: state.extractedData,
        multiPDFData: state.multiPDFData,
        existingData
      }

      console.log('Sending advisor data:', advisorData)

      const advisorResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(advisorData)
      })

      if (!advisorResponse.ok) {
        throw new Error('Failed to get advisor response')
      }

      const advisorResult = await advisorResponse.json()
      console.log('Advisor response:', advisorResult)

      setState(prev => ({
        ...prev,
        loading: false,
        messages: [...prev.messages, { role: 'assistant', content: advisorResult.message }]
      }))

    } catch (error) {
      console.error('Error getting advisor response:', error)
      setState(prev => ({
        ...prev,
        loading: false,
        messages: [...prev.messages, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]
      }))
    }
  }

  const formatCurrency = (amount: number | string | undefined) => {
    if (!amount) return '€0,00'
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(num)
  }

  const getUniqueEmployers = () => {
    if (!state.multiPDFData?.summary?.employers) return []
    return [...new Set(state.multiPDFData.summary.employers)]
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Tax Filing Assistant</h1>
          
          {/* File Upload Section */}
          {state.step === 'upload' && (
            <div className="mb-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Upload PDF Documents
                </button>
                <p className="text-gray-600 mt-2">
                  Upload your German tax documents (Lohnsteuerbescheinigung, etc.)
                </p>
                {processingStatus && (
                  <p className="text-blue-600 mt-2">{processingStatus}</p>
                )}
              </div>
            </div>
          )}

          {/* Chat Interface */}
          {state.step === 'chat' && (
            <div className="space-y-4">
              {/* Summary Card */}
              {state.multiPDFData && (
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-blue-900 mb-2">📊 Document Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Total Income:</span>
                      <div className="font-semibold">{formatCurrency(state.multiPDFData.summary.totalIncome / 100)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Tax Paid:</span>
                      <div className="font-semibold">{formatCurrency(state.multiPDFData.summary.incomeTaxPaid / 100)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Solidarity Tax:</span>
                      <div className="font-semibold">{formatCurrency(state.multiPDFData.summary.solidarityTaxPaid / 100)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Documents:</span>
                      <div className="font-semibold">{state.multiPDFData.summary.documentCount}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {state.messages.map((message, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-100 ml-8'
                        : 'bg-gray-100 mr-8'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                ))}
                {state.loading && (
                  <div className="bg-gray-100 mr-8 p-4 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span>Thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Ask me about your tax filing..."
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      handleUserResponse(e.currentTarget.value.trim())
                      e.currentTarget.value = ''
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement
                    if (input?.value.trim()) {
                      handleUserResponse(input.value.trim())
                      input.value = ''
                    }
                  }}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 