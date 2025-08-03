import { SupabaseService } from '@/services/supabaseService';

export interface ErrorContext {
  endpoint: string;
  userId?: string;
  sessionId?: string;
  action?: string;
  timestamp?: string;
  [key: string]: any;
}

export interface AgentError extends Error {
  code?: string;
  context?: ErrorContext;
  isAgentError?: boolean;
}

/**
 * Create a standardized agent error
 */
export function createAgentError(
  message: string,
  code?: string,
  context?: ErrorContext
): AgentError {
  const error = new Error(message) as AgentError;
  error.code = code;
  error.context = context;
  error.isAgentError = true;
  return error;
}

/**
 * Log error to Supabase with context
 */
export async function logError(
  conversationId: string,
  errorType: string,
  error: Error | string,
  context: ErrorContext = {}
): Promise<void> {
  try {
    await SupabaseService.logError(
      conversationId,
      errorType,
      error instanceof Error ? error.message : error,
      {
        ...context,
        timestamp: new Date().toISOString()
      }
    );
  } catch (logError) {
    console.error('Failed to log error to Supabase:', logError);
  }
}

/**
 * Handle agent errors with proper logging and response formatting
 */
export function handleAgentError(
  error: unknown,
  context: ErrorContext = {}
): { error: string; details?: string; code?: string } {
  console.error('Agent error:', error);
  
  // Create standardized error response
  const errorResponse = {
    error: 'Agent processing failed',
    details: error instanceof Error ? error.message : 'Unknown error',
    code: (error as AgentError)?.code
  };
  
  // Log error if we have context
  if (context.endpoint) {
    const conversationId = context.sessionId || `error_${Date.now()}`;
    logError(conversationId, 'agent_error', error, context);
  }
  
  return errorResponse;
}

/**
 * Validate required fields and throw standardized errors
 */
export function validateRequiredFields(
  data: Record<string, any>,
  requiredFields: string[],
  context?: ErrorContext
): void {
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw createAgentError(
      `Missing required fields: ${missingFields.join(', ')}`,
      'VALIDATION_ERROR',
      context
    );
  }
}

/**
 * Handle timeout errors specifically
 */
export function createTimeoutError(
  operation: string,
  timeoutMs: number,
  context?: ErrorContext
): AgentError {
  return createAgentError(
    `${operation} timed out after ${timeoutMs}ms`,
    'TIMEOUT_ERROR',
    context
  );
}

/**
 * Wrap async operations with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  timeoutMs?: number
): Promise<T> {
  try {
    if (timeoutMs) {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(createTimeoutError('Operation', timeoutMs, context)), timeoutMs)
        )
      ]);
    }
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      throw error;
    }
    throw createAgentError(
      error instanceof Error ? error.message : 'Unknown error',
      'OPERATION_ERROR',
      context
    );
  }
} 