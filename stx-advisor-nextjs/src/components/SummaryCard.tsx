'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDownIcon, ChevronUpIcon, CalculatorIcon } from '@heroicons/react/24/outline';

interface SummaryCardProps {
  summaryText: string;
  year?: string;
  explanationAvailable?: boolean;
  onExplainClick?: () => void;
  className?: string;
}

export default function SummaryCard({ 
  summaryText, 
  year, 
  explanationAvailable = false, 
  onExplainClick,
  className = ''
}: SummaryCardProps) {
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  const [explanationText, setExplanationText] = useState<string>('');

  const handleExplainClick = async () => {
    if (onExplainClick) {
      onExplainClick();
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CalculatorIcon className="h-6 w-6 text-white" />
            <div>
              <h2 className="text-xl font-semibold text-white">
                Tax Filing Summary
              </h2>
              {year && (
                <p className="text-blue-100 text-sm">
                  Tax Year: {year}
                </p>
              )}
            </div>
          </div>
          {explanationAvailable && (
            <button
              onClick={handleExplainClick}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-white rounded-md hover:bg-blue-50 transition-colors"
            >
              <CalculatorIcon className="h-4 w-4 mr-1.5" />
              Explain Calculation
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-gray-900 mb-4">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-gray-800 mb-3 mt-6">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-medium text-gray-700 mb-2 mt-4">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-gray-600 mb-3 leading-relaxed">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1">{children}</ul>
              ),
              li: ({ children }) => (
                <li className="text-gray-600">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-gray-900">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic text-gray-700">{children}</em>
              ),
              hr: () => (
                <hr className="my-6 border-gray-200" />
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-700 bg-blue-50 py-2 rounded-r">
                  {children}
                </blockquote>
              ),
            }}
          >
            {summaryText}
          </ReactMarkdown>
        </div>

        {/* Explanation Section */}
        {explanationText && (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <button
              onClick={() => setIsExplanationOpen(!isExplanationOpen)}
              className="flex items-center justify-between w-full text-left p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <CalculatorIcon className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-gray-900">Calculation Breakdown</span>
              </div>
              {isExplanationOpen ? (
                <ChevronUpIcon className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-gray-500" />
              )}
            </button>
            
            {isExplanationOpen && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold text-gray-900 mb-3">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-lg font-semibold text-gray-800 mb-2 mt-4">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-base font-medium text-gray-700 mb-2 mt-3">{children}</h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-gray-600 mb-2 leading-relaxed">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside text-gray-600 mb-3 space-y-1">{children}</ul>
                      ),
                      li: ({ children }) => (
                        <li className="text-gray-600">{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-gray-900">{children}</strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic text-gray-700">{children}</em>
                      ),
                      hr: () => (
                        <hr className="my-4 border-gray-200" />
                      ),
                    }}
                  >
                    {explanationText}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 