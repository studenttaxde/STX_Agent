'use client';

import React from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface YearSelectorProps {
  selectedYear: string;
  availableYears: string[];
  onYearChange: (year: string) => void;
  className?: string;
}

export default function YearSelector({ 
  selectedYear, 
  availableYears, 
  onYearChange,
  className = ''
}: YearSelectorProps) {
  const currentYear = new Date().getFullYear();
  const defaultYears = [
    currentYear.toString(),
    (currentYear - 1).toString(),
    (currentYear - 2).toString(),
    (currentYear - 3).toString()
  ];

  const allYears = [...new Set([...availableYears, ...defaultYears])].sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <label htmlFor="year-selector" className="text-sm font-medium text-gray-700">
        Tax Year:
      </label>
      <div className="relative">
        <select
          id="year-selector"
          value={selectedYear}
          onChange={(e) => onYearChange(e.target.value)}
          className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors"
        >
          {allYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
      </div>
      
      {availableYears.includes(selectedYear) && (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Has Data
        </span>
      )}
    </div>
  );
} 