'use client';

import React, { useState } from 'react';
import { TaxFilingResult } from '@/lib/supabaseService';

interface SummaryOutputProps {
  result: TaxFilingResult;
  onExport?: (format: 'json' | 'pdf') => void;
  onFileNextYear?: () => void;
}

export default function SummaryOutput({ result, onExport, onFileNextYear }: SummaryOutputProps) {
  const [showJson, setShowJson] = useState(false);

  const getRefundBadgeColor = (type: string) => {
    switch (type) {
      case 'full':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'partial':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'none':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRefundBadgeText = (type: string) => {
    switch (type) {
      case 'full':
        return 'Full Refund';
      case 'partial':
        return 'Partial Refund';
      case 'none':
        return 'No Refund';
      default:
        return 'Unknown';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const calculateTaxRate = () => {
    if (result.taxable_income === 0) return 0;
    return (result.tax_paid / result.taxable_income) * 100;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Tax Filing Summary
          </h2>
          <p className="text-gray-600">
            Tax Year {result.tax_year} • Filed on {result.filing_date}
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getRefundBadgeColor(result.refund_type)}`}>
            {getRefundBadgeText(result.refund_type)}
          </span>
        </div>
      </div>

      {/* Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-blue-600 mb-1">Gross Income</h3>
          <p className="text-2xl font-bold text-blue-900">
            {formatCurrency(result.gross_income)}
          </p>
        </div>
        
        <div className="bg-red-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-red-600 mb-1">Tax Paid</h3>
          <p className="text-2xl font-bold text-red-900">
            {formatCurrency(result.tax_paid)}
          </p>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-green-600 mb-1">Total Deductions</h3>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(result.total_deductions)}
          </p>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-purple-600 mb-1">Estimated Refund</h3>
          <p className="text-2xl font-bold text-purple-900">
            {formatCurrency(result.estimated_refund)}
          </p>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed Breakdown</h3>
        
        <div className="space-y-4">
          {/* Income Section */}
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-gray-700">Gross Income</span>
            <span className="font-medium">{formatCurrency(result.gross_income)}</span>
          </div>
          
          {/* Deductions Section */}
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-gray-700">Total Deductions</span>
            <span className="font-medium text-green-600">-{formatCurrency(result.total_deductions)}</span>
          </div>
          
          {/* Loss Carryforward Section */}
          {result.loss_carryforward_used > 0 && (
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <span className="text-gray-700">Loss Carryforward Applied</span>
              <span className="font-medium text-green-600">-{formatCurrency(result.loss_carryforward_used)}</span>
            </div>
          )}
          
          {/* Taxable Income */}
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-gray-700 font-medium">Taxable Income</span>
            <span className="font-bold">{formatCurrency(result.taxable_income)}</span>
          </div>
          
          {/* Tax Rate */}
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-gray-700">Effective Tax Rate</span>
            <span className="font-medium">{calculateTaxRate().toFixed(1)}%</span>
          </div>
          
          {/* Tax Due */}
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-gray-700">Calculated Tax Due</span>
            <span className="font-medium">{formatCurrency(result.tax_paid - result.estimated_refund)}</span>
          </div>
          
          {/* Refund */}
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-700 font-medium">Refund</span>
            <span className="font-bold text-green-600">{formatCurrency(result.estimated_refund)}</span>
          </div>
        </div>
      </div>

      {/* Refund Explanation */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Refund Explanation</h3>
        <p className="text-blue-800">{result.refund_reason}</p>
      </div>

      {/* Loss Carryforward Info */}
      {result.loss_carryforward_remaining > 0 && (
        <div className="bg-yellow-50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">Loss Carryforward</h3>
          <p className="text-yellow-800">
            You have €{formatCurrency(result.loss_carryforward_remaining)} remaining loss carryforward 
            that can be applied to future tax years.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setShowJson(!showJson)}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          {showJson ? 'Hide' : 'Show'} JSON Data
        </button>
        
        {onExport && (
          <>
            <button
              onClick={() => onExport('json')}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Export JSON
            </button>
            <button
              onClick={() => onExport('pdf')}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Export PDF
            </button>
          </>
        )}
      </div>

      {/* JSON Viewer */}
      {showJson && (
        <div className="bg-gray-900 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">JSON Data</h3>
          <pre className="text-green-400 text-sm overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* Next Year Filing */}
      {onFileNextYear && (
        <div className="border-t pt-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              File Another Year?
            </h3>
            <p className="text-gray-600 mb-4">
              Ready to file your taxes for another year? Upload the new PDF and we'll help you again.
            </p>
            <button
              onClick={onFileNextYear}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
            >
              File Next Year
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 mt-6">
        <p>
          This summary was generated by Pfleged AI Tax Advisor on {new Date().toLocaleDateString()}.
        </p>
        <p className="mt-1">
          Please review all information and consult with a tax professional if needed.
        </p>
      </div>
    </div>
  );
} 