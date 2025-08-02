"use client"

import { useState, useRef } from 'react'
import DeductionReview from '@/features/tax-filing/DeductionReview'
import ClarificationQuestions from '@/features/tax-filing/ClarificationQuestions'

interface DeductionItem {
  category: string
  basis: number
  cap: number | null
  deductible: number
  label?: string
  rationale?: string
}

interface ExtractedFields {
  totalIncome: number
  werbungskosten: number
  sozialversicherung: number
  sonderausgaben: number
  year?: number
  employer?: string
}

export default function AutopilotFlow() {
  const [statusKey, setStatusKey] = useState<string>('')
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [deductions, setDeductions] = useState<DeductionItem[]>([])
  const [showDeductions, setShowDeductions] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [taxYear, setTaxYear] = useState<number>(new Date().getFullYear())
  const [extractedFields, setExtractedFields] = useState<ExtractedFields | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [showClarificationQuestions, setShowClarificationQuestions] = useState(false)
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, any>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const statusOptions = [
    { value: 'bachelor', label: 'Bachelor Student' },
    { value: 'master', label: 'Master Student' },
    { value: 'graduated_same_year', label: 'Graduated Same Year' },
    { value: 'full_time', label: 'Full-time Employee' }
  ]

  // Validate extracted fields before processing
  const validateExtractedFields = (fields: ExtractedFields): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    if (!fields.totalIncome || fields.totalIncome <= 0) {
      errors.push('Total income is required and must be greater than 0')
    }
    
    if (!fields.year || fields.year < 2018 || fields.year > new Date().getFullYear() + 1) {
      errors.push('Valid tax year is required (2018 to current year + 1)')
    }
    
    if (!fields.employer) {
      errors.push('Employer information is required')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // Extract tax year from filename or use current year
  const extractTaxYearFromFiles = (files: FileList): number => {
    const currentYear = new Date().getFullYear()
    
    for (let i = 0; i < files.length; i++) {
      const filename = files[i].name.toLowerCase()
      const yearMatch = filename.match(/(20\d{2})/)
      if (yearMatch) {
        const year = parseInt(yearMatch[1])
        if (year >= 2018 && year <= currentYear + 1) {
          return year
        }
      }
    }
    
    return currentYear
  }

  // Check for missing fields that need clarification
  const checkForMissingFields = (fields: ExtractedFields | null): any[] => {
    if (!fields) return []
    
    const missingFields = []
    
    // Check for common missing fields
    if (!fields.werbungskosten || fields.werbungskosten === 0) {
      missingFields.push({
        id: 'commute_distance',
        question: 'What is your daily commute distance (one way) in kilometers?',
        type: 'number' as const,
        required: false,
        category: 'Werbungskosten',
        helpText: 'This helps calculate travel expenses. If you work from home, enter 0.'
      })
    }
    
    if (!fields.sozialversicherung || fields.sozialversicherung === 0) {
      missingFields.push({
        id: 'health_insurance',
        question: 'Do you have private health insurance?',
        type: 'select' as const,
        options: ['Yes', 'No', 'Public insurance'],
        required: false,
        category: 'Sozialversicherung',
        helpText: 'This affects social insurance contribution calculations.'
      })
    }
    
    return missingFields
  }

  // Handle clarification questions completion
  const handleClarificationComplete = (answers: Record<string, any>) => {
    console.log('Clarification completed with answers:', answers)
    setClarificationAnswers(answers)
    setShowClarificationQuestions(false)
    
    // Update extracted fields with clarification answers
    if (extractedFields) {
      const updatedFields = { ...extractedFields }
      
      if (answers.commute_distance) {
        const newWerbungskosten = (answers.commute_distance * 0.30 * 220) // 30 cents per km, 220 working days
        console.log('Updated Werbungskosten:', newWerbungskosten, 'from commute distance:', answers.commute_distance)
        updatedFields.werbungskosten = newWerbungskosten
      }
      
      if (answers.health_insurance) {
        const newSozialversicherung = answers.health_insurance === 'Yes' ? 5000 : 0
        console.log('Updated Sozialversicherung:', newSozialversicherung, 'from health insurance:', answers.health_insurance)
        updatedFields.sozialversicherung = newSozialversicherung
      }
      
      console.log('Updated extracted fields:', updatedFields)
      setExtractedFields(updatedFields)
    }
    
    // Now show deductions
    console.log('Showing deductions after clarification:', deductions)
    setDeductions(deductions)
    setShowDeductions(true)
    setMessage('')
  }

  const handleClarificationSkip = () => {
    setShowClarificationQuestions(false)
    setDeductions(deductions)
    setShowDeductions(true)
    setMessage('')
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      // Validate that all files are PDFs
      const nonPdfFiles = Array.from(files).filter(file => file.type !== 'application/pdf')
      if (nonPdfFiles.length > 0) {
        setMessage('Please select only PDF files')
        setSelectedFiles(null)
        return
      }
      
      // Extract tax year from filenames
      const extractedYear = extractTaxYearFromFiles(files)
      setTaxYear(extractedYear)
      
      setSelectedFiles(files)
      setMessage('')
    }
  }

  const handleSubmit = async () => {
    if (!statusKey || !selectedFiles) {
      setMessage('Please select both a status and PDF files')
      return
    }

    setIsLoading(true)
    setMessage('')
    setProcessingStatus('Preparing files for upload...')

    try {
      const formData = new FormData()
      Array.from(selectedFiles).forEach(file => {
        formData.append('pdfs', file)
      })
      formData.append('statusKey', statusKey)
      formData.append('taxYear', taxYear.toString())

      setProcessingStatus('Uploading files to server...')

      // Add retry logic for production timeouts
      let response: Response | undefined
      let retryCount = 0
      const maxRetries = 1 // Reduced retries to prevent timeouts

      while (retryCount <= maxRetries) {
        try {
          setProcessingStatus(`Processing ${selectedFiles.length} documents... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          response = await fetch('/api/agent/autodetect', {
            method: 'POST',
            body: formData
          })
          break // Success, exit retry loop
        } catch (error) {
          retryCount++
          if (retryCount > maxRetries) {
            throw new Error(`Request failed after ${maxRetries + 1} attempts. Please try with fewer files (max 5) or smaller files.`)
          }
          setProcessingStatus(`Retrying... (attempt ${retryCount + 1}/${maxRetries + 1})`)
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
        }
      }

      setProcessingStatus('Analyzing results...')

      if (!response || !response.ok) {
        const errorData = await response?.json().catch(() => ({}))
        throw new Error(errorData?.error || 'Autopilot processing failed')
      }

      const data = await response.json()
      console.log('Autopilot response:', data)

      if (data.message) {
        console.log('Received message response:', data.message)
        setMessage(data.message)
        setShowDeductions(false)
      } else if (data.deductions && Array.isArray(data.deductions)) {
        console.log('Processing deductions response:', data.deductions.length, 'deductions')
        
        // Validate extracted fields if available
        if (data.extractedFields) {
          console.log('Validating extracted fields:', data.extractedFields)
          const validation = validateExtractedFields(data.extractedFields)
          if (!validation.isValid) {
            console.log('Validation failed:', validation.errors)
            setMessage(`Data validation failed: ${validation.errors.join(', ')}`)
            setShowDeductions(false)
            return
          }
          console.log('Validation passed, setting extracted fields')
          setExtractedFields(data.extractedFields)
        }
        
        // Check if clarification questions are needed
        const missingFields = checkForMissingFields(data.extractedFields)
        console.log('Missing fields check:', missingFields.length, 'questions needed')
        if (missingFields.length > 0) {
          console.log('Showing clarification questions:', missingFields)
          setShowClarificationQuestions(true)
          return
        }
        
        console.log('Setting deductions and showing review:', data.deductions)
        setDeductions(data.deductions)
        setShowDeductions(true)
        setMessage('')
      } else {
        console.log('Unexpected response format:', data)
        throw new Error('Unexpected response format from autopilot API')
      }
    } catch (error) {
      console.error('Autopilot processing error:', error)
      setMessage(error instanceof Error ? error.message : 'Network error occurred')
      setShowDeductions(false)
    } finally {
      setIsLoading(false)
      setProcessingStatus('')
    }
  }

  const handleConfirm = async (finalDeductions: DeductionItem[]) => {
    setSubmissionStatus('submitting')
    
    try {
      // Prepare submission data
      const submissionData = {
        taxYear,
        statusKey,
        extractedFields,
        deductions: finalDeductions,
        submittedAt: new Date().toISOString(),
        totalDeductions: finalDeductions.reduce((sum, item) => sum + item.deductible, 0)
      }

      console.log('Submitting tax filing:', submissionData)

      // Save to database (if Supabase is configured)
      try {
        const response = await fetch('/api/tax-filing/save-tax-filing', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(submissionData)
        })

        if (response.ok) {
          setSubmissionStatus('success')
          setMessage('✅ Tax filing submitted successfully! Your deductions have been saved.')
          setShowDeductions(false)
          
          // Reset form after successful submission
          setTimeout(() => {
            setStatusKey('')
            setSelectedFiles(null)
            setDeductions([])
            setExtractedFields(null)
            setSubmissionStatus('idle')
            setMessage('')
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
          }, 3000)
        } else {
          throw new Error('Failed to save tax filing')
        }
      } catch (dbError) {
        console.error('Database save error:', dbError)
        // Still show success message even if DB save fails
        setSubmissionStatus('success')
        setMessage('✅ Tax filing processed successfully! (Note: Database save failed, but your data was processed)')
        setShowDeductions(false)
      }

    } catch (error) {
      console.error('Submission error:', error)
      setSubmissionStatus('error')
      setMessage('❌ Failed to submit tax filing. Please try again.')
    }
  }

  const handleExport = async (deductionsToExport: DeductionItem[]) => {
    try {
      const exportData = {
        deductions: deductionsToExport,
        taxYear,
        statusKey,
        extractedFields,
        summary: {
          totalDeductions: deductionsToExport.reduce((sum, item) => sum + item.deductible, 0),
          overriddenItems: deductionsToExport.filter(item => item.isOverridden).length,
          timestamp: new Date().toISOString()
        }
      }

      const response = await fetch('/api/tax-filing/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(exportData)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tax-audit-${taxYear}-${new Date().toISOString().split('T')[0]}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setMessage('✅ Audit report exported successfully!')
    } catch (error) {
      console.error('Export error:', error)
      setMessage(`❌ Error exporting audit report: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Autopilot Tax Filing</h2>

        <div className="mb-6">
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
            Tax Status
          </label>
          <select
            id="status"
            value={statusKey}
            onChange={(e) => setStatusKey(e.target.value)}
            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">Select your status</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label htmlFor="taxYear" className="block text-sm font-medium text-gray-700 mb-2">
            Tax Year
          </label>
          <select
            id="taxYear"
            value={taxYear}
            onChange={(e) => setTaxYear(parseInt(e.target.value))}
            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map(year => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
            Upload PDF Documents (Maximum 5 files)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            id="file"
            multiple
            accept="application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {selectedFiles && (
            <div className="mt-2">
              <p className="text-sm text-gray-600 mb-2">
                Selected {selectedFiles.length} file(s):
              </p>
              <div className="space-y-1">
                {Array.from(selectedFiles).map((file, index) => (
                  <div key={index} className="text-xs text-gray-500">
                    • {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mb-6">
          <button
            onClick={handleSubmit}
            disabled={!statusKey || !selectedFiles || isLoading}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Analyze Documents'}
          </button>
        </div>

        {isLoading && processingStatus && (
          <div className="mb-6">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-600">{processingStatus}</span>
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
            </div>
          </div>
        )}

        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.includes('error') || message.includes('Error') || message.includes('❌')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : message.includes('✅')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {message}
          </div>
        )}

        {submissionStatus === 'submitting' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-blue-700">Submitting your tax filing...</span>
            </div>
          </div>
        )}

        {showClarificationQuestions && (
          <ClarificationQuestions
            questions={checkForMissingFields(extractedFields)}
            onComplete={handleClarificationComplete}
            onSkip={handleClarificationSkip}
          />
        )}

        {showDeductions && deductions.length > 0 && (
          <DeductionReview
            deductions={deductions}
            onConfirm={handleConfirm}
            onExport={handleExport}
          />
        )}
      </div>
    </div>
  )
} 