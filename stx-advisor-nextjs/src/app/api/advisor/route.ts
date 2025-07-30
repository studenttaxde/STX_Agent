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
    advisorSessions.set(sessionId, new TaxAdvisor(apiKey));
  }
  return advisorSessions.get(sessionId)!;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, extractedData, userMessage, answers } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const advisor = getOrCreateAdvisor(sessionId);

    switch (action) {
      case 'initialize':
        if (extractedData) {
          advisor.setExtractedData(extractedData as ExtractedData);
        }
        const initialMessage = await advisor.nextAdvisorMessage();
        return NextResponse.json({
          success: true,
          advisor_message: initialMessage,
          done: false,
          deduction_flow: null,
          current_question_index: 0
        });

      case 'respond':
        if (userMessage) {
          advisor.addUserMessage(userMessage);
        }
        
        // Process answers if provided
        if (answers) {
          Object.entries(answers).forEach(([, answer]) => {
            advisor.addUserMessage(answer as string);
          });
        }

        const nextMessage = await advisor.nextAdvisorMessage();
        
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

        // Get deduction flow information
        const deductionAnswers = advisor.getDeductionAnswers();
        const taxCalculation = advisor.getTaxCalculation();
        const userData = advisor.getUserData();

        return NextResponse.json({
          success: true,
          advisor_message: nextMessage,
          done: isDone,
          conversation_history: advisor.getConversationHistory(),
          user_data: userData,
          filed_years: Array.from(advisor.getFiledYears()),
          deduction_answers: deductionAnswers,
          tax_calculation: taxCalculation,
          deduction_flow: userData.status ? {
            status: userData.status,
            current_question_index: deductionAnswers.length,
            total_questions: deductionAnswers.length + (isDone ? 0 : 1)
          } : null
        });

      case 'reset':
        advisor.reset();
        return NextResponse.json({
          success: true,
          message: 'Session reset successfully'
        });

      case 'get_state':
        const deductionAnswersState = advisor.getDeductionAnswers();
        const taxCalculationState = advisor.getTaxCalculation();
        const userDataState = advisor.getUserData();
        
        return NextResponse.json({
          success: true,
          conversation_history: advisor.getConversationHistory(),
          user_data: userDataState,
          filed_years: Array.from(advisor.getFiledYears()),
          deduction_answers: deductionAnswersState,
          tax_calculation: taxCalculationState,
          deduction_flow: userDataState.status ? {
            status: userDataState.status,
            current_question_index: deductionAnswersState.length,
            total_questions: deductionAnswersState.length
          } : null
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Advisor API error:', error);
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
