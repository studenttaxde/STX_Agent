"use client"

import { useState, useRef } from 'react'
import DeductionReview from '@/components/DeductionReview'

interface DeductionItem {
  category: string
  basis: number
  cap: number | null
  deductible: number
  label?: string
  rationale?: string
}

export default function AutopilotFlow() {
  const [statusKey, setStatusKey] = useState<string>('')
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [deductions, setDeductions] = useState<DeductionItem[]>([])
  const [showDeductions, setShowDeductions] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const statusOptions = [
    { value: 'bachelor', label: 'Bachelor Student' },
    { value: 'master', label: 'Master Student' },
    { value: 'graduated_same_year', label: 'Graduated Same Year' },
    { value: 'full_time', label: 'Full-time Employee' }
  ]

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
        formData.append('files', file)
      })
      formData.append('statusKey', statusKey)

      setProcessingStatus('Uploading files to server...')

      // Add retry logic for production timeouts
      let response: Response | undefined
      let retryCount = 0
      const maxRetries = 2

      while (retryCount <= maxRetries) {
        try {
          setProcessingStatus(`Processing ${selectedFiles.length} documents... (attempt ${retryCount + 1}/${maxRetries + 1})`)
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

      setProcessingStatus('Sending to autopilot API...')

      // Now send the aggregated data to the autopilot API
      const autopilotFormData = new FormData()
      // Create a single file from the aggregated data or use the first successful result
      if (successfulResults.length > 0) {
        // For now, we'll use the first file as representative
        // In a real implementation, you might want to aggregate the data differently
        const firstResult = successfulResults[0]
        autopilotFormData.append('statusKey', statusKey)
        // Add aggregated data as JSON
        autopilotFormData.append('aggregatedData', JSON.stringify({
          totalFiles: successfulResults.length,
          results: successfulResults.map((result: any) => result.data)
        }))
      }

      const autopilotResponse = await fetch('/api/advisor/autodetect', {
        method: 'POST',
        body: autopilotFormData
      })

      const autopilotData = await autopilotResponse.json()

      if (autopilotResponse.ok) {
        if (autopilotData.message) {
          setMessage(autopilotData.message)
          setShowDeductions(false)
        } else if (Array.isArray(autopilotData)) {
          setDeductions(autopilotData)
          setShowDeductions(true)
          setMessage('')
        }
      } else {
        setMessage(autopilotData.error || 'An error occurred during autopilot processing')
        setShowDeductions(false)
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

  const handleConfirm = (finalDeductions: DeductionItem[]) => {
    console.log('Final deductions:', finalDeductions)
    setMessage('Deductions confirmed and filed!')
    setShowDeductions(false)
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Autopilot Tax Filing</h2>

        {/* Status Selection */}
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

        {/* File Upload */}
        <div className="mb-6">
          <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
            Upload PDF Documents (Multiple files supported)
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

        {/* Submit Button */}
        <div className="mb-6">
          <button
            onClick={handleSubmit}
            disabled={!statusKey || !selectedFiles || isLoading}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Analyze Documents'}
          </button>
        </div>

        {/* Processing Status */}
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

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.includes('error') || message.includes('Error') 
              ? 'bg-red-50 text-red-700 border border-red-200' 
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {message}
          </div>
        )}

        {/* Deductions Review */}
        {showDeductions && deductions.length > 0 && (
          <DeductionReview 
            deductions={deductions} 
            onConfirm={handleConfirm} 
          />
        )}
      </div>
    </div>
  )
} 