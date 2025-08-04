import { createClient } from '@supabase/supabase-js';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { 
  ConversationHistory, 
  DeductionAnswer, 
  DeductionFlow, 
  DeductionQuestion, 
  ExtractedData, 
  TaxCalculation, 
  UserData, 
  UserStatus,
  UserProfile
} from '@/types';

/**
 * Complete state of the Pfleged tax advisor agent
 */
export interface PflegedAgentState {
  // Core conversation data
  conversationId: string;
  userId?: string;
  taxYear?: string;
  extractedData?: ExtractedData;
  messages: Array<{ sender: 'user' | 'assistant'; text: string; timestamp: Date }>;
  
  // Deduction flow state
  deductionAnswers: Record<string, DeductionAnswer>;
  currentQuestionIndex: number;
  deductionFlow?: DeductionFlow;
  
  // Tax calculation state
  taxCalculation?: TaxCalculation;
  lossCarryforward?: {
    used: number;
    remaining: number;
  };
  
  // Conversation flow state
  step: 'upload' | 'extract' | 'confirm' | 'questions' | 'calculate' | 'summary';
  isComplete: boolean;
  done: boolean;
  hasInteracted: boolean;
  
  // Autonomous tool chaining state
  latestSummary?: string;
  refundEstimate?: number;
  thresholdCheckResult?: {
    isBelowThreshold: boolean;
    threshold: number;
    taxableIncome: number;
  };
  hasRunToolChain: boolean;
  
  // Debug and logging
  debugLog: Array<{
    tool: string;
    timestamp: Date;
    input?: any;
    output?: any;
  }>;
  
  // Personalization
  userProfile?: UserProfile | null;
  lastExplanation?: string;
}

/**
 * Pfleged - AI-powered German tax advisor agent
 * 
 * Handles tax data analysis, deduction flows, and personalized tax advice
 * using LangChain and OpenAI for intelligent conversation management.
 * 
 * @class PflegedAgent
 * @description Main agent class for German tax filing assistance
 */
export class PflegedAgent {
  // ============================================================================
  // PRIVATE PROPERTIES
  // ============================================================================
  
  private llm: ChatOpenAI;
  private agentExecutor: AgentExecutor | null = null;
  private state: PflegedAgentState;
  private agent!: AgentExecutor;
  
  // Supabase client for user profile data
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Tax-free thresholds by year (Grundfreibetrag)
  private static readonly TAX_FREE_THRESHOLDS: Record<number, number> = {
    2021: 9744,
    2022: 10347,
    2023: 10908,
    2024: 11604
  };

  // Deduction flows mapped by user status
  private readonly deductionFlowMap: Record<UserStatus, DeductionFlow> = {
    bachelor: {
      status: 'bachelor',
      questions: [
        {
          id: 'werbungskosten',
          question: 'Do you have work-related expenses (Werbungskosten)? This includes travel to work, work clothes, home office, etc.',
          category: 'Werbungskosten',
          maxAmount: 1000,
          required: false
        },
        {
          id: 'sozialversicherung',
          question: 'Do you have social security contributions (Sozialversicherung) that were not already deducted from your salary?',
          category: 'Sozialversicherung',
          maxAmount: 5000,
          required: false
        }
      ],
      order: ['werbungskosten', 'sozialversicherung']
    },
    master: {
      status: 'master',
      questions: [
        {
          id: 'werbungskosten',
          question: 'Do you have work-related expenses (Werbungskosten)? This includes travel to work, work clothes, home office, etc.',
          category: 'Werbungskosten',
          maxAmount: 1000,
          required: false
        },
        {
          id: 'sozialversicherung',
          question: 'Do you have social security contributions (Sozialversicherung) that were not already deducted from your salary?',
          category: 'Sozialversicherung',
          maxAmount: 5000,
          required: false
        },
        {
          id: 'sonderausgaben',
          question: 'Do you have special expenses (Sonderausgaben)? This includes church tax, insurance premiums, etc.',
          category: 'Sonderausgaben',
          maxAmount: 3000,
          required: false
        }
      ],
      order: ['werbungskosten', 'sozialversicherung', 'sonderausgaben']
    },
    gradjob: {
      status: 'gradjob',
      questions: [
        {
          id: 'werbungskosten',
          question: 'Do you have work-related expenses (Werbungskosten)? This includes travel to work, work clothes, home office, etc.',
          category: 'Werbungskosten',
          maxAmount: 1000,
          required: false
        },
        {
          id: 'sozialversicherung',
          question: 'Do you have social security contributions (Sozialversicherung) that were not already deducted from your salary?',
          category: 'Sozialversicherung',
          maxAmount: 5000,
          required: false
        },
        {
          id: 'sonderausgaben',
          question: 'Do you have special expenses (Sonderausgaben)? This includes church tax, insurance premiums, etc.',
          category: 'Sonderausgaben',
          maxAmount: 3000,
          required: false
        }
      ],
      order: ['werbungskosten', 'sozialversicherung', 'sonderausgaben']
    },
    fulltime: {
      status: 'fulltime',
      questions: [
        {
          id: 'werbungskosten',
          question: 'Do you have work-related expenses (Werbungskosten)? This includes travel to work, work clothes, home office, etc.',
          category: 'Werbungskosten',
          maxAmount: 1000,
          required: false
        },
        {
          id: 'sozialversicherung',
          question: 'Do you have social security contributions (Sozialversicherung) that were not already deducted from your salary?',
          category: 'Sozialversicherung',
          maxAmount: 5000,
          required: false
        },
        {
          id: 'sonderausgaben',
          question: 'Do you have special expenses (Sonderausgaben)? This includes church tax, insurance premiums, etc.',
          category: 'Sonderausgaben',
          maxAmount: 3000,
          required: false
        }
      ],
      order: ['werbungskosten', 'sozialversicherung', 'sonderausgaben']
    }
  };

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================
  
