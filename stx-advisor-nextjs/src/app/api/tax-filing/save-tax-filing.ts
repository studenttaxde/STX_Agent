import { NextRequest, NextResponse } from 'next/server';
import { saveTaxFiling } from '@/services/supabaseService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.user_id || !body.year) {
      return NextResponse.json(
        { error: 'user_id and year are required' },
        { status: 400 }
      );
    }

    const savedFiling = await saveTaxFiling({
      user_id: body.user_id,
      year: body.year,
      gross_income: body.gross_income || 0,
      income_tax_paid: body.income_tax_paid || 0,
      employer: body.employer || 'Unknown',
      full_name: body.full_name || 'User',
      deductions: body.deductions || {}
    });

    if (!savedFiling) {
      return NextResponse.json(
        { error: 'Failed to save tax filing' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: savedFiling
    });
  } catch (error) {
    console.error('Error saving tax filing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 