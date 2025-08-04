import { NextRequest, NextResponse } from 'next/server';
import { getTaxFilings } from '@/services/supabaseService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const filings = await getTaxFilings(userId);

    return NextResponse.json({
      success: true,
      data: filings
    });
  } catch (error) {
    console.error('Error fetching tax filings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 