  /**
   * Initialize the Pfleged agent with OpenAI and LangChain setup
   */
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY
    });

    this.state = {
      conversationId: this.generateConversationId(),
      deductionAnswers: {},
      currentQuestionIndex: 0,
      isComplete: false,
      messages: [],
      step: 'upload',
      done: false,
      hasInteracted: false,
      debugLog: [],
      hasRunToolChain: false
    };
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================
  
  /**
   * Generate a unique conversation ID for tracking
   * @returns {string} Unique conversation identifier
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Reset the agent state for a new conversation
   * Clears all data and returns to initial upload state
   */
  reset(): void {
    this.state = {
      conversationId: this.generateConversationId(),
      deductionAnswers: {},
      currentQuestionIndex: 0,
      isComplete: false,
      messages: [],
      step: 'upload',
      done: false,
      hasInteracted: false,
      debugLog: [],
      hasRunToolChain: false
    };
  }

  /**
   * Reset agent state for filing another tax year
   * Preserves conversation ID but clears all other state
   */
  private resetForNewYear(): void {
    const conversationId = this.state.conversationId;
    
    this.state = {
      conversationId,
      userId: this.state.userId,
      deductionAnswers: {},
      currentQuestionIndex: 0,
      isComplete: false,
      messages: [],
      step: 'upload',
      done: false,
      hasInteracted: false,
      debugLog: [],
      hasRunToolChain: false
    };
    
    console.log('State reset for new year. Conversation ID preserved:', conversationId);
  }

  // ============================================================================
  // USER PROFILE MANAGEMENT
  // ============================================================================
  
  /**
   * Load user profile from Supabase for personalized advice
   * @param userId - User ID to load profile for
   * @param taxYear - Optional tax year for year-specific data
   * @returns User profile or null if not found
   */
  async loadUserProfile(userId: string, taxYear?: string): Promise<UserProfile | null> {
    try {
      let query = this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId);

      // If tax year is provided, filter by year
      if (taxYear) {
        query = query.eq('tax_year', taxYear);
      }

      const { data, error } = await query.single();

      if (error) {
        console.error('Error loading user profile:', error);
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error('Error loading user profile:', error);
      return null;
    }
  }



  // ============================================================================
  // LANGCHAIN TOOLS & AI ORCHESTRATION
  // ============================================================================
  
  /**
   * Create LangChain tools for the AI agent
   * 
   * Defines all available tools that the agent can use during conversation
   */
  private createTools() {
    return [
      new DynamicStructuredTool({
        name: 'analyzeExtractedData',
        description: 'Analyze extracted tax data and provide insights',
        schema: z.object({
          data: z.string().describe('JSON string of extracted tax data')
        }),
        func: async (input) => {
          try {
            this.setExtractedData(input.data);
            
            const data = this.state.extractedData;
            if (!data) {
              throw new Error('Failed to parse extracted data');
            }
            
            const hasBasicData = data.gross_income && data.income_tax_paid && data.year;
            
            return JSON.stringify({
              success: true,
              data: data,
              message: 'Tax data analyzed successfully',
              hasBasicData: hasBasicData
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }),

      new DynamicStructuredTool({
        name: 'calculateTaxSummary',
        description: 'Calculate tax summary with deductions and refund estimation',
        schema: z.object({
          grossIncome: z.number().describe('Gross income in euros'),
          taxPaid: z.number().describe('Tax paid in euros'),
          deductions: z.array(z.object({
            category: z.string(),
            amount: z.number()
          })).describe('List of deductions with amounts')
        }),
        func: async (input) => {
          try {
            const calculation = this.getTaxCalculation() as TaxCalculation;
            
            if (!calculation) {
              throw new Error('No extracted data available for calculation');
            }
            
            this.state.debugLog.push({
              tool: 'calculateTaxSummary',
              timestamp: new Date(),
              input: input,
              output: calculation
            });
            
            return JSON.stringify({
              success: true,
              summary: calculation,
              message: 'Tax calculation completed'
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }),

      new DynamicStructuredTool({
        name: 'checkTaxThreshold',
        description: 'Check if taxable income is below the tax-free threshold',
        schema: z.object({
          taxableIncome: z.number().describe('Taxable income in euros'),
          year: z.number().optional().describe('Tax year for threshold lookup')
        }),
        func: async (input) => {
          try {
            const result = this.checkTaxThreshold(input.taxableIncome, input.year);
            
            if (!result) {
              throw new Error('Unable to check tax threshold - no data available');
            }
            
            this.state.debugLog.push({
              tool: 'checkTaxThreshold',
              timestamp: new Date(),
              input: input,
              output: result
            });
            
            return JSON.stringify({
              success: true,
              isBelowThreshold: result.isBelowThreshold,
              threshold: result.threshold,
              taxableIncome: result.taxableIncome,
              message: result.isBelowThreshold ? 
                `Income below threshold - eligible for full refund` : 
                `Income above threshold - partial refund possible`
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }),

      new DynamicStructuredTool({
        name: 'askDeductionQuestions',
        description: 'Start deduction question flow based on user status',
        schema: z.object({
          status: z.enum(['bachelor', 'master', 'new_employee', 'full_time']).describe('User status for deduction flow')
        }),
        func: async (input) => {
          try {
            const status = input.status as UserStatus;
            this.state.deductionFlow = this.deductionFlowMap[status];
            this.state.step = 'questions';
            this.state.currentQuestionIndex = 0;
            
            // Personalize questions based on user profile
            let personalizationNote = '';
            if (this.state.userProfile) {
              const profile = this.state.userProfile;
              if (profile.job_type === 'freelancer') {
                personalizationNote = '\n\n💼 **Freelancer Tip:** Since you\'re a freelancer, you may also be eligible for business-related deductions like home office, professional development, and business travel expenses.';
              } else if (profile.marital_status === 'married') {
                personalizationNote = '\n\n💑 **Married Filing:** Consider filing jointly with your spouse for potential tax benefits.';
              } else if (profile.age && profile.age < 25) {
                personalizationNote = '\n\n🎓 **Student Benefits:** As a young student, you may be eligible for additional education-related deductions.';
              }
            }
            
            // Log tool usage
            this.state.debugLog.push({
              tool: 'askDeductionQuestions',
              timestamp: new Date(),
              input: input,
              output: { 
                status, 
                questionCount: this.state.deductionFlow?.questions.length || 0,
                userProfile: this.state.userProfile ? 'Available' : 'Not available'
              }
            });
            
            return JSON.stringify({
              success: true,
              status: status,
              questionCount: this.state.deductionFlow?.questions.length || 0,
              personalizationNote: personalizationNote,
              message: `Started personalized deduction questions for ${status} status`
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }),

      new DynamicStructuredTool({
        name: 'runToolChain',
        description: 'Automatically run a chain of tools to analyze tax data and provide comprehensive results',
        schema: z.object({
          forceRun: z.boolean().optional().describe('Force run even if already executed')
        }),
        func: async (input) => {
          try {
            // Don't run if already executed unless forced
            if (this.state.hasRunToolChain && !input.forceRun) {
              return JSON.stringify({
                success: true,
                message: 'Tool chain already executed',
                cached: true
              });
            }

            if (!this.state.extractedData) {
              return JSON.stringify({
                success: false,
                error: 'No extracted data available for tool chain'
              });
            }

            // Step 1: Use unified getTaxCalculation method
            const calculation = this.getTaxCalculation() as TaxCalculation;
            if (!calculation) {
              throw new Error('No extracted data available for tool chain');
            }
            
            const { taxableIncome, refund, year } = calculation;
            
            // Step 2: Use unified checkTaxThreshold method
            const thresholdResult = this.checkTaxThreshold(taxableIncome, year);
            if (!thresholdResult) {
              throw new Error('Unable to check tax threshold');
            }
            
            const { isBelowThreshold, threshold } = thresholdResult;
            
            // Step 3: Generate final summary using unified method
            const finalSummary = this.getTaxCalculation({ 
              includeSummary: true, 
              includePersonalization: true, 
              format: 'markdown' 
            }) as string;
            
            // Update state
            this.state.latestSummary = finalSummary;
            this.state.refundEstimate = refund;
            this.state.thresholdCheckResult = {
              isBelowThreshold,
              threshold,
              taxableIncome
            };
            this.state.hasRunToolChain = true;
            this.state.step = 'summary';
            
            // Log tool chain execution
            this.state.debugLog.push({
              tool: 'runToolChain',
              timestamp: new Date(),
              input: input,
              output: {
                taxableIncome,
                isBelowThreshold,
                refund,
                summaryLength: finalSummary.length
              }
            });
            
            return JSON.stringify({
              success: true,
              taxableIncome,
              isBelowThreshold,
              refund,
              summary: finalSummary,
              message: 'Tool chain completed successfully'
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }),

      new DynamicStructuredTool({
        name: 'explainRefundCalculation',
        description: 'Generate a detailed explanation of how the tax refund was calculated',
        schema: z.object({
          includePersonalization: z.boolean().optional().describe('Include personalized notes based on user profile')
        }),
        func: async (input) => {
          try {
            const explanation = this.generateRefundExplanation();
            
            // Log tool usage
            this.state.debugLog.push({
              tool: 'explainRefundCalculation',
              timestamp: new Date(),
              input: input,
              output: { explanationLength: explanation.length }
            });
            
            return JSON.stringify({
              success: true,
              explanation: explanation,
              message: 'Refund calculation explanation generated'
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }),

      new DynamicStructuredTool({
        name: 'applyLossCarryforward',
        description: 'Get and apply loss carryforward from previous years',
        schema: z.object({
          userId: z.string().describe('User ID'),
          year: z.number().describe('Tax year'),
          amount: z.number().describe('Amount to apply')
        }),
        func: async (input) => {
          try {
                    // Simplified loss carryforward handling without Supabase
        const availableLoss = 0; // Default to 0 for now
        const appliedLoss = Math.min(availableLoss, input.amount);
        const remainingLoss = availableLoss - appliedLoss;

        this.state.lossCarryforward = {
          used: appliedLoss,
          remaining: remainingLoss
        };

            return JSON.stringify({
              success: true,
              applied: appliedLoss,
              remaining: remainingLoss,
              message: `Applied €${appliedLoss} loss carryforward`
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to apply loss carryforward'
            });
          }
        }
      }),



      new DynamicStructuredTool({
        name: 'resetForNewYear',
        description: 'Reset agent state for filing another year',
        schema: z.object({
          userId: z.string().describe('User ID'),
          preserveData: z.boolean().describe('Preserve previous year data')
        }),
        func: async (input) => {
          try {
            // Store current year data in memory (Supabase integration removed for now)
            if (input.preserveData && this.state.extractedData) {
              console.log('Preserving data for year:', this.state.extractedData.year);
            }

            // Reset state for new year
            this.state = {
              conversationId: this.generateConversationId(),
              userId: input.userId,
              deductionAnswers: {},
              currentQuestionIndex: 0,
              isComplete: false,
              messages: [],
              step: 'upload',
              done: false,
              hasInteracted: false, // Reset hasInteracted
              debugLog: [], // Reset debugLog
              hasRunToolChain: false // Reset hasRunToolChain
            };

            return JSON.stringify({
              success: true,
              message: 'Agent reset for new year filing',
              new_conversation_id: this.state.conversationId
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to reset agent'
            });
          }
        }
      }),

      new DynamicStructuredTool({
        name: 'processDeductionAnswer',
        description: 'Process user answer to deduction question and extract amount',
        schema: z.object({
          answer: z.string().describe('User answer to deduction question'),
          questionId: z.string().describe('Question ID being answered'),
          maxAmount: z.number().describe('Maximum allowed amount for this deduction')
        }),
        func: async (input) => {
          try {
            const cleanAnswer = input.answer.trim().toLowerCase();
            
            // Check for "n/a" or "no" responses
            const isNo = /^(no|n|nein|false|0|none|n\/a|not applicable|na)$/i.test(cleanAnswer);
            if (isNo) {
              return JSON.stringify({
                success: true,
                amount: 0,
                answer: false,
                details: 'No deduction claimed'
              });
            }
            
            // Extract numeric amounts
            let amount = 0;
            let details = input.answer;
            
            // Handle complex responses like "1040 for laptop, and 95 for study material"
            const amountMatches = input.answer.match(/(\d+(?:[.,]\d+)?)\s*(?:euro|eur|€|for|on|spent|cost|paid)?\s*([^,]+)/gi);
            if (amountMatches && amountMatches.length > 0) {
              // Take the first amount found
              const firstMatch = amountMatches[0];
              const numMatch = firstMatch.match(/(\d+(?:[.,]\d+)?)/);
              if (numMatch) {
                amount = parseFloat(numMatch[1].replace(',', '.'));
                details = input.answer;
              }
            } else {
              // Handle simple numeric responses
              const numericMatch = input.answer.match(/(\d+(?:[.,]\d+)?)/);
              if (numericMatch) {
                amount = parseFloat(numericMatch[1].replace(',', '.'));
                details = input.answer;
              }
            }
            
            // Handle special cases like "18km, 210 days" for commuting
            if (input.answer.includes('km') && input.answer.includes('days')) {
              const kmMatch = input.answer.match(/(\d+)\s*km/i);
              const daysMatch = input.answer.match(/(\d+)\s*days?/i);
              if (kmMatch && daysMatch) {
                const km = parseInt(kmMatch[1]);
                const days = parseInt(daysMatch[1]);
                amount = km * days * 0.30; // €0.30 per km per day
                details = `${km}km, ${days} days commuting`;
              }
            }
            
            // Cap the amount at the maximum allowed
            if (amount > input.maxAmount) {
              amount = input.maxAmount;
            }
            
            return JSON.stringify({
              success: true,
              amount: amount,
              answer: amount > 0,
              details: details
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to process deduction answer'
            });
          }
        }
      })
    ];
  }

  private generateRefundReason(summary: TaxCalculation | null): string {
    if (!summary) return 'Unable to calculate refund';

    if (summary.refund === summary.taxPaid) {
      return 'Full refund: Your taxable income is below the tax-free threshold (Grundfreibetrag)';
    } else if (summary.refund > 0) {
      return `Partial refund: Your deductions reduced your taxable income, resulting in a refund of €${summary.refund.toFixed(2)}`;
    } else {
      return 'No refund: Your calculated tax due exceeds the amount already paid';
    }
  }

  private createPrompt() {
    // Build personalized context based on user profile
    let personalizedContext = '';
    if (this.state.userProfile) {
      const profile = this.state.userProfile;
      personalizedContext = `
PERSONALIZED CONTEXT:
- User: ${profile.full_name || 'Unknown'}
- Age: ${profile.age || 'Unknown'}
- Job Type: ${profile.job_type || 'Unknown'}
- Marital Status: ${profile.marital_status || 'Unknown'}
- Income Bracket: ${profile.income_brackets || 'Unknown'}
- Known Deductions: ${profile.known_deductions?.join(', ') || 'None specified'}

Provide advice tailored to this user's specific situation.`;
    }

    const systemPrompt = `You are Pfleged, an AI-powered German tax advisor specializing in helping students and young professionals with their tax filings.

${personalizedContext}

Your role is to:
1. Analyze extracted tax data from uploaded documents
2. Provide personalized tax advice based on the user's profile and situation
3. Guide users through deduction questions relevant to their circumstances
4. Calculate potential refunds and tax savings
5. Generate comprehensive, professional summaries
6. **Explain your reasoning transparently** - When users ask "how did you get that number?" or "can you explain?", provide detailed breakdowns of calculations

Available data: ${this.state.extractedData ? 'Available' : 'Not available'}

Always provide helpful, accurate German tax advice. Be conversational but professional. Use the available tools to analyze data and provide insights.

**Transparency Commitment:**
- Always explain your calculations when asked
- Break down complex tax concepts into simple steps
- Show your work and reasoning clearly
- Be honest about limitations and assumptions

When asking questions, consider the user's profile:
- For students: Focus on education expenses, books, travel
- For freelancers: Emphasize business expenses, home office, professional development
- For employees: Highlight work-related expenses, commuting, training
- For married users: Mention joint filing benefits and spouse-related deductions`;

    return ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['human', '{input}'],
      ['human', '{agent_scratchpad}']
    ]);
  }

  // ============================================================================
  // MAIN AGENT EXECUTION
  // ============================================================================
  
  async initialize() {
    try {
      const tools = this.createTools();
      const prompt = this.createPrompt();

      const agent = await createOpenAIFunctionsAgent({
        llm: this.llm,
        tools: tools as any, // Type assertion to fix linter error
        prompt
      });

      this.agent = new AgentExecutor({
        agent,
        tools: tools as any, // Type assertion to fix linter error
        verbose: true
      });
    } catch (error) {
      console.error('Agent initialization error:', error);
      throw new Error(`Failed to initialize Pfleged agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async runAgent(input: string): Promise<string> {
    try {
      console.log('Agent runAgent called with input:', input);
      console.log('Current state:', this.state);
      
      // GATE: If above threshold but no employment status selected, require employment status first
      if (this.state.extractedData && !this.state.deductionFlow) {
        const { bruttolohn, gross_income, year } = this.state.extractedData;
        const actualGrossIncome = bruttolohn || gross_income || 0;
        const thresholdResult = this.checkTaxThreshold(actualGrossIncome, year);
        
        if (thresholdResult && !thresholdResult.isBelowThreshold) {
          return `I need to set up your deduction flow first. Please select your employment status below.`;
        }
      }
      
      // Check if user is asking for explanation (only if input is not empty)
      if (input && input.trim()) {
        const explanationKeywords = [
          'explain', 'how did you get', 'why is my refund', 'calculation', 
          'breakdown', 'show me how', 'can you explain', 'what does this mean',
          'step by step', 'detailed explanation'
        ];
        
        const isAskingForExplanation = explanationKeywords.some(keyword => 
          input.toLowerCase().includes(keyword)
        );
        
        // If asking for explanation and we have data, provide explanation
        if (isAskingForExplanation && this.state.extractedData) {
          console.log('User requested explanation, generating detailed breakdown...');
          return this.generateRefundExplanation();
        }
      }
      
      // If this is the first interaction and we have extracted data, do initial analysis
      if (!this.state.hasInteracted && this.state.extractedData) {
        this.state.hasInteracted = true;
        return this.handleInitialAnalysis();
      }

      // If we have a deduction flow and are in questions mode, use AI to handle responses
      if (this.state.deductionFlow && this.state.step === 'questions') {
        return this.handleAIDeductionConversation(input);
      }

      // Autonomous tool chaining logic - ONLY run after employment status is selected
      if (this.state.extractedData && !this.state.hasRunToolChain && this.state.deductionFlow) {
        console.log('Running autonomous tool chain after employment status selected...');
        
        // Check if we have enough data for comprehensive analysis
        const hasBasicData = this.state.extractedData.gross_income && 
                           this.state.extractedData.income_tax_paid && 
                           this.state.extractedData.year;
        
        if (hasBasicData) {
          // Run the complete tool chain
          const toolChainResult = await this.runAutonomousToolChain();
          
          // If tool chain completed successfully, return the summary
          if (toolChainResult.success) {
            this.state.hasRunToolChain = true;
            return toolChainResult.summary || "Analysis completed. How can I help you further?";
          }
        }
      }

      // For all other cases, use the AI agent
      const result = await this.agent.invoke({
        input: input,
        state: this.state
      });

      console.log('Agent result:', result);
      
      // Update state based on AI response
      if (result.output) {
        // Check if AI wants to start deduction flow
        if (result.output.toLowerCase().includes('deduction') || 
            result.output.toLowerCase().includes('expense') ||
            result.output.toLowerCase().includes('question')) {
          this.state.step = 'questions';
        }
        
        // Check if AI completed the process
        if (result.output.toLowerCase().includes('summary') || 
            result.output.toLowerCase().includes('complete') ||
            result.output.toLowerCase().includes('refund')) {
          this.state.step = 'summary';
          this.state.isComplete = true;
        }
      }

      return result.output || "I'm here to help with your German tax filing. How can I assist you?";
      
    } catch (error) {
      console.error('Agent execution error:', error);
      
      // Only fall back to predefined flow if AI completely fails
      if (!this.state.extractedData) {
        return "I don't have your tax data yet. Please upload your tax documents first.";
      }
      
      return this.handleConversationFallback(input);
    }
  }

  private async runAutonomousToolChain(): Promise<{ success: boolean; summary?: string }> {
    try {
      // Use the runToolChain tool
      const toolChainTool = this.createTools().find(tool => tool.name === 'runToolChain');
      if (!toolChainTool) {
        console.error('runToolChain tool not found');
        return { success: false };
      }

      const result = await toolChainTool.func({ forceRun: false } as any);
      const parsedResult = JSON.parse(result);
      
      if (parsedResult.success) {
        console.log('Autonomous tool chain completed successfully');
        return { 
          success: true, 
          summary: parsedResult.summary 
        };
      } else {
        console.error('Tool chain failed:', parsedResult.error);
        return { success: false };
      }
    } catch (error) {
      console.error('Error running autonomous tool chain:', error);
      return { success: false };
    }
  }

  private handleInitialAnalysis(): string {
    if (!this.state.extractedData) {
      return "I don't see any tax data to analyze. Please upload your tax documents first.";
    }

    const { full_name, employer, gross_income, income_tax_paid, solidaritaetszuschlag, year, bruttolohn, lohnsteuer } = this.state.extractedData;
    
    // Use correct field names for calculations
    const actualGrossIncome = bruttolohn || gross_income || 0;
    const actualTaxPaid = lohnsteuer || income_tax_paid || 0;
    
    // Check tax threshold first
    const thresholdResult = this.checkTaxThreshold(actualGrossIncome, year);
    
    let response = `Here's what I found from your documents:

👤 **Name:** ${full_name || "N/A"}
🏢 **Employer:** ${employer || "N/A"}
💶 **Gross Income:** €${Number(actualGrossIncome).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
💰 **Lohnsteuer Paid:** €${Number(actualTaxPaid).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
${solidaritaetszuschlag ? `💸 **Solidarity Tax:** €${Number(solidaritaetszuschlag).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n` : ''}📅 **Detected Tax Year:** ${year || "Not specified"}

`;

    // If below threshold, show full refund message and STOP
    if (thresholdResult && thresholdResult.isBelowThreshold) {
      response += `🎉 **Great news!** Your income (€${Number(actualGrossIncome).toLocaleString('de-DE', { minimumFractionDigits: 2 })}) is below the tax-free threshold (€${thresholdResult.threshold.toLocaleString('de-DE')}) for ${year}.

You are eligible for a **full refund** of €${Number(actualTaxPaid).toLocaleString('de-DE', { minimumFractionDigits: 2 })}!

Would you like me to help you file for another year?`;
      
      // Mark as complete for below-threshold cases
      this.state.step = 'summary';
      this.state.isComplete = true;
      this.state.done = true;
    } else {
      // If above threshold, ONLY ask for employment status - NO refund calculations yet
      response += `You're above the tax-free threshold (€${thresholdResult?.threshold.toLocaleString('de-DE') || 'unknown'}) for ${year}.

Before we begin deductions, please select your employment status below.`;
      
      // Set step to questions to await employment status
      this.state.step = 'questions';
      // Ensure deductionFlow is undefined until employment status is selected
      this.state.deductionFlow = undefined;
    }

    return response;
  }

  private handleConversationFallback(input: string): string {
    const lastUserMessage = input.toLowerCase();
    
    // Track conversation step to prevent loops
    if (lastUserMessage.includes('yes') || lastUserMessage.includes('correct')) {
      if (!this.state.extractedData) {
        return "I don't have your tax data yet. Please upload your tax documents first.";
      }
      
      // If we're still in the initial confirmation step
      if (this.state.step === 'extract' || this.state.step === 'confirm') {
        const { year, gross_income, bruttolohn, income_tax_paid, lohnsteuer } = this.state.extractedData;
        const actualGrossIncome = bruttolohn || gross_income || 0;
        const actualTaxPaid = lohnsteuer || income_tax_paid || 0;
        
        // Use unified checkTaxThreshold method
        const thresholdResult = this.checkTaxThreshold(actualGrossIncome, year);
        
        if (thresholdResult && thresholdResult.isBelowThreshold) {
          this.state.step = 'summary';
          this.state.isComplete = true;
          this.state.done = true;
          return `Perfect! Since your income (€${Number(actualGrossIncome).toLocaleString('de-DE', { minimumFractionDigits: 2 })}) is below the tax-free threshold (€${thresholdResult.threshold.toLocaleString('de-DE')}) for ${year}, you are eligible for a **full refund** of €${Number(actualTaxPaid).toLocaleString('de-DE', { minimumFractionDigits: 2 })}!

Would you like me to help you file for another year?`;
        } else {
          this.state.step = 'questions';
          this.state.deductionFlow = undefined;
          return `You're above the tax-free threshold (€${thresholdResult?.threshold.toLocaleString('de-DE') || 'unknown'}) for ${year}.

Before we begin deductions, please select your employment status below.`;
        }
      } else if (this.state.step === 'questions') {
        // Handle deduction question responses
        return this.handleDeductionQuestionResponse(input);
      }
    } else if (lastUserMessage.includes('no') || lastUserMessage.includes('wrong')) {
      this.state.step = 'upload';
      return "Please upload the correct PDF for the year you want to file.";
    } else if (/^[1-4]$/.test(lastUserMessage) || ['bachelor', 'master', 'gradjob', 'fulltime'].includes(lastUserMessage)) {
      const status = /^[1-4]$/.test(lastUserMessage) ? 
        ['bachelor', 'master', 'gradjob', 'fulltime'][parseInt(lastUserMessage) - 1] : 
        lastUserMessage;
      
      // Use the new employment status handler
      return this.handleEmploymentStatusSelection(status as UserStatus);
    } else if (lastUserMessage.includes('proceed') || lastUserMessage.includes('deductions')) {
      if (this.state.deductionFlow) {
        this.state.step = 'questions';
        this.state.currentQuestionIndex = 0;
        return this.askNextDeductionQuestion();
      } else {
        return "I need to know your status first. Please select your status (1-4) or type bachelor/master/new_employee/full_time.";
      }
    } else {
      // Handle deduction question responses
      return this.handleDeductionQuestionResponse(input);
    }
    
    // Fallback return statement
    return "I'm here to help with your German tax filing. Please follow the conversation flow and let me know if you need any clarification.";
  }

  private handleDeductionQuestionResponse(input: string): string {
    if (!this.state.deductionFlow) {
      return "I need to set up your deduction flow first. Please select your status.";
    }

    const currentQuestion = this.state.deductionFlow.questions[this.state.currentQuestionIndex];
    if (!currentQuestion) {
      return this.getTaxCalculation({ 
        includeSummary: true, 
        includePersonalization: true, 
        format: 'markdown' 
      }) as string;
    }

    // Process the user's answer
    const answer = this.processDeductionAnswer(input, currentQuestion);
    this.state.deductionAnswers[currentQuestion.id] = answer;

    // Move to next question
    this.state.currentQuestionIndex++;

    // Check if we have more questions
    if (this.state.currentQuestionIndex < this.state.deductionFlow.questions.length) {
      return this.askNextDeductionQuestion();
    } else {
      // All questions answered, generate summary using unified method
      return this.getTaxCalculation({ 
        includeSummary: true, 
        includePersonalization: true, 
        format: 'markdown' 
      }) as string;
    }
  }

  private askNextDeductionQuestion(): string {
    if (!this.state.deductionFlow) {
      return "I need to set up your deduction flow first.";
    }

    const currentQuestion = this.state.deductionFlow.questions[this.state.currentQuestionIndex];
    if (!currentQuestion) {
      return this.getTaxCalculation({ 
        includeSummary: true, 
        includePersonalization: true, 
        format: 'markdown' 
      }) as string;
    }

    return `**Question ${this.state.currentQuestionIndex + 1} of ${this.state.deductionFlow.questions.length}:**

${currentQuestion.question}

Please answer with the amount in euros, or "no" if you don't have this expense.`;
  }

  private processDeductionAnswer(input: string, question: DeductionQuestion): DeductionAnswer {
    const cleanInput = input.toLowerCase().trim();
    
    // Check for "no" responses
    if (cleanInput.includes('no') || cleanInput === '0') {
      return {
        questionId: question.id,
        answer: false,
        amount: 0,
        details: 'No expense claimed'
      };
    }
    
    // Extract numeric amount
    const amountMatch = input.match(/(\d+(?:[.,]\d+)?)/);
    let amount = 0;
    let details = input;
    
    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(',', '.'));
      details = `Claimed: €${amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
    }
    
    // Cap the amount at the maximum allowed
    const maxAmount = question.maxAmount || 0;
    if (amount > maxAmount) {
      amount = maxAmount;
      details += ` (capped at maximum allowed)`;
    }
    
    return {
      questionId: question.id,
      answer: amount > 0,
      amount: amount,
      details: details
    };
  }



  /**
   * Set extracted tax data from PDF documents
   * 
   * Handles both ExtractedData objects and JSON strings for flexibility
   * Updates agent state and triggers autonomous analysis when basic data is available
   */
  setExtractedData(data: ExtractedData | string): void {
    let extractedData: ExtractedData;
    
    // Handle both ExtractedData objects and JSON strings
    if (typeof data === 'string') {
      try {
        extractedData = JSON.parse(data);
      } catch (error) {
        console.error('Failed to parse extracted data:', error);
        return;
      }
    } else {
      extractedData = data;
    }
    
    this.state.extractedData = extractedData;
    this.state.step = 'extract';
    
    this.state.debugLog.push({
      tool: 'setExtractedData',
      timestamp: new Date(),
      input: { dataType: typeof data, dataKeys: Object.keys(extractedData) },
      output: { success: true }
    });
    
    const hasBasicData = extractedData.gross_income && extractedData.income_tax_paid && extractedData.year;
    
    if (hasBasicData) {
      this.state.hasRunToolChain = false;
    }
    
    console.log('Data extracted:', {
      year: extractedData.year,
      gross_income: extractedData.gross_income,
      income_tax_paid: extractedData.income_tax_paid,
      employer: extractedData.employer,
      full_name: extractedData.full_name
    });
  }

  /**
   * Add a user message to the conversation history
   */
  addUserMessage(message: string): void {
    this.state.messages.push({ sender: 'user', text: message, timestamp: new Date() });
  }

  /**
   * Add an agent message to the conversation history
   */
  addAgentMessage(message: string): void {
    this.state.messages.push({ sender: 'assistant', text: message, timestamp: new Date() });
  }

  private buildInitialSummary(): string {
    if (!this.state.extractedData) {
      return "No data available to summarize.";
    }

    const { full_name, employer, gross_income, income_tax_paid, solidaritaetszuschlag, year } = this.state.extractedData;

    return `Here's what I found from your documents:

👤 **Name:** ${full_name || "N/A"}
🏢 **Employer:** ${employer || "N/A"}
💶 **Gross Income:** €${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
💰 **Lohnsteuer Paid:** €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
${solidaritaetszuschlag ? `💸 **Solidarity Tax:** €${Number(solidaritaetszuschlag).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n` : ''}📅 **Detected Tax Year:** ${year || "Not specified"}`;
  }

  /**
   * Check if taxable income is below the tax-free threshold for a given year
   * 
   * Returns detailed threshold information including the threshold amount,
   * whether income is below threshold, and the year being checked
   */
  checkTaxThreshold(taxableIncome?: number, year?: number): {
    isBelowThreshold: boolean;
    threshold: number;
    taxableIncome: number;
    year: number;
  } | null {
    if (!this.state.extractedData && !taxableIncome) {
      return null;
    }

    const checkYear = year || this.state.extractedData?.year || 2021;
    const checkTaxableIncome = taxableIncome ?? (this.state.extractedData?.bruttolohn || this.state.extractedData?.gross_income || 0);
    const threshold = PflegedAgent.TAX_FREE_THRESHOLDS[checkYear] || 10908;
    const isBelowThreshold = checkTaxableIncome <= threshold;
    
    const result = {
      isBelowThreshold,
      threshold,
      taxableIncome: checkTaxableIncome,
      year: checkYear
    };

    this.state.thresholdCheckResult = {
      isBelowThreshold,
      threshold,
      taxableIncome: checkTaxableIncome
    };

    console.log(`Threshold check: year=${checkYear}, income=${checkTaxableIncome}, threshold=${threshold}, isBelow=${isBelowThreshold}`);
    
    return result;
  }

  getState(): PflegedAgentState {
    return { ...this.state };
  }

  setUserId(userId: string, taxYear?: string) {
    this.state.userId = userId;
    this.state.taxYear = taxYear;
    // Automatically load user profile when userId is set
    this.loadUserProfile(userId, taxYear).then(profile => {
      this.state.userProfile = profile;
      console.log('User profile loaded:', profile);
    });
  }

  setUserProfile(profile: UserProfile) {
    this.state.userProfile = profile;
    console.log('User profile set:', profile);
  }

  async updateUserProfile(updates: Partial<UserProfile>): Promise<boolean> {
    try {
      if (!this.state.userId) {
        console.error('No userId available for profile update');
        return false;
      }

      const { data, error } = await this.supabase
        .from('user_profiles')
        .upsert({
          id: this.state.userId,
          tax_year: this.state.taxYear,
          ...updates,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error updating user profile:', error);
        return false;
      }

      // Update local state
      this.state.userProfile = data as UserProfile;
      console.log('User profile updated:', data);
      return true;
    } catch (error) {
      console.error('Error updating user profile:', error);
      return false;
    }
  }

  async saveTaxSummary(summary: string, refund: number): Promise<boolean> {
    try {
      if (!this.state.userId || !this.state.taxYear) {
        console.error('No userId or taxYear available for saving summary');
        return false;
      }

      const { data, error } = await this.supabase
        .from('tax_summaries')
        .upsert({
          user_id: this.state.userId,
          tax_year: this.state.taxYear,
          summary: summary,
          refund: refund,
          timestamp: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving tax summary:', error);
        return false;
      }

      console.log('Tax summary saved:', data);
      return true;
    } catch (error) {
      console.error('Error saving tax summary:', error);
      return false;
    }
  }

  async loadTaxSummary(taxYear: string): Promise<{ summary: string; refund: number } | null> {
    try {
      if (!this.state.userId) {
        console.error('No userId available for loading summary');
        return null;
      }

      const { data, error } = await this.supabase
        .from('tax_summaries')
        .select('*')
        .eq('user_id', this.state.userId)
        .eq('tax_year', taxYear)
        .single();

      if (error) {
        console.error('Error loading tax summary:', error);
        return null;
      }

      return {
        summary: data.summary,
        refund: data.refund
      };
    } catch (error) {
      console.error('Error loading tax summary:', error);
      return null;
    }
  }

  async getAvailableYears(): Promise<string[]> {
    try {
      if (!this.state.userId) {
        return [];
      }

      const { data, error } = await this.supabase
        .from('tax_summaries')
        .select('tax_year')
        .eq('user_id', this.state.userId)
        .order('tax_year', { ascending: false });

      if (error) {
        console.error('Error loading available years:', error);
        return [];
      }

      return data.map(row => row.tax_year);
    } catch (error) {
      console.error('Error loading available years:', error);
      return [];
    }
  }

  generateRefundExplanation(): string {
    if (!this.state.extractedData) {
      return "I don't have your tax data to explain the calculation. Please upload your tax documents first.";
    }

    // Use the unified getTaxCalculation method
    const calculation = this.getTaxCalculation() as TaxCalculation;
    if (!calculation) {
      return "I don't have your tax data to explain the calculation. Please upload your tax documents first.";
    }

    const { grossIncome, totalDeductions, taxableIncome, taxPaid, refund, year } = calculation;
    const threshold = year ? PflegedAgent.TAX_FREE_THRESHOLDS[year] : 10908;
    
    // Generate explanation based on threshold check
    let explanation = '';
    if (taxableIncome <= threshold) {
      explanation = `Since your taxable income (€${taxableIncome.toLocaleString('de-DE', { minimumFractionDigits: 2 })}) is below the tax-free threshold (€${threshold.toLocaleString('de-DE')}) for ${year}, you are eligible for a **full refund** of all taxes paid.`;
    } else {
      explanation = `Since your taxable income (€${taxableIncome.toLocaleString('de-DE', { minimumFractionDigits: 2 })}) is above the tax-free threshold (€${threshold.toLocaleString('de-DE')}) for ${year}, we calculate your refund as the difference between taxes paid and estimated tax liability.`;
    }

    // Build deductions breakdown
    const deductionsBreakdown = Object.values(this.state.deductionAnswers)
      .filter(a => a.answer && (a.amount || 0) > 0)
      .map(a => `- ${a.details}`);

    // Personalize explanation based on user profile
    let personalizedNote = '';
    if (this.state.userProfile) {
      const profile = this.state.userProfile;
      if (profile.job_type === 'freelancer') {
        personalizedNote = '\n\n💼 **Freelancer Note:** As a freelancer, you may be eligible for additional business-related deductions not included in this calculation.';
      } else if (profile.marital_status === 'married') {
        personalizedNote = '\n\n💑 **Married Filing Note:** Joint filing with your spouse may provide additional tax benefits not reflected in this individual calculation.';
      }
    }

    const explanationText = `# 📊 **Tax Refund Calculation Explanation**

## 1️⃣ **Income Analysis**
- **Gross Income:** €${Number(grossIncome || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
- **Tax Year:** ${year || 'Not specified'}

## 2️⃣ **Deductions Applied**
${deductionsBreakdown.length > 0 ? deductionsBreakdown.join('\n') : '- No deductions claimed'}

## 3️⃣ **Taxable Income Calculation**
- **Gross Income:** €${Number(grossIncome || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
- **Total Deductions:** €${totalDeductions.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
- **Taxable Income:** €${taxableIncome.toLocaleString('de-DE', { minimumFractionDigits: 2 })}

## 4️⃣ **Tax-Free Threshold Check**
- **Threshold for ${year}:** €${threshold.toLocaleString('de-DE')}
- **Your Taxable Income:** €${taxableIncome.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
- **Status:** ${taxableIncome <= threshold ? 'Below threshold' : 'Above threshold'}

## 5️⃣ **Tax Calculation**
- **Taxes Paid:** €${Number(taxPaid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
${taxableIncome > threshold ? `- **Estimated Tax Liability:** €${this.calculateGermanTax(taxableIncome, year).toLocaleString('de-DE', { minimumFractionDigits: 2 })}` : ''}

## 6️⃣ **Refund Calculation**
${explanation}

**Final Refund:** €${refund.toLocaleString('de-DE', { minimumFractionDigits: 2 })}${personalizedNote}

---
*This explanation is based on the information provided. For official calculations, please consult with a tax professional.*`;

    // Cache the explanation
    this.state.lastExplanation = explanationText;
    
    return explanationText;
  }

  addDeductionAnswer(questionId: string, answer: DeductionAnswer) {
    this.state.deductionAnswers[questionId] = answer;
  }

  /**
   * Handle employment status selection and start deduction flow
   */
  handleEmploymentStatusSelection(status: UserStatus): string {
    console.log('Employment status selected:', status);
    
    // Set the deduction flow based on status
    this.state.deductionFlow = this.deductionFlowMap[status];
    this.state.step = 'questions';
    this.state.currentQuestionIndex = 0;
    
    // Get status display name
    const statusDisplayNames = {
      bachelor: 'Bachelor Student',
      master: 'Master Student', 
      gradjob: 'Employed After Graduation',
      fulltime: 'Full-Time Employee'
    };
    
    const { bruttolohn, gross_income, lohnsteuer, income_tax_paid } = this.state.extractedData || {};
    const actualGrossIncome = bruttolohn || gross_income || 0;
    const actualTaxPaid = lohnsteuer || income_tax_paid || 0;
    
    return `Perfect! I've set your status as: **${statusDisplayNames[status]}**

Based on your extracted data, here's your tax summary:

**Tax Year:** ${this.state.extractedData?.year}
**Gross Income:** €${Number(actualGrossIncome).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
**Tax Paid:** €${Number(actualTaxPaid).toLocaleString('de-DE', { minimumFractionDigits: 2 })}

I'm now ready to help you with your tax filing. Let's start with the deduction questions:

${this.askNextDeductionQuestion()}`;
  }

  isComplete(): boolean {
    return this.state.isComplete;
  }

  getConversationHistory(): ConversationHistory[] {
    return this.state.messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));
  }

  getUserData(): UserData {
    if (!this.state.extractedData) {
      return {};
    }
    return {
      year: this.state.extractedData.year,
      gross_income: this.state.extractedData.gross_income,
      income_tax_paid: this.state.extractedData.income_tax_paid,
      employer: this.state.extractedData.employer,
      full_name: this.state.extractedData.full_name
    };
  }

  getDeductionAnswers(): DeductionAnswer[] {
    return Object.values(this.state.deductionAnswers);
  }

  // ============================================================================
  // TAX CALCULATION & SUMMARY GENERATION
  // ============================================================================
  
  /**
   * Calculate tax summary with deductions and refund estimation
   * 
   * Unified method that can return calculation data, formatted summary, or both
   * Supports personalization and multiple output formats
   */
  getTaxCalculation(options?: {
    includeSummary?: boolean;
    includePersonalization?: boolean;
    format?: 'json' | 'markdown' | 'both';
  }): TaxCalculation | string | { calculation: TaxCalculation; summary: string } | null {
    if (!this.state.extractedData) {
      return null;
    }

    // Calculate deductions
    const totalDeductions = Object.values(this.state.deductionAnswers)
      .filter(a => a.answer)
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    const { year, gross_income, income_tax_paid, bruttolohn, lohnsteuer } = this.state.extractedData;
    const actualGrossIncome = bruttolohn || gross_income || 0;
    const actualTaxPaid = lohnsteuer || income_tax_paid || 0;
    const taxableIncome = Math.max(0, actualGrossIncome - totalDeductions);
    const threshold = year ? PflegedAgent.TAX_FREE_THRESHOLDS[year] : 10908;
    
    // Check for Verlustvortrag (loss carryforward)
    const verlustvortrag = this.state.deductionAnswers['master_verlustvortrag']?.amount || 0;
    const finalTaxableIncome = Math.max(0, taxableIncome - verlustvortrag);
    
    // Calculate refund
    let refund = 0;
    if (finalTaxableIncome <= threshold) {
      refund = actualTaxPaid; // Full refund when below threshold
    } else {
      const estimatedTax = this.calculateGermanTax(finalTaxableIncome, year);
      refund = Math.max(0, actualTaxPaid - estimatedTax);
    }

    // Create calculation object
    const calculation: TaxCalculation = {
      grossIncome: actualGrossIncome,
      totalDeductions,
      taxableIncome: finalTaxableIncome,
      estimatedTax: finalTaxableIncome * 0.15,
      taxPaid: actualTaxPaid,
      refund,
      year: year || 0
    };

    // Update state
    this.state.taxCalculation = calculation;
    this.state.refundEstimate = refund;
    this.state.step = 'calculate';

    // Return based on options
    if (!options?.includeSummary) {
      return calculation;
    }

    // Generate summary if requested
    const summary = this.generateTaxSummary(calculation, options.includePersonalization);
    
    if (options.format === 'markdown') {
      return summary;
    } else if (options.format === 'both') {
      return { calculation, summary };
    } else {
      return calculation;
    }
  }

  /**
   * Generate a formatted tax summary with deductions and recommendations
   * 
   * Creates a comprehensive markdown summary including refund amount,
   * applied deductions, missing information, and personalized advice
   */
  private generateTaxSummary(calculation: TaxCalculation, includePersonalization: boolean = false): string {
    const { grossIncome, totalDeductions, taxableIncome, taxPaid, refund, year } = calculation;
    const threshold = year ? PflegedAgent.TAX_FREE_THRESHOLDS[year] : 10908;
    
    // Build deductions list
    const appliedDeductions = Object.values(this.state.deductionAnswers)
      .filter(a => a.answer && (a.amount || 0) > 0)
      .map(a => `- ${a.details}`);

    // Identify missing information
    const missingInfo = [];
    if (!this.state.extractedData?.full_name) missingInfo.push("Full name");
    if (!this.state.extractedData?.employer) missingInfo.push("Employer information");
    if (!year) missingInfo.push("Tax year confirmation");
    if (!taxPaid) missingInfo.push("Tax paid amount");

    // Generate recommended next steps
    const nextSteps = [];
    if (refund > 0) {
      nextSteps.push("File your tax return to claim your refund");
    }
    if (totalDeductions > 0) {
      nextSteps.push("Gather receipts for claimed deductions");
    }
    if (missingInfo.length > 0) {
      nextSteps.push("Provide missing information for accurate calculation");
    }
    if (!this.state.extractedData?.solidaritaetszuschlag) {
      nextSteps.push("Confirm solidarity tax amount if applicable");
    }

    // Generate required documents list
    const requiredDocs = [
      `${year || 'Current'} Lohnsteuerbescheinigung`,
      "Valid identification document"
    ];
    
    if (totalDeductions > 0) {
      requiredDocs.push("Receipts for claimed deductions");
    }
    if (this.state.deductionAnswers['bachelor_tuition']?.amount || 
        this.state.deductionAnswers['master_tuition']?.amount) {
      requiredDocs.push("University enrollment certificate");
    }
    if (this.state.deductionAnswers['bachelor_books']?.amount || 
        this.state.deductionAnswers['master_books']?.amount) {
      requiredDocs.push("Receipts for study materials");
    }

    // Generate personalized advice if requested
    let personalizedAdvice = '';
    if (includePersonalization && this.state.userProfile) {
      const profile = this.state.userProfile;
      
      if (profile.job_type === 'freelancer') {
        personalizedAdvice += '\n\n💼 **Freelancer-Specific Advice:**\n- Consider home office deductions for workspace expenses\n- Track all business-related travel and meals\n- Keep detailed records of professional development costs\n- Consider quarterly tax payments to avoid penalties';
      }
      
      if (profile.marital_status === 'married') {
        personalizedAdvice += '\n\n💑 **Married Filing Benefits:**\n- You may benefit from joint filing with your spouse\n- Consider income splitting strategies\n- Review spouse\'s income for joint deduction opportunities';
      }
      
      if (profile.age && profile.age < 25) {
        personalizedAdvice += '\n\n🎓 **Student-Specific Tips:**\n- You may be eligible for additional education credits\n- Consider claiming moving expenses if you relocated for studies\n- Review if you qualify for the "Ausbildungskosten" deduction';
      }
      
      if (profile.income_brackets === 'low') {
        personalizedAdvice += '\n\n💰 **Low Income Benefits:**\n- You may qualify for additional social benefits\n- Consider applying for "Arbeitslosengeld II" if applicable\n- Review eligibility for housing benefits';
      }
    }

    return `# 📊 **Tax Filing Summary**

## ✅ **Estimated Refund**
**€${refund.toLocaleString('de-DE', { minimumFractionDigits: 2 })}**

${refund > 0 ? '🎉 You are eligible for a tax refund!' : 'No refund available.'}

## 📉 **Deductions Applied**
${appliedDeductions.length > 0 ? appliedDeductions.join('\n') : '- No deductions applied'}

## 📎 **Missing or Incomplete Information**
${missingInfo.length > 0 ? missingInfo.map(item => `- ${item}`).join('\n') : '- All required information provided'}

## 📝 **Recommended Next Steps**
${nextSteps.map(step => `- ${step}`).join('\n')}

## 📂 **Required Documents**
${requiredDocs.map(doc => `- ${doc}`).join('\n')}${personalizedAdvice}

---
*This summary is based on the information provided. For official filing, please consult with a tax professional.*`;
  }

  /**
   * Calculate German progressive tax based on taxable income and year
   * 
   * Implements the German tax brackets with proper progressive rates
   * Falls back to simplified calculation for unsupported years
   */
  private calculateGermanTax(taxableIncome: number, year: number | undefined): number {
    // German progressive tax calculation for 2021
    if (year === 2021) {
      if (taxableIncome <= 9744) return 0;
      if (taxableIncome <= 14753) return (taxableIncome - 9744) * 0.14;
      if (taxableIncome <= 57918) return 701.26 + (taxableIncome - 14753) * 0.42;
      if (taxableIncome <= 274612) return 18149.26 + (taxableIncome - 57918) * 0.42;
      return 113839.26 + (taxableIncome - 274612) * 0.45;
    }
    
    // Default simplified calculation for other years
    return Math.max(0, taxableIncome * 0.15);
  }

  // ============================================================================
  // AI CONVERSATION HANDLING
  // ============================================================================
  
  /**
   * Handle AI-powered deduction conversation
   * 
   * Uses AI to analyze user responses and determine next actions
   * Automatically processes amounts and moves through deduction questions
   */
  private async handleAIDeductionConversation(input: string): Promise<string> {
    try {
      // Use AI to analyze the user's response and determine next action
      const aiPrompt = `You are a German tax advisor helping with deduction questions. 
      
Current context:
- User status: ${this.state.deductionFlow?.status || 'unknown'}
- Current question index: ${this.state.currentQuestionIndex}
- Total questions: ${this.state.deductionFlow?.questions.length || 0}
- User's response: "${input}"

Analyze the user's response and:
1. If they provided an amount (like "3200" or "yes 100"), extract the amount and confirm
2. If they said "no", acknowledge and move to next question
3. If they asked for clarification, provide helpful explanation
4. If they want to skip or have concerns, address them naturally

Respond in a conversational, helpful manner. Don't just ask the next question - engage with their response first.`;

      const result = await this.agent.invoke({
        input: aiPrompt,
        state: this.state
      });

      // Process the AI response and update state
      const response = result.output || "";
      
      // Extract amount if user provided one
      const amountMatch = input.match(/(\d+(?:[.,]\d+)?)/);
      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(',', '.'));
        const currentQuestion = this.state.deductionFlow?.questions[this.state.currentQuestionIndex];
        if (currentQuestion) {
          this.state.deductionAnswers[currentQuestion.id] = {
            questionId: currentQuestion.id,
            answer: true,
            amount: amount,
            details: `Claimed: €${amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
          };
        }
      } else if (input.toLowerCase().includes('no')) {
        const currentQuestion = this.state.deductionFlow?.questions[this.state.currentQuestionIndex];
        if (currentQuestion) {
          this.state.deductionAnswers[currentQuestion.id] = {
            questionId: currentQuestion.id,
            answer: false,
            amount: 0,
            details: 'No expense claimed'
          };
        }
      }

      // Move to next question if we processed an answer
      if (amountMatch || input.toLowerCase().includes('no')) {
        this.state.currentQuestionIndex++;
        
        // Check if we have more questions
        if (this.state.currentQuestionIndex < (this.state.deductionFlow?.questions.length || 0)) {
          const nextQuestion = this.state.deductionFlow?.questions[this.state.currentQuestionIndex];
          return `${response}

**Next Question:**
${nextQuestion?.question}

Please answer with the amount in euros, or "no" if you don't have this expense.`;
        } else {
          // All questions answered, generate summary using unified method
          const summary = this.getTaxCalculation({ 
            includeSummary: true, 
            includePersonalization: true, 
            format: 'markdown' 
          }) as string;
          
          return `${response}

${summary}`;
        }
      }

      return response;
      
    } catch (error) {
      console.error('AI deduction conversation error:', error);
      return this.handleConversationFallback(input);
    }
  }
} 