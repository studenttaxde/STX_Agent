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

    setState(prev => ({ ...prev, loading: true }))
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
      const maxRetries = 2

      while (retryCount <= maxRetries) {
        try {
          setProcessingStatus(`Processing documents... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          response = await fetch('/api/extract-pdfs', {
            method: 'POST',
            body: formData
          })
          break // Success, exit retry loop
        } catch (error) {
          retryCount++
          if (retryCount > maxRetries) {
            throw new Error('Request failed after multiple attempts. Please try again.')
          }
          setProcessingStatus(`Retrying... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          // Wait before retrying
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

      // Handle the new response format
      if (!data.success) {
        throw new Error(data.error || 'Extraction failed')
      }

      setProcessingStatus('Processing results...')

      // Aggregate the results from successful extractions
      const successfulResults = data.results || []
      console.log('Successful results:', successfulResults)
      
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
      console.error('Error processing files:', error)
      setState(prev => ({ ...prev, loading: false }))
      setProcessingStatus('')
      
      let errorMessage = 'Failed to process files. '
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('Failed to fetch')) {
          errorMessage += 'The request timed out. Please try again with fewer files or check your connection.'
        } else if (error.message.includes('Extraction failed')) {
          errorMessage += 'The PDF extraction failed. Please ensure your files are valid German tax documents.'
        } else {
          errorMessage += error.message
        }
      }
      
      alert(errorMessage)
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

        // Save data to Supabase when conversation is done
        if (data.done && state.extractedData) {
          await saveTaxFiling({
            user_id: userId,
            year: parseInt(state.extractedData.year?.toString() || new Date().getFullYear().toString()),
            gross_income: state.extractedData.gross_income || 0,
            income_tax_paid: state.extractedData.income_tax_paid || 0,
            employer: state.extractedData.employer || 'Unknown',
            full_name: state.extractedData.full_name || 'User',
            taxable_income: data.tax_calculation?.taxableIncome,
            refund: data.tax_calculation?.refund,
            deductions: data.deduction_answers || {}
          })
        }
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
        year: (state.extractedData?.year || new Date().getFullYear()).toString(),
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

  const handleUseExistingData = async (existingFiling: any) => {
    setShowExistingDataModal(false)
    
    // Pre-fill the form with existing data
    setState(prev => ({
      ...prev,
      extractedData: {
        year: existingFiling.year,
        gross_income: existingFiling.gross_income,
        income_tax_paid: existingFiling.income_tax_paid,
        employer: existingFiling.employer,
        full_name: existingFiling.full_name
      },
      multiPDFData: {
        totalFiles: 1,
        results: [],
        summary: {
          year: existingFiling.year,
          grossIncome: existingFiling.gross_income,
          incomeTaxPaid: existingFiling.income_tax_paid,
          employer: existingFiling.employer,
          fullName: existingFiling.full_name
        }
      },
      step: 'advisor',
      deductionAnswers: existingFiling.deductions || {}
    }))

    // Initialize advisor with existing data
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
          employer: existingFiling.employer,
          full_name: existingFiling.full_name
        },
        existingData: existingFiling,
        suggestedDeductions: suggestedDeductions
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
  }

  const handleStartNew = () => {
    setShowExistingDataModal(false)
  }

  // Helper function to format currency
  const formatCurrency = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return '€0.00'
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return `€${num.toFixed(2)}`
  }

  // Helper function to get unique employers
  const getUniqueEmployers = () => {
    if (!state.multiPDFData?.results) return []
    const employers = state.multiPDFData.results
      .map(result => result.employer)
      .filter(Boolean)
    return [...new Set(employers)]
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              German Tax Advisor
            </h1>
            <p className="text-gray-600">
              Upload your tax documents and get personalized advice
            </p>
          </div>

          {/* Existing Data Modal */}
          {showExistingDataModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  📋 Existing Data Found
                </h3>
                <p className="text-gray-600 mb-6">
                  We found existing tax data for this year. Would you like to use it as a starting point?
                </p>
                <div className="flex space-x-4">
                  <button
                    onClick={() => handleUseExistingData(existingData)}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Use Existing Data
                  </button>
                  <button
                    onClick={handleStartNew}
                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Start New
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* File Upload Section */}
          {state.step === 'upload' && (
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
              <div className="text-center">
                <div className="mb-6">
                  <svg className="mx-auto h-16 w-16 text-blue-500" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                
                {state.loading ? (
                  <div className="mb-6">
                    <div className="flex items-center justify-center mb-4">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Processing Your Documents</h3>
                      <p className="text-gray-600">{processingStatus || 'Extracting tax information from your PDF files...'}</p>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                      </div>
                      
                      <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <span>This may take a few moments</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6">
                    <label htmlFor="file-upload" className="cursor-pointer bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold text-lg shadow-lg">
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
                )}
                
                <p className="text-gray-500">
                  {state.loading ? 'Please wait while we analyze your documents...' : 'Upload your German tax documents (Lohnsteuerbescheinigung, etc.)'}
                </p>
              </div>
            </div>
          )}

          {/* Document Analysis Summary - Only show once after upload */}
          {state.multiPDFData && state.step === 'advisor' && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    📊 Document Analysis
                  </h2>
                  <p className="text-gray-600">
                    {state.multiPDFData.totalFiles} document{state.multiPDFData.totalFiles !== 1 ? 's' : ''} processed successfully
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Tax Year</div>
                  <div className="text-xl font-bold text-blue-600">
                    {state.multiPDFData.summary.year}
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-blue-600 mb-1">Total Income</div>
                      <div className="text-3xl font-bold text-blue-900">
                        {formatCurrency(state.multiPDFData.summary.grossIncome)}
                      </div>
                    </div>
                    <div className="text-blue-400">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-red-600 mb-1">Tax Paid</div>
                      <div className="text-3xl font-bold text-red-900">
                        {formatCurrency(state.multiPDFData.summary.incomeTaxPaid)}
                      </div>
                    </div>
                    <div className="text-red-400">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-green-600 mb-1">Employer</div>
                      <div className="text-lg font-bold text-green-900 truncate">
                        {state.multiPDFData.summary.employer || 'Multiple Employers'}
                      </div>
                    </div>
                    <div className="text-green-400">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Details - Collapsible */}
              {state.multiPDFData.results && state.multiPDFData.results.length > 1 && (
                <details className="bg-gray-50 rounded-xl p-4">
                  <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Individual Documents ({state.multiPDFData.results.length} files)
                  </summary>
                  <div className="mt-4 space-y-3">
                    {state.multiPDFData.results.map((result: any, index: number) => (
                      <div key={index} className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 mb-1">
                              {result.name || `Document ${index + 1}`}
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                              {result.time_period_from && result.time_period_to && (
                                <div>Period: {result.time_period_from} - {result.time_period_to}</div>
                              )}
                              {result.employer && (
                                <div>Employer: {result.employer}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(result.bruttolohn)}
                            </div>
                            <div className="text-xs text-gray-500">
                              Tax: {formatCurrency(result.lohnsteuer)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Chat Interface */}
          {state.step === 'advisor' && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
                <h2 className="text-xl font-semibold text-white flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Tax Advisor Chat
                </h2>
              </div>

              <div className="flex flex-col h-96">
                <div 
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto px-6 py-6 space-y-4" 
                  style={{ maxHeight: 'calc(100vh - 300px)' }}
                >
                  {state.messages && state.messages.length > 0 && state.messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-6 py-4 rounded-2xl ${
                          message.sender === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                            : 'bg-gray-50 text-gray-800 border border-gray-200'
                        }`}
                      >
                        <div className="whitespace-pre-wrap leading-relaxed">{message.text}</div>
                      </div>
                    </div>
                  ))}
                  {state.loading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-50 text-gray-800 border border-gray-200 px-6 py-4 rounded-2xl">
                        <div className="flex items-center space-x-3">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                          <span className="text-sm text-gray-600">Processing...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {!state.done && (
                  <div className="border-t border-gray-200 p-6">
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
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                        disabled={state.loading}
                      />
                      <button
                        type="submit"
                        disabled={state.loading}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-200 font-semibold"
                      >
                        Send
                      </button>
                    </form>
                  </div>
                )}

                {state.done && (
                  <div className="border-t border-gray-200 p-6">
                    <button
                      onClick={handleFileAnotherYear}
                      className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-200 font-semibold text-lg"
                    >
                      File for Another Year
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Previous Filings - Only show if there are any */}
          {state.filedSummaries && state.filedSummaries.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 mt-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Previous Filings
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.filedSummaries.map((summary, index) => (
                  <div key={index} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                    <div className="flex justify-between items-start mb-3">
                      <div className="text-lg font-bold text-gray-900">
                        Year {summary.year}
                      </div>
                      <div className="text-sm text-gray-500">
                        #{index + 1}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Taxable Income:</span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(summary.summary.taxableIncome)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Refund:</span>
                        <span className="font-semibold text-green-600">
                          {formatCurrency(summary.summary.refund)}
                        </span>
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
