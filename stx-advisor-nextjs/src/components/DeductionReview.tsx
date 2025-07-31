"use client"

import { useState, useEffect } from 'react'

interface DeductionItem {
  category: string
  basis: number
  cap: number | null
  deductible: number
  label?: string
  rationale?: string
}

interface DeductionReviewProps {
  deductions: DeductionItem[]
  onConfirm: (deductions: DeductionItem[]) => void
}

export default function DeductionReview({ deductions, onConfirm }: DeductionReviewProps) {
  const [editableDeductions, setEditableDeductions] = useState<DeductionItem[]>(deductions)

  useEffect(() => {
    setEditableDeductions(deductions)
  }, [deductions])

  const updateBasis = (index: number, newBasis: number) => {
    const updated = [...editableDeductions]
    updated[index] = {
      ...updated[index],
      basis: newBasis,
      deductible: updated[index].cap ? Math.min(newBasis, updated[index].cap) : newBasis
    }
    setEditableDeductions(updated)
  }

  const handleConfirm = () => {
    onConfirm(editableDeductions)
  }

  return (
    <div className="w-full">
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Review Deductions
          </h3>
          
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {editableDeductions.map((deduction, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {deduction.label || deduction.category}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <button
              onClick={handleConfirm}
              className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              All Good, File It!
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 