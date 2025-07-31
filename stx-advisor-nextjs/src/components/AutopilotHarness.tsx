"use client"

import { useState } from 'react'

interface CodeGenerationRequest {
  systemPrompt: string
  userPrompt: string
  targetFile: 'Tabs' | 'page.tsx' | 'DeductionReview'
}

interface CodeGenerationResponse {
  success: boolean
  code?: string
  error?: string
}

export default function AutopilotHarness() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<string>('')
  const [currentFile, setCurrentFile] = useState<string>('')
  const [error, setError] = useState<string>('')

  const generateCode = async (request: CodeGenerationRequest): Promise<CodeGenerationResponse> => {
    try {
      const response = await fetch('/api/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          targetFile: request.targetFile
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('Code generation error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  const handleGenerateTabs = async () => {
    setIsGenerating(true)
    setError('')
    setCurrentFile('Tabs.tsx')

    const request: CodeGenerationRequest = {
      systemPrompt: `You are a React/Next.js developer. Generate clean, functional React components using TypeScript and Tailwind CSS. 
      
Requirements:
- Use "use client" directive
- Include proper TypeScript interfaces
- Use Tailwind CSS for styling
- Follow React best practices
- Include proper error handling
- Make components reusable and maintainable`,
      userPrompt: `Create a Tabs component for switching between Advisor and Autopilot tabs in a Next.js App Router project. The component should:

1. Accept an array of tab objects with { key, label, content }
2. Support a defaultTab prop
3. Use Tailwind CSS for styling
4. Show active tab with blue border and text
5. Render the content of the active tab
6. Be fully responsive

The component should be clean, accessible, and follow React best practices.`,
      targetFile: 'Tabs'
    }

    const result = await generateCode(request)
    
    if (result.success && result.code) {
      setGeneratedCode(result.code)
    } else {
      setError(result.error || 'Failed to generate code')
    }
    
    setIsGenerating(false)
  }

  const handleGenerateDeductionReview = async () => {
    setIsGenerating(true)
    setError('')
    setCurrentFile('DeductionReview.tsx')

    const request: CodeGenerationRequest = {
      systemPrompt: `You are a React/Next.js developer. Generate clean, functional React components using TypeScript and Tailwind CSS. 
      
Requirements:
- Use "use client" directive
- Include proper TypeScript interfaces
- Use Tailwind CSS for styling
- Follow React best practices
- Include proper error handling
- Make components reusable and maintainable`,
      userPrompt: `Create a DeductionReview component for an editable table that:

1. Accepts an array of deduction items with { category, basis, cap, deductible, label?, rationale? }
2. Renders an editable table with columns: Category, Basis (€), Cap (€), Deductible (€)
3. Allows editing the "Basis" field as a number input
4. Shows "Cap" as read-only (display "—" if null)
5. Auto-calculates "Deductible" as min(basis, cap)
6. Has a "All Good, File It!" button that calls an onConfirm callback
7. Uses German currency formatting (€ with thousands separators)
8. Uses Tailwind CSS for styling with a clean, professional look

The component should be fully functional and handle all edge cases.`,
      targetFile: 'DeductionReview'
    }

    const result = await generateCode(request)
    
    if (result.success && result.code) {
      setGeneratedCode(result.code)
    } else {
      setError(result.error || 'Failed to generate code')
    }
    
    setIsGenerating(false)
  }

  const handleGenerateAutopilotPage = async () => {
    setIsGenerating(true)
    setError('')
    setCurrentFile('autopilot/page.tsx')

    const request: CodeGenerationRequest = {
      systemPrompt: `You are a React/Next.js developer. Generate clean, functional React components using TypeScript and Tailwind CSS. 
      
Requirements:
- Use "use client" directive
- Include proper TypeScript interfaces
- Use Tailwind CSS for styling
- Follow React best practices
- Include proper error handling
- Make components reusable and maintainable`,
      userPrompt: `Create an AutopilotFlow component that implements:

1. Status dropdown with options: bachelor, master, graduated_same_year, full_time
2. Single PDF file upload (accept only application/pdf)
3. POST to /api/advisor/autodetect as FormData with file and statusKey
4. Handle response: if { message: string } display in green, if array of deductions show DeductionReview table
5. Loading states and error handling
6. Clean UI with Tailwind CSS
7. Proper form validation
8. File type validation for PDFs only

The component should be complete and ready to use.`,
      targetFile: 'page.tsx'
    }

    const result = await generateCode(request)
    
    if (result.success && result.code) {
      setGeneratedCode(result.code)
    } else {
      setError(result.error || 'Failed to generate code')
    }
    
    setIsGenerating(false)
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode)
      alert('Code copied to clipboard!')
    } catch (error) {
      console.error('Failed to copy code:', error)
      alert('Failed to copy code to clipboard')
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Autopilot Code Generator</h2>
        
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Generate Components</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={handleGenerateTabs}
              disabled={isGenerating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating && currentFile === 'Tabs.tsx' ? 'Generating...' : 'Generate Tabs'}
            </button>
            
            <button
              onClick={handleGenerateDeductionReview}
              disabled={isGenerating}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating && currentFile === 'DeductionReview.tsx' ? 'Generating...' : 'Generate DeductionReview'}
            </button>
            
            <button
              onClick={handleGenerateAutopilotPage}
              disabled={isGenerating}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating && currentFile === 'autopilot/page.tsx' ? 'Generating...' : 'Generate Autopilot Page'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <h4 className="text-red-800 font-semibold mb-2">Error</h4>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {generatedCode && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Generated Code: {currentFile}
              </h3>
              <button
                onClick={copyToClipboard}
                className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
              >
                Copy Code
              </button>
            </div>
            
            <div className="bg-gray-900 text-green-400 p-4 rounded-md overflow-x-auto">
              <pre className="text-sm whitespace-pre-wrap">{generatedCode}</pre>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="flex items-center justify-center p-8">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">Generating {currentFile}...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 