'use client'

import { useState } from 'react'

export type EmploymentStatus = 'bachelor' | 'master' | 'gradjob' | 'fulltime'

interface EmploymentStatusSelectorProps {
  onStatusSelect: (status: EmploymentStatus) => void
  selectedStatus?: EmploymentStatus | null
  disabled?: boolean
}

const employmentOptions = [
  {
    id: 'bachelor' as EmploymentStatus,
    label: 'Bachelor Student',
    description: 'Currently pursuing bachelor\'s degree',
    icon: '🎓',
    color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800'
  },
  {
    id: 'master' as EmploymentStatus,
    label: 'Master Student', 
    description: 'Currently pursuing master\'s degree',
    icon: '🎓',
    color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-800'
  },
  {
    id: 'gradjob' as EmploymentStatus,
    label: 'Employed After Graduation',
    description: 'Started job in same year as graduation',
    icon: '💼',
    color: 'bg-green-50 hover:bg-green-100 border-green-200 text-green-800'
  },
  {
    id: 'fulltime' as EmploymentStatus,
    label: 'Full-Time Employee',
    description: 'Working full-time (not a student)',
    icon: '🏢',
    color: 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-800'
  }
]

export default function EmploymentStatusSelector({ 
  onStatusSelect, 
  selectedStatus, 
  disabled = false 
}: EmploymentStatusSelectorProps) {
  const [hoveredStatus, setHoveredStatus] = useState<EmploymentStatus | null>(null)

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Please select your employment status for this tax year
        </h3>
        <p className="text-sm text-gray-600">
          This helps us determine which deductions you may be eligible for
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employmentOptions.map((option) => {
          const isSelected = selectedStatus === option.id
          const isHovered = hoveredStatus === option.id
          
          return (
            <button
              key={option.id}
              onClick={() => !disabled && onStatusSelect(option.id)}
              onMouseEnter={() => setHoveredStatus(option.id)}
              onMouseLeave={() => setHoveredStatus(null)}
              disabled={disabled}
              className={`
                relative p-4 rounded-lg border-2 transition-all duration-200
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50 shadow-md scale-105' 
                  : option.color
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${!disabled && !isSelected ? 'hover:scale-105 hover:shadow-md' : ''}
              `}
            >
              <div className="flex items-start space-x-3">
                <div className="text-2xl">{option.icon}</div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-sm mb-1">
                    {option.label}
                  </div>
                  <div className="text-xs opacity-75">
                    {option.description}
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {selectedStatus && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="text-blue-600">✅</div>
            <span className="text-sm font-medium text-blue-800">
              Selected: {employmentOptions.find(opt => opt.id === selectedStatus)?.label}
            </span>
          </div>
        </div>
      )}
    </div>
  )
} 