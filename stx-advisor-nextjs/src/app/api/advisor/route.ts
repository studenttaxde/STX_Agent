import { NextRequest, NextResponse } from 'next/server';
import { TaxAdvisor } from '@/lib/taxAdvisor';
import { ExtractedData } from '@/types';

// Store advisor instances per session (in production, use Redis or database)
const advisorSessions = new Map<string, TaxAdvisor>();

function getOrCreateAdvisor(sessionId: string): TaxAdvisor {
  if (!advisorSessions.has(sessionId)) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    console.log('Creating new TaxAdvisor instance for session:', sessionId);
    advisorSessions.set(sessionId, new TaxAdvisor(apiKey));
  }
  return advisorSessions.get(sessionId)!;
}

export async function POST(request: NextRequest) {
  try {
    console.log('Advisor API called');
    const body = await request.json();
    const { action, sessionId, extractedData, message, existingData, suggestedDeductions } = body;

    console.log('Request body:', { action, sessionId, hasExtractedData: !!extractedData, hasMessage: !!message });

    if (!sessionId) {
      console.error('Missing sessionId in request');
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const advisor = getOrCreateAdvisor(sessionId);

    switch (action) {
      case 'initialize':
        console.log('Initializing advisor with extracted data:', extractedData);
        if (extractedData) {
          advisor.setExtractedData(extractedData as ExtractedData);
        }
        
        // If there's existing data, inform the advisor
        if (existingData) {
          console.log('Adding existing data to advisor:', existingData);
          advisor.addUserMessage(`I have existing data for ${existingData.year}: Income: €${existingData.gross_income}, Tax Paid: €${existingData.income_tax_paid}, Employer: ${existingData.employer}`);
        }
        
        // If there are suggested deductions, inform the advisor
        if (suggestedDeductions && suggestedDeductions.length > 0) {
          console.log('Adding suggested deductions to advisor:', suggestedDeductions);
          const deductionSuggestions = suggestedDeductions.map((d: any) => `${d.category}: €${d.amount}`).join(', ');
          advisor.addUserMessage(`Based on previous years, you commonly claimed: ${deductionSuggestions}`);
        }
        
        console.log('Getting initial advisor message');
        const initialMessage = await advisor.nextAdvisorMessage();
        console.log('Initial message received:', initialMessage);
        
        return NextResponse.json({
          success: true,
          message: initialMessage,
          done: false,
          deduction_flow: null,
          current_question_index: 0
        });

      case 'respond':
        console.log('Processing user response:', message);
        if (message) {
          advisor.addUserMessage(message);
        }

        console.log('Getting next advisor message');
        const nextMessage = await advisor.nextAdvisorMessage();
        console.log('Next message received:', nextMessage);
        
        // Check if conversation is done based on keywords and deduction flow completion
        const doneKeywords = [
          'all done', 'summary', 'refund', 'no further questions', 
          'eligible for a full refund', 'Thank you for using'
        ];
        
        // Check if this is a "file for another year" question
        const isAnotherYearQuestion = nextMessage.toLowerCase().includes('file a tax return for another year');
        
        // Check if this is a reset message for new year
        const isResetForNewYear = nextMessage.toLowerCase().includes('ready for another year') && 
                                 nextMessage.toLowerCase().includes('upload the pdf');
        
        // Only mark as done if it's not asking about another year and not a reset message
        const isDone = !isAnotherYearQuestion && !isResetForNewYear && doneKeywords.some(keyword => 
          nextMessage.toLowerCase().includes(keyword.toLowerCase())
        );

        console.log('Conversation done check:', { isDone, isAnotherYearQuestion, isResetForNewYear });

        // Get deduction flow information
        const deductionAnswers = advisor.getDeductionAnswers();
        const taxCalculation = advisor.getTaxCalculation();
        const userData = advisor.getUserData();

        console.log('Deduction flow info:', { deductionAnswers, taxCalculation, userData });

        return NextResponse.json({
          success: true,
          message: nextMessage,
          done: isDone,
          deduction_answers: deductionAnswers,
          tax_calculation: taxCalculation,
          deduction_flow: userData.status ? {
            status: userData.status,
            current_question_index: deductionAnswers.length,
            total_questions: deductionAnswers.length + (isDone ? 0 : 1)
          } : null,
          current_question_index: deductionAnswers.length,
          total_questions: deductionAnswers.length + (isDone ? 0 : 1)
        });

      case 'reset':
        console.log('Resetting advisor session');
        advisor.reset();
        return NextResponse.json({
          success: true,
          message: 'Session reset successfully'
        });

      case 'get_state':
        console.log('Getting advisor state');
        const deductionAnswersState = advisor.getDeductionAnswers();
        const taxCalculationState = advisor.getTaxCalculation();
        const userDataState = advisor.getUserData();
        
        return NextResponse.json({
          success: true,
          deduction_answers: deductionAnswersState,
          tax_calculation: taxCalculationState,
          deduction_flow: userDataState.status ? {
            status: userDataState.status,
            current_question_index: deductionAnswersState.length,
            total_questions: deductionAnswersState.length
          } : null,
          current_question_index: deductionAnswersState.length,
          total_questions: deductionAnswersState.length
        });

      default:
        console.error('Invalid action:', action);
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Advisor API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: `Advisor failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    advisorSessions.delete(sessionId);
    
    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully'
    });

  } catch (error) {
    console.error('Session deletion error:', error);
    return NextResponse.json(
      { error: `Session deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
