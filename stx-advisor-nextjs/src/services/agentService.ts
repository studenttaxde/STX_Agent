import { PflegedAgent } from '@/agent/taxAdvisorAgent';
import { ExtractedData, UserStatus } from '@/types';
import { 
  AgentInitializeRequest, 
  AgentRespondRequest,
  AgentResponse
} from '@/types/validation';
import { 
  createAgentError, 
  logError, 
  withErrorHandling,
  validateRequiredFields,
  type ErrorContext 
} from '@/utils/errorHandler';

// Store agent instances per session (in production, use Redis or database)
const agentSessions = new Map<string, PflegedAgent>();

/**
 * Get or create an agent instance for a session
 */
function getOrCreateAgent(sessionId: string): PflegedAgent {
  if (!agentSessions.has(sessionId)) {
    console.log('Creating new PflegedAgent instance for session:', sessionId);
    agentSessions.set(sessionId, new PflegedAgent());
  } else {
    console.log('Using existing PflegedAgent instance for session:', sessionId);
  }
  return agentSessions.get(sessionId)!;
}

/**
 * Remove an agent session
 */
export function removeAgentSession(sessionId: string): boolean {
  if (agentSessions.has(sessionId)) {
    agentSessions.delete(sessionId);
    console.log('Removed agent session:', sessionId);
    return true;
  }
  return false;
}

/**
 * Handle agent initialization
 */
export async function handleAgentInitialize(request: AgentInitializeRequest): Promise<AgentResponse> {
  const { sessionId, extractedData, existingData, suggestedDeductions } = request;
  
  const context: ErrorContext = {
    endpoint: '/api/agent/agent',
    action: 'initialize',
    sessionId
  };
  
  return withErrorHandling(async () => {
    validateRequiredFields({ sessionId }, ['sessionId'], context);
    
    const agent = getOrCreateAgent(sessionId);

    console.log('Initializing agent with extracted data:', extractedData);
    
    if (extractedData) {
      agent.setExtractedData(extractedData as ExtractedData);
    }
    
    // If there's existing data, inform the agent
    if (existingData) {
      console.log('Adding existing data to agent:', existingData);
      agent.addUserMessage(
        `I have existing data for ${existingData.year}: Income: €${existingData.gross_income}, Tax Paid: €${existingData.income_tax_paid}, Employer: ${existingData.employer}`
      );
    }
    
    // If there are suggested deductions, inform the agent
    if (suggestedDeductions && suggestedDeductions.length > 0) {
      console.log('Adding suggested deductions to agent:', suggestedDeductions);
      const deductionSuggestions = suggestedDeductions
        .map((d: any) => `${d.category}: €${d.amount}`)
        .join(', ');
      agent.addUserMessage(`Based on previous years, you commonly claimed: ${deductionSuggestions}`);
    }
    
    console.log('Getting initial agent message using Pfleged agent');
    
    // Use the Pfleged agent for intelligent analysis and response
    const initialMessage = await agent.runAgent(
      'Analyze the extracted tax data and provide an intelligent initial response. Ask the user to confirm the tax year and explain what you found.'
    );
    
    console.log('Initial message received from Pfleged agent:', initialMessage);
    
    // Check if employment status selector should be shown
    const needsEmploymentStatus = initialMessage && 
      (initialMessage.includes('employment status') || 
       initialMessage.includes('Please select') ||
       initialMessage.includes('Before we begin deductions'))
    
    return {
      success: true,
      message: initialMessage,
      done: false,
      deduction_flow: null,
      current_question_index: 0,
      showEmploymentSelector: needsEmploymentStatus
    };
  }, context, 25000); // 25 second timeout
}

/**
 * Handle agent response to user message
 */
export async function handleAgentRespond(request: AgentRespondRequest): Promise<AgentResponse> {
  const { sessionId, message, extractedData, multiPDFData } = request;
  
  const context: ErrorContext = {
    endpoint: '/api/agent/agent',
    action: 'respond',
    sessionId
  };
  
  return withErrorHandling(async () => {
    validateRequiredFields({ sessionId }, ['sessionId'], context);
    
    const agent = getOrCreateAgent(sessionId);

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
    
    // Use the Pfleged agent for intelligent conversation
    const nextMessage = await agent.runAgent(message || 'Continue the tax filing conversation intelligently');
    
    console.log('Next message received from Pfleged agent:', nextMessage);
    
    // Check if conversation is done based on agent state
    const isDone = agent.isComplete();
    
    // Get current state
    const state = agent.getState();
    
    // Check if employment status selector should be shown
    const needsEmploymentStatus = nextMessage && 
      (nextMessage.includes('employment status') || 
       nextMessage.includes('Please select') ||
       nextMessage.includes('Before we begin deductions') ||
       nextMessage.includes('I need to set up your deduction flow'))
    
    return {
      success: true,
      message: nextMessage,
      done: isDone,
      deduction_flow: state.deductionFlow,
      current_question_index: state.currentQuestionIndex,
      conversation_id: state.conversationId,
      step: state.step,
      showEmploymentSelector: needsEmploymentStatus
    };
  }, context, 25000); // 25 second timeout
}

/**
 * Handle employment status selection
 */
export async function handleAgentEmploymentStatus(request: {
  sessionId: string;
  employmentStatus: UserStatus;
  extractedData?: ExtractedData;
  multiPDFData?: any;
}): Promise<AgentResponse> {
  const { sessionId, employmentStatus, extractedData, multiPDFData } = request;
  
  const context: ErrorContext = {
    endpoint: '/api/agent/agent',
    action: 'employment-status',
    sessionId
  };
  
  return withErrorHandling(async () => {
    validateRequiredFields({ sessionId, employmentStatus }, ['sessionId', 'employmentStatus'], context);
    
    const agent = getOrCreateAgent(sessionId);

    console.log('Processing employment status selection:', employmentStatus);
    
    // Use the agent's employment status handler
    const response = agent.handleEmploymentStatusSelection(employmentStatus);
    
    console.log('Employment status response:', response);
    
    // Get current state
    const state = agent.getState();
    
    return {
      success: true,
      message: response,
      done: false,
      deduction_flow: state.deductionFlow,
      current_question_index: state.currentQuestionIndex,
      conversation_id: state.conversationId,
      step: state.step,
      showEmploymentSelector: false // Employment status already selected
    };
  }, context, 25000); // 25 second timeout
}

// TODO: UNUSED - safe to delete after verification
// This function is just a wrapper around errorHandler.logError and is not used
// export async function logAgentError(
//   conversationId: string,
//   errorType: string,
//   error: Error | string,
//   context: Record<string, any> = {}
// ): Promise<void> {
//   await logError(conversationId, errorType, error, context);
// } 