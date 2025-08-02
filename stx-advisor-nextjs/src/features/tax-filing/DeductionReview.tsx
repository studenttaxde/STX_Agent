"use client"

import { useState, useEffect } from 'react'

interface DeductionItem {
  category: string
  basis: number
  cap: number | null
  deductible: number
  label?: string
  rationale?: string
  overrideReason?: string
  isOverridden?: boolean
}

interface DeductionReviewProps {
  deductions: DeductionItem[]
  onConfirm: (deductions: DeductionItem[]) => void
  onExport?: (deductions: DeductionItem[]) => void
}

export default function DeductionReview({ deductions, onConfirm, onExport }: DeductionReviewProps) {
  const [editableDeductions, setEditableDeductions] = useState<DeductionItem[]>(deductions)
  const [showOverrideModal, setShowOverrideModal] = useState<number | null>(null)
  const [overrideReason, setOverrideReason] = useState<string>('')
  const [showExportOptions, setShowExportOptions] = useState(false)

  useEffect(() => {
    setEditableDeductions(deductions)
  }, [deductions])

  const updateBasis = (index: number, newBasis: number) => {
    const updated = [...editableDeductions]
    updated[index] = {
      ...updated[index],
      basis: newBasis,
      deductible: updated[index].cap ? Math.min(newBasis, updated[index].cap) : newBasis,
      isOverridden: newBasis !== deductions[index].basis
    }
    setEditableDeductions(updated)
  }

  const handleOverride = (index: number) => {
    setShowOverrideModal(index)
    setOverrideReason('')
  }

  const confirmOverride = () => {
    if (showOverrideModal !== null && overrideReason.trim()) {
      const updated = [...editableDeductions]
      updated[showOverrideModal] = {
        ...updated[showOverrideModal],
        overrideReason: overrideReason.trim()
      }
      setEditableDeductions(updated)
      setShowOverrideModal(null)
      setOverrideReason('')
    }
  }

  const handleConfirm = () => {
    onConfirm(editableDeductions)
  }

  const handleExport = () => {
    if (onExport) {
      onExport(editableDeductions)
    } else {
      // Default export behavior
      const exportData = {
        deductions: editableDeductions,
        summary: {
          totalDeductions: editableDeductions.reduce((sum, item) => sum + item.deductible, 0),
          overriddenItems: editableDeductions.filter(item => item.isOverridden).length,
          timestamp: new Date().toISOString()
        }
      }
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tax-deductions-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="w-full">
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Review Deductions
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowExportOptions(!showExportOptions)}
                className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Export
              </button>
            </div>
          </div>

          {showExportOptions && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-700 mb-2">Export your deductions for record keeping:</p>
              <div className="flex space-x-2">
                <button
                  onClick={handleExport}
                  className="inline-flex items-center px-3 py-1 border border-blue-300 shadow-sm text-sm leading-4 font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Download JSON
                </button>
                <button
                  onClick={() => {/* TODO: Implement PDF export */}}
                  className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Generate PDF (Coming Soon)
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Basis (€)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cap (€)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deductible (€)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {editableDeductions.map((deduction, index) => (
                  <tr key={index} className={deduction.isOverridden ? 'bg-yellow-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div>
                        {deduction.label || deduction.category}
                        {deduction.isOverridden && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Overridden
                          </span>
                        )}
                      </div>
                      {deduction.rationale && (
                        <div className="text-xs text-gray-500 mt-1">
                          {deduction.rationale}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="number"
                        value={deduction.basis}
                        onChange={(e) => updateBasis(index, parseFloat(e.target.value) || 0)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {deduction.cap ? `€${deduction.cap.toLocaleString('de-DE')}` : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      €{deduction.deductible.toLocaleString('de-DE')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {deduction.isOverridden && (
                        <button
                          onClick={() => handleOverride(index)}
                          className="text-blue-600 hover:text-blue-900 text-xs"
                        >
                          {deduction.overrideReason ? 'Edit Reason' : 'Add Reason'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Total Deductions: €{editableDeductions.reduce((sum, item) => sum + item.deductible, 0).toLocaleString('de-DE')}
              {editableDeductions.filter(item => item.isOverridden).length > 0 && (
                <span className="ml-2 text-yellow-600">
                  ({editableDeductions.filter(item => item.isOverridden).length} overridden)
                </span>
              )}
            </div>
            <button
              onClick={handleConfirm}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              All Good, File It!
            </button>
          </div>
        </div>
      </div>

      {/* Override Reason Modal */}
      {showOverrideModal !== null && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Add Override Reason
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Please provide a reason for overriding the deduction value for "{editableDeductions[showOverrideModal]?.label || editableDeductions[showOverrideModal]?.category}".
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g., Additional documentation provided, special circumstances..."
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                rows={3}
              />
              <div className="flex space-x-3 mt-4">
                <button
                  onClick={confirmOverride}
                  disabled={!overrideReason.trim()}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Reason
                </button>
                <button
                  onClick={() => setShowOverrideModal(null)}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 