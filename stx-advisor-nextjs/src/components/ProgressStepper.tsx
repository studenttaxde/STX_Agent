'use client';

import React from 'react';

export type FilingStep = 'upload' | 'extract' | 'confirm' | 'questions' | 'calculate' | 'summary';

interface ProgressStepperProps {
  currentStep: FilingStep;
  totalQuestions?: number;
  answeredQuestions?: number;
  isComplete?: boolean;
}

const steps: { key: FilingStep; label: string; description: string }[] = [
  {
    key: 'upload',
    label: 'Upload PDF',
    description: 'Upload your tax documents'
  },
  {
    key: 'extract',
    label: 'Extract Data',
    description: 'Extracting tax information'
  },
  {
    key: 'confirm',
    label: 'Confirm Year',
    description: 'Confirm tax year and details'
  },
  {
    key: 'questions',
    label: 'Deduction Questions',
    description: 'Answer deduction questions'
  },
  {
    key: 'calculate',
    label: 'Calculate Refund',
    description: 'Calculating your refund'
  },
  {
    key: 'summary',
    label: 'Summary',
    description: 'Review your tax filing'
  }
];

export default function ProgressStepper({ 
  currentStep, 
  totalQuestions = 0, 
  answeredQuestions = 0,
  isComplete = false 
}: ProgressStepperProps) {
  const currentIndex = steps.findIndex(step => step.key === currentStep);
  
  const getStepStatus = (index: number) => {
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'current':
        return (
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full"></div>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-gray-500 text-sm font-medium">{index + 1}</span>
          </div>
        );
    }
  };

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 border-green-600';
      case 'current':
        return 'text-blue-600 border-blue-600';
      default:
        return 'text-gray-400 border-gray-300';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          const isLast = index === steps.length - 1;
          
          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center">
                <div className="flex items-center">
                  {getStepIcon(status)}
                  
                  {/* Step label */}
                  <div className="ml-3">
                    <h3 className={`text-sm font-medium ${getStepColor(status)}`}>
                      {step.label}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {step.description}
                    </p>
                    
                    {/* Progress indicator for questions step */}
                    {step.key === 'questions' && totalQuestions > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center text-xs text-gray-500">
                          <span>{answeredQuestions} of {totalQuestions} answered</span>
                        </div>
                        <div className="w-24 h-1 bg-gray-200 rounded-full mt-1">
                          <div 
                            className="h-1 bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${(answeredQuestions / totalQuestions) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Connector line */}
              {!isLast && (
                <div className={`flex-1 h-0.5 mx-4 ${
                  status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                }`}></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      {/* Completion indicator */}
      {isComplete && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">Tax filing completed!</span>
          </div>
        </div>
      )}
    </div>
  );
} 