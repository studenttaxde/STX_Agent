import { NextRequest, NextResponse } from 'next/server';
import { PflegedAgent } from '@/lib/taxAdvisorAgent';
import { SupabaseService } from '@/lib/supabaseService';

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
      inputLength: input.length
    });

    // Initialize agent
    const agent = new PflegedAgent();
    
    // Set user ID
    agent.setUserId(userId);
    
    // Set conversation ID if provided
    if (conversationId) {
      // This would need to be implemented in the agent
      // agent.setConversationId(conversationId);
    }
    
    // Set extracted data if provided
    if (extractedData) {
      agent.setExtractedData(extractedData);
    }
    
    // Add deduction answers if provided
    if (deductionAnswers) {
      Object.entries(deductionAnswers).forEach(([questionId, answer]) => {
        agent.addDeductionAnswer(questionId, answer);
      });
    }

    // Run agent
    const result = await agent.runAgent(input);
    
    // Get agent state
    const state = agent.getState();
    
    // Store conversation state in Supabase
    await SupabaseService.storeConversationState(
      state.conversationId,
      userId,
      state
    );

    console.log('Agent execution completed successfully');

    return NextResponse.json({
      success: true,
      result,
      state: {
        conversationId: state.conversationId,
        isComplete: state.isComplete,
        currentQuestionIndex: state.currentQuestionIndex,
        hasExtractedData: !!state.extractedData,
        hasDeductionFlow: !!state.deductionFlow
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
      { endpoint: '/api/advisor/run-agent' }
    );

    return NextResponse.json({
      error: 'Agent execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 