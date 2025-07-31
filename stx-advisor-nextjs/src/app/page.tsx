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
import AutopilotHarness from '@/components/AutopilotHarness'

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

    // Validate files before processing
    const fileArray = Array.from(files)
    const maxFileSize = 10 * 1024 * 1024 // 10MB per file
    const maxFiles = 10 // Maximum 10 files at once
    
    if (fileArray.length > maxFiles) {
      alert(`Too many files selected. Please upload a maximum of ${maxFiles} files at once.`)
      return
    }

    const oversizedFiles = fileArray.filter(file => file.size > maxFileSize)
    if (oversizedFiles.length > 0) {
      alert(`Some files are too large:\n${oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join('\n')}\n\nPlease use files smaller than 10MB each.`)
      return
    }

    const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0)
    const maxTotalSize = 50 * 1024 * 1024 // 50MB total
    if (totalSize > maxTotalSize) {
      alert(`Total file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) is too large. Please upload files with a total size less than 50MB.`)
      return
    }

    setState(prev => ({ ...prev, loading: true }))
    setProcessingStatus(`Preparing ${files.length} files for upload...`)

    try {
      const formData = new FormData()
      Array.from(files).forEach(file => {
        formData.append('files', file)
      })

      setProcessingStatus(`Uploading ${files.length} files to server...`)

      // Add retry logic for production timeouts
      let response: Response | undefined
      let retryCount = 0
      const maxRetries = 2

      while (retryCount <= maxRetries) {
        try {
          setProcessingStatus(`Processing ${files.length} documents... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          response = await fetch('/api/extract-pdfs', {
            method: 'POST',
            body: formData
          })
          break // Success, exit retry loop
        } catch (error) {
          retryCount++
          if (retryCount > maxRetries) {
            throw new Error(`Request failed after ${maxRetries + 1} attempts. Please try with fewer files or smaller files.`)
          }
          setProcessingStatus(`Retrying... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount))
        }
      }

      setProcessingStatus('Analyzing extracted data...')

      if (!response || !response.ok) {
        const errorData = await response?.json().catch(() => ({}))
        throw new Error(errorData?.error || 'Extraction failed')
      }

      const data = await response.json()
      console.log('Data extracted:', data)

      // Handle the new response format
      if (!data.success) {
        throw new Error(data.error || 'Extraction failed')
      }

      setProcessingStatus('Processing results...')

      // Aggregate the results from successful extractions
      const successfulResults = data.results || []
      const failedResults = data.failed || []
      
      console.log('Successful results:', successfulResults)
      console.log('Failed results:', failedResults)
      
      if (successfulResults.length === 0) {
        throw new Error('No files were processed successfully. Please try again with different files.')
      }

      // Show warning if some files failed
      if (failedResults.length > 0) {
        console.warn(`${failedResults.length} files failed to process:`, failedResults)
        setProcessingStatus(`Warning: ${failedResults.length} files failed to process. Continuing with ${successfulResults.length} successful files...`)
      }
      
      let totalGrossIncome = 0
      let totalIncomeTaxPaid = 0
      let totalSolidaritaetszuschlag = 0
      let employer = ''
      let fullName = ''
      let year = ''

      successfulResults.forEach((result: any) => {
        console.log('Processing result:', result)
        const resultData = result.data
        console.log('Result data:', resultData)
        console.log('Result data keys:', Object.keys(resultData))
        console.log('Result data values:', Object.values(resultData))
        
        if (resultData.bruttolohn) {
          const bruttolohn = typeof resultData.bruttolohn === 'string' ? parseFloat(resultData.bruttolohn) : resultData.bruttolohn
          if (!isNaN(bruttolohn)) {
            totalGrossIncome += bruttolohn
            console.log('Added bruttolohn:', bruttolohn, 'Total now:', totalGrossIncome)
          }
        }
        
        if (resultData.lohnsteuer) {
          const lohnsteuer = typeof resultData.lohnsteuer === 'string' ? parseFloat(resultData.lohnsteuer) : resultData.lohnsteuer
          if (!isNaN(lohnsteuer)) {
            totalIncomeTaxPaid += lohnsteuer
            console.log('Added lohnsteuer:', lohnsteuer, 'Total now:', totalIncomeTaxPaid)
          }
        }
        
        if (resultData.solidaritaetszuschlag) {
          const solidaritaetszuschlag = typeof resultData.solidaritaetszuschlag === 'string' ? parseFloat(resultData.solidaritaetszuschlag) : resultData.solidaritaetszuschlag
          if (!isNaN(solidaritaetszuschlag)) {
            totalSolidaritaetszuschlag += solidaritaetszuschlag
            console.log('Added solidaritaetszuschlag:', solidaritaetszuschlag, 'Total now:', totalSolidaritaetszuschlag)
          }
        }

        if (resultData.employer && !employer) {
          employer = resultData.employer
          console.log('Set employer:', employer)
        }
        
        if (resultData.name && !fullName) {
          fullName = resultData.name
          console.log('Set fullName:', fullName)
        }
        
        if (resultData.year && !year) {
          year = resultData.year.toString()
          console.log('Set year:', year)
        }
      })

      setProcessingStatus('Finalizing analysis...')

      const aggregatedData = {
        year: parseInt(year) || new Date().getFullYear(),
        gross_income: totalGrossIncome,
        income_tax_paid: totalIncomeTaxPaid,
        solidaritaetszuschlag: totalSolidaritaetszuschlag,
        employer: employer || 'Unknown',
        full_name: fullName || 'User'
      }

      console.log('Final aggregated data:', aggregatedData)
      console.log('Aggregated data keys:', Object.keys(aggregatedData))
      console.log('Aggregated data values:', Object.values(aggregatedData))

      // Check for existing data for this year
      const existingFiling = await checkExistingDataForYear(aggregatedData.year)
      
      if (existingFiling) {
        setState(prev => ({
          ...prev,
          loading: false,
          extractedData: aggregatedData,
          multiPDFData: {
            totalFiles: successfulResults.length,
            summary: {
              year: aggregatedData.year,
              grossIncome: aggregatedData.gross_income,
              incomeTaxPaid: aggregatedData.income_tax_paid,
              solidarityTax: aggregatedData.solidaritaetszuschlag,
              employer: aggregatedData.employer,
              fullName: aggregatedData.full_name
            },
            results: successfulResults.map((result: any) => result.data)
          }
        }))
        setProcessingStatus('')
        return
      }

      // Load suggested deductions
      const deductions = await getSuggestedDeductions(userId, aggregatedData.year)
      setSuggestedDeductions(deductions)

      setState(prev => ({
        ...prev,
        loading: false,
        step: 'advisor',
        extractedData: aggregatedData,
        multiPDFData: {
          totalFiles: successfulResults.length,
          summary: {
            year: aggregatedData.year,
            grossIncome: aggregatedData.gross_income,
            incomeTaxPaid: aggregatedData.income_tax_paid,
            solidarityTax: aggregatedData.solidaritaetszuschlag,
            employer: aggregatedData.employer,
            fullName: aggregatedData.full_name
          },
          results: successfulResults.map((result: any) => result.data)
        }
      }))

      setProcessingStatus('')

      // Initialize the advisor with the extracted data
      try {
        setProcessingStatus('Initializing tax advisor...')
        
        const advisorResponse = await fetch('/api/advisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'initialize',
            sessionId: 'default',
            extractedData: aggregatedData,
            existingData: null,
            suggestedDeductions: deductions
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
        } else {
          console.error('Failed to initialize advisor:', await advisorResponse.text())
          // Add a fallback message
          setState(prev => ({
            ...prev,
            messages: [
              { sender: 'assistant', text: 'Hello! I\'ve analyzed your tax documents. Let me help you with your tax filing process. Please confirm the tax year and I\'ll guide you through the deductions.' }
            ]
          }))
        }
      } catch (error) {
        console.error('Error initializing advisor:', error)
        // Add a fallback message
        setState(prev => ({
          ...prev,
          messages: [
            { sender: 'assistant', text: 'Hello! I\'ve analyzed your tax documents. Let me help you with your tax filing process. Please confirm the tax year and I\'ll guide you through the deductions.' }
          ]
        }))
      }

    } catch (error) {
      console.error('File upload error:', error)
      setState(prev => ({ ...prev, loading: false }))
      setProcessingStatus('')
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      alert(`Upload failed: ${errorMessage}\n\nPlease try:\n- Uploading fewer files at once (max 10)\n- Using smaller PDF files (max 10MB each)\n- Checking your internet connection`)
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          sessionId: 'default',
          message: message
        })
      })

      if (response.ok) {
        const data = await response.json()
        
        if (data.success) {
          setState(prev => ({
            ...prev,
            messages: [...prev.messages, { sender: 'assistant', text: data.message }],
            done: data.done || false,
            deductionFlow: data.deduction_flow || null,
            currentQuestionIndex: data.current_question_index || 0,
            deductionAnswers: data.deduction_answers || {},
            taxCalculation: data.tax_calculation || null
          }))
        } else {
          setState(prev => ({
            ...prev,
            messages: [...prev.messages, { sender: 'assistant', text: 'Sorry, I encountered an error. Please try again.' }]
          }))
        }
      } else {
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, { sender: 'assistant', text: 'Sorry, I encountered an error. Please try again.' }]
        }))
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, { sender: 'assistant', text: 'Sorry, I encountered an error. Please try again.' }]
      }))
    }
  }

  const handleFileAnotherYear = () => {
    setState(prev => ({
      ...prev,
      step: 'upload',
      messages: [],
      extractedData: null,
      multiPDFData: null,
      deductionAnswers: {},
      currentQuestionIndex: 0,
      deductionFlow: null,
      taxCalculation: null,
      done: false
    }))
    setShowExistingDataModal(false)
  }

  const handleUseExistingData = async (existingFiling: any) => {
    try {
      setState(prev => ({
        ...prev,
        step: 'advisor',
        extractedData: {
          year: existingFiling.year,
          gross_income: existingFiling.gross_income,
          income_tax_paid: existingFiling.income_tax_paid,
          solidaritaetszuschlag: existingFiling.solidarity_tax || 0,
          employer: existingFiling.employer,
          full_name: existingFiling.full_name
        }
      }))

      const deductions = await getSuggestedDeductions(userId, existingFiling.year)
      setSuggestedDeductions(deductions)

      const advisorResponse = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'initialize',
          sessionId: 'default',
          extractedData: {
            year: existingFiling.year,
            gross_income: existingFiling.gross_income,
            income_tax_paid: existingFiling.income_tax_paid,
            solidaritaetszuschlag: existingFiling.solidarity_tax || 0,
            employer: existingFiling.employer,
            full_name: existingFiling.full_name
          },
          existingData: existingFiling,
          suggestedDeductions: deductions
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

      setShowExistingDataModal(false)
    } catch (error) {
      console.error('Error using existing data:', error)
      setShowExistingDataModal(false)
    }
  }

  const handleStartNew = () => {
    setShowExistingDataModal(false)
  }

  const formatCurrency = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return '€0,00'
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return `€${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getUniqueEmployers = () => {
    if (!state.multiPDFData?.results) return []
    const employers = state.multiPDFData.results
      .map((result: any) => result.employer)
      .filter((employer: string) => employer && employer !== 'Unknown')
    return [...new Set(employers)]
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white shadow rounded-lg">
        {state.step === 'upload' && (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">German Tax Advisor</h2>
            
            <div className="mb-6">
              <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">
                Upload your German tax documents (PDF)
              </label>
              <input
                ref={fileInputRef}
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

            {existingData && existingData.length > 0 && (
              <div className="mt-6 p-4 bg-blue-50 rounded-md">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Previous Filings</h3>
                <div className="space-y-2">
                  {existingData.map((filing: any, index: number) => (
                    <div key={index} className="text-sm text-blue-800">
                      {filing.year}: {formatCurrency(filing.gross_income)} - {filing.employer}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {state.step === 'advisor' && (
          <div className="flex flex-col h-96">
            <div className="flex-1 overflow-y-auto p-6" ref={chatContainerRef}>
              {state.messages.map((message, index) => (
                <div
                  key={index}
                  className={`mb-4 ${
                    message.sender === 'user' ? 'text-right' : 'text-left'
                  }`}
                >
                  <div
                    className={`inline-block max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.sender === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="border-t p-4">
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

      {/* Existing Data Modal */}
      {showExistingDataModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Existing Filing Found
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                We found an existing filing for this year. Would you like to use it or start fresh?
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => handleUseExistingData(existingData.find((f: any) => f.year === state.extractedData?.year))}
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
            },
            { 
              key: 'harness', 
              label: 'Harness', 
              content: <AutopilotHarness />
            }
          ]}
          defaultTab="advisor"
        />
      </div>
    </div>
  )
}
