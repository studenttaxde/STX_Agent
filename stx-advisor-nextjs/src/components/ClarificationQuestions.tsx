"use client"

import { useState } from 'react'

interface ClarificationQuestion {
  id: string
  question: string
  type: 'text' | 'number' | 'select'
  options?: string[]
  required: boolean
  category: string
  helpText?: string
}

interface ClarificationQuestionsProps {
  questions: ClarificationQuestion[]
  onComplete: (answers: Record<string, any>) => void
  onSkip: () => void
}

export default function ClarificationQuestions({ questions, onComplete, onSkip }: ClarificationQuestionsProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [showHelp, setShowHelp] = useState<Record<string, boolean>>({})

  const currentQuestion = questions[currentQuestionIndex]

  const handleAnswer = (value: any) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: value
    }))
  }

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else {
      onComplete(answers)
    }
  }

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    }
  }

  const handleSkip = () => {
    onSkip()
  }

  const isCurrentQuestionValid = () => {
    const answer = answers[currentQuestion.id]
    if (currentQuestion.required) {
      return answer !== undefined && answer !== null && answer !== ''
    }
    return true
  }

  const renderInput = () => {
    const value = answers[currentQuestion.id] || ''

    switch (currentQuestion.type) {
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleAnswer(e.target.value)}
            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">Select an option</option>
            {currentQuestion.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleAnswer(parseFloat(e.target.value) || 0)}
            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            min="0"
            step="0.01"
            placeholder="Enter amount"
          />
        )

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleAnswer(e.target.value)}
            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Enter your answer"
          />
        )
    }
  }

  if (questions.length === 0) {
    return null
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Additional Information Needed
          </h3>
          <span className="text-sm text-gray-500">
            {currentQuestionIndex + 1} of {questions.length}
          </span>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {currentQuestion.question}
            {currentQuestion.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          
          {renderInput()}

          {currentQuestion.helpText && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowHelp(prev => ({ ...prev, [currentQuestion.id]: !prev[currentQuestion.id] }))}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                {showHelp[currentQuestion.id] ? 'Hide help' : 'Show help'}
              </button>
              {showHelp[currentQuestion.id] && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-700">{currentQuestion.helpText}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <div className="flex space-x-2">
            {currentQuestionIndex > 0 && (
              <button
                onClick={handlePrevious}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Previous
              </button>
            )}
            <button
              onClick={handleSkip}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Skip All
            </button>
          </div>

          <button
            onClick={handleNext}
            disabled={!isCurrentQuestionValid()}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentQuestionIndex === questions.length - 1 ? 'Complete' : 'Next'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
        ></div>
      </div>
    </div>
  )
} 