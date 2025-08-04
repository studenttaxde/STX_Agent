import { NextRequest, NextResponse } from 'next/server';
import { hasExistingData } from '@/services/supabaseService';

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

    const hasData = await hasExistingData(userId, parseInt(year));

    return NextResponse.json({
      success: true,
      hasData
    });
  } catch (error) {
    console.error('Error checking existing data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 