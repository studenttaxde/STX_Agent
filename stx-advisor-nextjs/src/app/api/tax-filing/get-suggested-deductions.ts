import { NextRequest, NextResponse } from 'next/server';
import { getSuggestedDeductions } from '@/services/supabaseService';

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

    const suggestions = await getSuggestedDeductions(userId, parseInt(year));

    return NextResponse.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    console.error('Error fetching suggested deductions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 