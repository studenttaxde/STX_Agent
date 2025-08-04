import { NextRequest, NextResponse } from 'next/server';
import { RunAgentSchema } from '@/types/validation';
import { handleRunAgent, logAgentError } from '@/services/agentService';
import { handleAgentError } from '@/utils/errorHandler';

// TODO: UNUSED - safe to delete after verification
// This route exists but is not called from any frontend component

export const maxDuration = 30; // 30 seconds for agent processing

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate the request body
    let validatedBody;
    try {
      validatedBody = RunAgentSchema.parse(body);
    } catch (validationError) {
      console.error('Validation error:', validationError);
      return NextResponse.json(
        { error: 'Invalid request data', details: validationError },
        { status: 400 }
      );
    }

    const { userId, input } = validatedBody;

    console.log('Starting Pfleged agent execution:', {
      userId,
      conversationId: validatedBody.conversationId,
      inputLength: input.length,
      hasExtractedData: !!validatedBody.extractedData,
      hasDeductionAnswers: !!validatedBody.deductionAnswers
    });

    try {
      const response = await handleRunAgent(validatedBody);
      return NextResponse.json(response);
    } catch (agentError) {
      const errorResponse = handleAgentError(agentError, {
        endpoint: '/api/agent/run-agent',
        userId,
        input: input.substring(0, 100) // Log first 100 chars of input
      });

      return NextResponse.json(errorResponse, { status: 500 });
    }

  } catch (error) {
    console.error('Run agent API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 