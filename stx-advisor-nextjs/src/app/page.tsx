'use client'

import { useState, useRef, useEffect } from 'react'
import { config } from '@/lib/config'
import { TaxAdvisorState, UserData, MultiPDFData } from '@/types'
import { 
  getUserProfile, 
  saveTaxFiling, 
  getTaxFilings, 
  getTaxFilingByYear, 
  hasExistingData,
  getSuggestedDeductions 
} from '@/lib/supabaseService'
import Tabs from '@/components/Tabs'
import AutopilotFlow from './autopilot/page'

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

// Advisor Chat Component
function AdvisorChat() {
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
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [state.messages])

  // Initialize user ID and load existing data when component mounts
  useEffect(() => {
    const id = generateUserId()
    setUserId(id)
    loadExistingData(id)
  }, [])

  const loadExistingData = async (id: string) => {
    try {
      const filings = await getTaxFilings(id)
      if (filings.length > 0) {
        setExistingData(filings)
      }
    } catch (error) {
      console.error('Error loading existing data:', error)
    }
  }

  const checkExistingDataForYear = async (year: number) => {
    try {
      const hasData = await hasExistingData(userId, year)
      if (hasData) {
        const existingFiling = await getTaxFilingByYear(userId, year)
        if (existingFiling) {
          setShowExistingDataModal(true)
          return existingFiling
        }
      }
      return null
    } catch (error) {
      console.error('Error checking existing data:', error)
      return null
    }
  }

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

      setProcessingStatus('Uploading files to server...')

      // Add retry logic for production timeouts
      let response: Response | undefined
      let retryCount = 0
      const maxRetries = 1

      while (retryCount <= maxRetries) {
        try {
          setProcessingStatus(`Processing ${files.length} documents... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          response = await fetch('/api/extract-pdfs', {
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
        employers: [],
        years: new Set(),
        documents: []
      }

      successfulResults.forEach((result: any) => {
        const resultData = result.data

        // Aggregate income - check multiple possible field names
        const income = resultData.bruttolohn || resultData.bruttoarbeitslohn || resultData.gross_income || 0
        if (income) {
          const parsedIncome = parseFloat(income) || 0
          aggregatedData.totalIncome += parsedIncome
        }

        // Collect employers
        if (resultData.employer) {
          aggregatedData.employers.push(resultData.employer)
        }

        // Collect years
        if (resultData.year) {
          aggregatedData.years.add(resultData.year)
        }

        // Store document info
        aggregatedData.documents.push({
          filename: result.filename,
          data: resultData
        })
      })

      console.log('Final aggregated data:', aggregatedData)

      // Check for existing data for the year
      const years = Array.from(aggregatedData.years)
      if (years.length > 0) {
        const year = Math.max(...years.map((y: any) => parseInt(y)))
        const existingFiling = await checkExistingDataForYear(year)
        if (existingFiling) {
          // User chose to use existing data, so we don't proceed with new processing
          return
        }
      }

      // Load suggested deductions
      try {
        const year = Math.max(...years.map((y: any) => parseInt(y)))
        const suggestions = await getSuggestedDeductions(userId, year)
        setSuggestedDeductions(suggestions)
      } catch (error) {
        console.error('Error fetching suggested deductions:', error)
      }

      // Update state with extracted data
      setState(prev => ({
        ...prev,
        loading: false,
        step: 'advisor',
        extractedData: {
          ...aggregatedData,
          gross_income: aggregatedData.totalIncome,
          year: Math.max(...years.map((y: any) => parseInt(y)))
        },
        multiPDFData: {
          totalFiles: successfulResults.length,
          results: successfulResults,
          summary: {
            year: Math.max(...years.map((y: any) => parseInt(y))),
            grossIncome: aggregatedData.totalIncome,
            incomeTaxPaid: 0,
            employer: aggregatedData.employers[0] || 'Unknown',
            fullName: 'User'
          }
        },
        messages: [] // Start with empty messages, let advisor API handle the flow
      }))

      // Initialize the advisor after successful processing
      try {
        // Map the data to match what the advisor expects
        const advisorData = {
          full_name: 'User',
          employer: aggregatedData.employers.join(', ') || 'Unknown',
          total_hours: 0, // Not available from PDF extraction
          gross_income: aggregatedData.totalIncome,
          income_tax_paid: 0, // Not available from PDF extraction
          solidaritaetszuschlag: 0, // Not available from PDF extraction
          year: Math.max(...years.map((y: any) => parseInt(y))),
          // Additional fields that might be useful
          totalIncome: aggregatedData.totalIncome,
          employers: aggregatedData.employers,
          documents: aggregatedData.documents
        }

        const advisorResponse = await fetch('/api/advisor', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'initialize',
            sessionId: userId,
            extractedData: advisorData
          })
        })

        if (advisorResponse.ok) {
          const advisorResponseData = await advisorResponse.json()
          console.log('Advisor initialized successfully')
          console.log('Advisor response data:', advisorResponseData)
          
          // Add the advisor's initial message
          setState(prev => ({
            ...prev,
            messages: [
              {
                sender: 'assistant',
                text: advisorResponseData.message
              }
            ]
          }))
        } else {
          console.error('Advisor initialization failed:', await advisorResponse.text())
        }
      } catch (error) {
        console.error('Error initializing advisor:', error)
      }

    } catch (error) {
      console.error('Upload error:', error)
      setState(prev => ({ 
        ...prev, 
        loading: false,
        messages: [
          {
            sender: 'assistant',
            text: `I encountered an issue processing your documents: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again with different files or contact support if the problem persists.`
          }
        ]
      }))
    } finally {
      setProcessingStatus('')
    }
  }

  const handleUserResponse = async (message: string) => {
    if (!message.trim()) return

    // Add user message to chat
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { sender: 'user', text: message }]
    }))

    try {
      const response = await fetch('/api/advisor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'respond',
          sessionId: userId,
          message: message,
          extractedData: state.extractedData,
          multiPDFData: state.multiPDFData
        })
      })

      if (response.ok) {
        const data = await response.json()
        
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, { sender: 'assistant', text: data.message }],
          done: data.done || false,
          deductionFlow: data.deductionFlow || prev.deductionFlow,
          currentQuestionIndex: data.currentQuestionIndex || prev.currentQuestionIndex,
          taxCalculation: data.taxCalculation || prev.taxCalculation
        }))

        // If the advisor is done, save the filing
        if (data.done && data.taxCalculation) {
          try {
            const year = state.extractedData?.year || new Date().getFullYear()
            
            await saveTaxFiling({
              user_id: userId,
              year: year,
              gross_income: state.extractedData?.gross_income || 0,
              income_tax_paid: 0,
              employer: state.extractedData?.employer || 'Unknown',
              full_name: 'User',
              deductions: state.deductionAnswers
            })

            console.log('Tax filing saved successfully')
          } catch (error) {
            console.error('Error saving tax filing:', error)
          }
        }
      } else {
        throw new Error('Failed to get advisor response')
      }
    } catch (error) {
      console.error('Error getting advisor response:', error)
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, { 
          sender: 'assistant', 
          text: 'I apologize, but I encountered an error processing your request. Please try again or contact support if the problem persists.' 
        }]
      }))
    }
  }

  const handleFileAnotherYear = () => {
    setState(prev => ({
      ...prev,
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
    }))
  }

  const handleUseExistingData = async (existingFiling: any) => {
    setShowExistingDataModal(false)
    
    setState(prev => ({
      ...prev,
      step: 'advisor',
      extractedData: {
        gross_income: existingFiling.totalIncome,
        employer: existingFiling.employer || 'Unknown',
        year: existingFiling.year
      },
      messages: [
        {
          sender: 'assistant',
          text: `Welcome back! I can see you have existing data for ${existingFiling.year}. Your total income was €${formatCurrency(existingFiling.totalIncome)}. Would you like me to help you with anything specific about your tax filing?`
        }
      ]
    }))
  }

  const handleStartNew = () => {
    setShowExistingDataModal(false)
    setState(prev => ({
      ...prev,
      step: 'upload'
    }))
  }

  const formatCurrency = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return '0'
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const getUniqueEmployers = () => {
    if (!state.extractedData?.employer) return []
    return [state.extractedData.employer]
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white shadow rounded-lg">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">German Tax Advisor</h2>
          
          {state.step === 'upload' && (
            <div className="mb-6">
              <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">
                Upload your German tax documents (PDF)
              </label>
              <input
                type="file"
                id="file-upload"
                multiple
                accept=".pdf"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {state.loading && (
                <div className="mt-4">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-600">{processingStatus}</span>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {state.step === 'advisor' && (
            <div className="flex flex-col h-[calc(100vh-300px)] min-h-[500px]">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4" ref={chatContainerRef}>
                {state.messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-lg ${
                        message.sender === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="border-t p-4 bg-white">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const input = e.currentTarget.elements.namedItem('message') as HTMLInputElement
                    if (input.value.trim()) {
                      handleUserResponse(input.value)
                      input.value = ''
                    }
                  }}
                  className="flex space-x-2"
                >
                  <input
                    type="text"
                    name="message"
                    placeholder="Type your message..."
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Send
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Existing Data Modal */}
      {showExistingDataModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Existing Data Found
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                We found existing tax filing data for this year. Would you like to use the existing data or start fresh?
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => handleUseExistingData(existingData)}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Use Existing
                </button>
                <button
                  onClick={handleStartNew}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  Start Fresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TaxAdvisorApp() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">STX Tax Advisor</h1>
          <p className="text-gray-600">Your AI-powered German tax filing assistant</p>
        </div>
        
        <Tabs 
          tabs={[
            {
              key: 'advisor',
              label: 'Advisor',
              content: <AdvisorChat />
            },
            {
              key: 'autopilot',
              label: 'Autopilot',
              content: <AutopilotFlow />
            }
          ]}
          defaultTab="advisor"
        />
      </div>
    </div>
  )
}
