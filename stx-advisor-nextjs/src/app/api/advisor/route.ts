import { NextRequest, NextResponse } from 'next/server';
import { PflegedAgent } from '@/lib/taxAdvisorAgent';
import { ExtractedData } from '@/types';

// Store agent instances per session (in production, use Redis or database)
const agentSessions = new Map<string, PflegedAgent>();

function getOrCreateAgent(sessionId: string): PflegedAgent {
  if (!agentSessions.has(sessionId)) {
    console.log('Creating new PflegedAgent instance for session:', sessionId);
    agentSessions.set(sessionId, new PflegedAgent());
  } else {
    console.log('Using existing PflegedAgent instance for session:', sessionId);
  }
  return agentSessions.get(sessionId)!;
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

    const agent = getOrCreateAgent(sessionId);

    switch (action) {
      case 'initialize':
        console.log('Initializing agent with extracted data:', extractedData);
        if (extractedData) {
          agent.setExtractedData(extractedData as ExtractedData);
        }
        
        // If there's existing data, inform the agent
        if (existingData) {
          console.log('Adding existing data to agent:', existingData);
          agent.addUserMessage(`I have existing data for ${existingData.year}: Income: €${existingData.gross_income}, Tax Paid: €${existingData.income_tax_paid}, Employer: ${existingData.employer}`);
        }
        
        // If there are suggested deductions, inform the agent
        if (suggestedDeductions && suggestedDeductions.length > 0) {
          console.log('Adding suggested deductions to agent:', suggestedDeductions);
          const deductionSuggestions = suggestedDeductions.map((d: any) => `${d.category}: €${d.amount}`).join(', ');
          agent.addUserMessage(`Based on previous years, you commonly claimed: ${deductionSuggestions}`);
        }
        
        console.log('Getting initial agent message using Pfleged agent');
        let initialMessage = '';
        
        try {
          // Use the Pfleged agent for intelligent analysis and response
          initialMessage = await agent.runAgent('Analyze the extracted tax data and provide an intelligent initial response. Ask the user to confirm the tax year and explain what you found.');
        } catch (agentError) {
          console.error('Agent error:', agentError);
          return NextResponse.json({
            error: 'Agent initialization failed',
            details: agentError instanceof Error ? agentError.message : 'Unknown error'
          }, { status: 500 });
        }
        
        console.log('Initial message received from Pfleged agent:', initialMessage);
        
        return NextResponse.json({
          success: true,
          message: initialMessage,
          done: false,
          deduction_flow: null,
          current_question_index: 0
        });

      case 'respond':
        console.log('Processing user response:', message);
        console.log('Current agent state:', {
          messagesCount: agent.getConversationHistory().length,
          extractedData: agent.getUserData(),
          deductionAnswers: agent.getDeductionAnswers()
        });
        
        // If this is the first message and we have extracted data, initialize the conversation
        if (agent.getConversationHistory().length === 0 && agent.getUserData().year) {
          console.log('Re-initializing conversation for existing session');
          try {
            const initialMessage = await agent.runAgent('Initialize tax filing process with extracted data');
            agent.addAgentMessage(initialMessage);
          } catch (error) {
            console.error('Failed to initialize agent:', error);
          }
        }
        
        if (message) {
          agent.addUserMessage(message);
        }

        console.log('Getting next agent message using Pfleged agent');
        let nextMessage = '';
        
        try {
          // Use the Pfleged agent for intelligent conversation
          nextMessage = await agent.runAgent(message || 'Continue the tax filing conversation intelligently');
        } catch (agentError) {
          console.error('Agent error:', agentError);
          return NextResponse.json({
            error: 'Agent conversation failed',
            details: agentError instanceof Error ? agentError.message : 'Unknown error'
          }, { status: 500 });
        }
        
        console.log('Next message received from Pfleged agent:', nextMessage);
        
        // Check if conversation is done based on agent state
        const isDone = agent.isComplete();
        
        // Get current state
        const state = agent.getState();
        
        return NextResponse.json({
          success: true,
          message: nextMessage,
          done: isDone,
          deduction_flow: state.deductionFlow,
          current_question_index: state.currentQuestionIndex,
          conversation_id: state.conversationId,
          step: state.step
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Advisor API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
    
    // Remove the session from memory
    if (agentSessions.has(sessionId)) {
      agentSessions.delete(sessionId);
      console.log('Removed agent session:', sessionId);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
