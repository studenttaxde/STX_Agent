import { NextRequest, NextResponse } from 'next/server';
import { 
  AgentInitializeSchema, 
  AgentRespondSchema 
} from '@/types/validation';
import { 
  handleAgentInitialize, 
  handleAgentRespond, 
  removeAgentSession
} from '@/services/agentService';
import { handleAgentError } from '@/utils/errorHandler';

// TODO: DUPLICATE with route.ts in same directory - safe to delete after verification
// This route is redundant as route.ts handles the same functionality

export const maxDuration = 30; // 30 seconds for agent processing

export async function POST(request: NextRequest) {
  try {
    console.log('Advisor API called');
    const body = await request.json();
    
    // Validate the request body
    let validatedBody: any;
    try {
      if (body.action === 'initialize') {
        validatedBody = AgentInitializeSchema.parse(body);
      } else if (body.action === 'respond') {
        validatedBody = AgentRespondSchema.parse(body);
      } else {
        return NextResponse.json(
          { error: 'Invalid action. Must be "initialize" or "respond"' },
          { status: 400 }
        );
      }
    } catch (validationError) {
      console.error('Validation error:', validationError);
      return NextResponse.json(
        { error: 'Invalid request data', details: validationError },
        { status: 400 }
      );
    }

    const { action, sessionId } = validatedBody;

    console.log('Request body:', { 
      action, 
      sessionId, 
      hasExtractedData: !!validatedBody.extractedData, 
      hasMessage: 'message' in validatedBody ? !!validatedBody.message : false
    });

    let response;
    
    try {
      switch (action) {
        case 'initialize':
          response = await handleAgentInitialize(validatedBody);
          break;
          
        case 'respond':
          response = await handleAgentRespond(validatedBody);
          break;
          
        default:
          return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
          );
      }
      
      return NextResponse.json(response);
      
    } catch (agentError) {
      const errorResponse = handleAgentError(agentError, {
        endpoint: '/api/agent/agent',
        action,
        sessionId
      });
      
      return NextResponse.json(errorResponse, { status: 500 });
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
    const removed = removeAgentSession(sessionId);
    
    return NextResponse.json({ 
      success: true, 
      removed 
    });
  } catch (error) {
    console.error('Delete session error:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
