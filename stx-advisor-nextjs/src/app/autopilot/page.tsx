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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [deductions, setDeductions] = useState<DeductionItem[]>([])
  const [showDeductions, setShowDeductions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const statusOptions = [
    { value: 'bachelor', label: 'Bachelor Student' },
    { value: 'master', label: 'Master Student' },
    { value: 'graduated_same_year', label: 'Graduated Same Year' },
    { value: 'full_time', label: 'Full-time Employee' }
  ]

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
      setMessage('')
    } else if (file) {
      setMessage('Please select a PDF file')
      setSelectedFile(null)
    }
  }

  const handleSubmit = async () => {
    if (!statusKey || !selectedFile) {
      setMessage('Please select both a status and a PDF file')
      return
    }

    setIsLoading(true)
    setMessage('')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('statusKey', statusKey)

      const response = await fetch('/api/advisor/autodetect', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (response.ok) {
        if (data.message) {
          setMessage(data.message)
          setShowDeductions(false)
        } else if (Array.isArray(data)) {
          setDeductions(data)
          setShowDeductions(true)
          setMessage('')
        }
      } else {
        setMessage(data.error || 'An error occurred')
        setShowDeductions(false)
      }
    } catch (error) {
      setMessage('Network error occurred')
      setShowDeductions(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirm = (finalDeductions: DeductionItem[]) => {
    console.log('Final deductions:', finalDeductions)
    // Handle the confirmed deductions here
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
            Upload PDF Document
          </label>
          <input
            ref={fileInputRef}
            type="file"
            id="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {selectedFile && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {selectedFile.name}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <div className="mb-6">
          <button
            onClick={handleSubmit}
            disabled={!statusKey || !selectedFile || isLoading}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Analyze Document'}
          </button>
        </div>

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