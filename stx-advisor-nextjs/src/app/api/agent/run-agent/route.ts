import { NextRequest, NextResponse } from 'next/server';
import { PflegedAgent } from '@/agent/taxAdvisorAgent';
import { SupabaseService } from '@/services/supabaseService';

export const maxDuration = 30; // 30 seconds for agent processing

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      input,
      conversationId,
      extractedData,
      deductionAnswers
    } = body;

    if (!userId || !input) {
      return NextResponse.json({
        error: 'Missing required fields: userId and input'
      }, { status: 400 });
    }

    console.log('Starting Pfleged agent execution:', {
      userId,
      conversationId,
      inputLength: input.length,
      hasExtractedData: !!extractedData,
      hasDeductionAnswers: !!deductionAnswers
    });

    // Initialize agent
    const agent = new PflegedAgent();

    // Set user ID
    agent.setUserId(userId);

    // Set conversation ID if provided
    if (conversationId) {
      // The agent will use the provided conversation ID
      console.log('Using provided conversation ID:', conversationId);
    }

    // Set extracted data if provided
    if (extractedData) {
      agent.setExtractedData(extractedData);
      console.log('Set extracted data for agent');
    }

    // Add deduction answers if provided
    if (deductionAnswers) {
      Object.entries(deductionAnswers).forEach(([questionId, answer]) => {
        agent.addDeductionAnswer(questionId, answer);
      });
      console.log('Added deduction answers to agent');
    }

    // Run agent
    const result = await agent.runAgent(input);

    // Get agent state
    const state = agent.getState();

    // Store conversation state in Supabase
    await SupabaseService.storeConversationState(
      state.conversationId,
      userId,
      {
        ...state,
        lastUpdated: new Date().toISOString()
      }
    );

    console.log('Agent execution completed successfully', {
      conversationId: state.conversationId,
      step: state.step,
      isComplete: state.isComplete,
      messagesCount: state.messages.length
    });

    return NextResponse.json({
      success: true,
      result,
      state: {
        conversationId: state.conversationId,
        step: state.step,
        isComplete: state.isComplete,
        currentQuestionIndex: state.currentQuestionIndex,
        hasExtractedData: !!state.extractedData,
        hasDeductionFlow: !!state.deductionFlow,
        messagesCount: state.messages.length,
        done: state.done
      }
    });

  } catch (error) {
    console.error('Agent execution error:', error);

    // Log error to Supabase
    const conversationId = `error_${Date.now()}`;
    await SupabaseService.logError(
      conversationId,
      'agent_execution',
      error instanceof Error ? error.message : 'Unknown error',
      {
        endpoint: '/api/advisor/run-agent',
        userId: body?.userId,
        input: body?.input?.substring(0, 100) // Log first 100 chars of input
      }
    );

    return NextResponse.json({
      error: 'Agent execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 