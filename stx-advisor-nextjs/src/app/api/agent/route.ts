import { NextRequest, NextResponse } from 'next/server';
import { AgentInitializeSchema, AgentRespondSchema } from '@/types/validation';
import { handleAgentInitialize, handleAgentRespond, handleAgentEmploymentStatus, removeAgentSession } from '@/services/agentService';
import { handleAgentError } from '@/utils/errorHandler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate the request body
    let validatedBody;
    try {
      if (body.action === 'initialize') {
        validatedBody = AgentInitializeSchema.parse(body);
      } else if (body.action === 'respond') {
        validatedBody = AgentRespondSchema.parse(body);
      } else if (body.action === 'employment-status') {
        // For employment-status, we'll validate manually since we don't have a schema yet
        validatedBody = body;
      } else {
        return NextResponse.json(
          { error: 'Invalid action. Must be "initialize", "respond", or "employment-status"' },
          { status: 400 }
        );
      }
    } catch (validationError) {
      return NextResponse.json(
        { error: 'Invalid request format', details: validationError },
        { status: 400 }
      );
    }

    // Handle the request based on action
    let result;
    if (validatedBody.action === 'initialize') {
      result = await handleAgentInitialize(validatedBody);
    } else if (validatedBody.action === 'respond') {
      result = await handleAgentRespond(validatedBody);
    } else if (validatedBody.action === 'employment-status') {
      result = await handleAgentEmploymentStatus(validatedBody);
    }

    return NextResponse.json(result);
  } catch (error) {
    const errorResponse = handleAgentError(error, {
      endpoint: '/api/agent',
      action: 'POST'
    });
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const removed = removeAgentSession(sessionId);
    return NextResponse.json({ success: removed });
  } catch (error) {
    const errorResponse = handleAgentError(error, {
      endpoint: '/api/agent',
      action: 'DELETE'
    });
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
} 