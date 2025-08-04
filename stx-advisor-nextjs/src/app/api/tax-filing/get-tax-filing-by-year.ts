import { NextRequest, NextResponse } from 'next/server';
import { getTaxFilingByYear } from '@/services/supabaseService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const year = searchParams.get('year');
    
    if (!userId || !year) {
      return NextResponse.json(
        { error: 'userId and year are required' },
        { status: 400 }
      );
    }

    const filing = await getTaxFilingByYear(userId, parseInt(year));

    return NextResponse.json({
      success: true,
      data: filing
    });
  } catch (error) {
    console.error('Error fetching tax filing by year:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 