import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { 
  ExtractedData, 
  UserData, 
  ConversationHistory, 
  UserStatus, 
  DeductionQuestion, 
  DeductionAnswer, 
  DeductionFlow, 
  TaxCalculation, 
  DeductionSummary,
  TaxAdvisorState
} from '@/types';

export interface PflegedAgentState {
  conversationId: string;
  userId?: string;
  extractedData?: ExtractedData;
  deductionAnswers: Record<string, DeductionAnswer>;
  currentQuestionIndex: number;
  deductionFlow?: DeductionFlow;
  taxCalculation?: TaxCalculation;
  lossCarryforward?: {
    used: number;
    remaining: number;
  };
  isComplete: boolean;
  messages: Array<{ sender: 'user' | 'assistant'; text: string; timestamp: Date }>;
  step: 'upload' | 'extract' | 'confirm' | 'questions' | 'calculate' | 'summary';
  done: boolean;
}

export class PflegedAgent {
  private llm: ChatOpenAI;
  private agentExecutor: AgentExecutor | null = null;
  private state: PflegedAgentState;

  // Tax-free thresholds by year
  private static readonly TAX_FREE_THRESHOLDS: Record<number, number> = {
    2021: 9744,
    2022: 10347,
    2023: 10908,
    2024: 10908,
    2025: 11280,
    2026: 11640
  };

  // Enhanced deduction flows from taxAdvisor.ts
  private readonly deductionFlowMap: Record<UserStatus, DeductionFlow> = {
    bachelor: {
      status: 'bachelor',
      questions: [
        {
          id: 'bachelor_tuition',
          question: 'Did you pay tuition fees for your bachelor studies?',
          category: 'Education',
          maxAmount: 6000
        },
        {
          id: 'bachelor_books',
          question: 'Did you purchase books, study materials, or equipment for your studies?',
          category: 'Education',
          maxAmount: 1000
        },
        {
          id: 'bachelor_travel',
          question: 'Did you have travel expenses for your studies (commuting, field trips)?',
          category: 'Travel',
          maxAmount: 4500
        },
        {
          id: 'bachelor_work',
          question: 'Did you have work-related expenses (internships, part-time work)?',
          category: 'Work',
          maxAmount: 1000
        }
      ],
      order: ['bachelor_tuition', 'bachelor_books', 'bachelor_travel', 'bachelor_work']
    },
    master: {
      status: 'master',
      questions: [
        {
          id: 'master_tuition',
          question: 'Did you pay tuition fees for your master studies?',
          category: 'Education',
          maxAmount: 6000
        },
        {
          id: 'master_books',
          question: 'Did you purchase books, study materials, or equipment for your studies?',
          category: 'Education',
          maxAmount: 1000
        },
        {
          id: 'master_travel',
          question: 'Did you have travel expenses for your studies (commuting, field trips)?',
          category: 'Travel',
          maxAmount: 4500
        },
        {
          id: 'master_work',
          question: 'Did you have work-related expenses (internships, part-time work)?',
          category: 'Work',
          maxAmount: 1000
        },
        {
          id: 'master_research',
          question: 'Did you have research-related expenses (conferences, publications)?',
          category: 'Research',
          maxAmount: 2000
        },
        {
          id: 'master_verlustvortrag',
          question: 'Do you have any loss carryforward (Verlustvortrag) from previous years? This is crucial for master\'s students who may have had losses during bachelor studies.',
          category: 'Loss Carryforward',
          maxAmount: 10000
        }
      ],
      order: ['master_tuition', 'master_books', 'master_travel', 'master_work', 'master_research', 'master_verlustvortrag']
    },
    new_employee: {
      status: 'new_employee',
      questions: [
        {
          id: 'new_work_tools',
          question: 'Did you purchase work-related tools, equipment, or software?',
          category: 'Work',
          maxAmount: 1000
        },
        {
          id: 'new_commuting',
          question: 'Did you have commuting expenses to your new workplace?',
          category: 'Travel',
          maxAmount: 4500
        },
        {
          id: 'new_work_clothes',
          question: 'Did you purchase work-specific clothing or uniforms?',
          category: 'Work',
          maxAmount: 500
        },
        {
          id: 'new_education',
          question: 'Did you take any courses or training for your new job?',
          category: 'Education',
          maxAmount: 1000
        }
      ],
      order: ['new_work_tools', 'new_commuting', 'new_work_clothes', 'new_education']
    },
    full_time: {
      status: 'full_time',
      questions: [
        {
          id: 'full_work_tools',
          question: 'Did you purchase work-related tools, equipment, or software?',
          category: 'Work',
          maxAmount: 1000
        },
        {
          id: 'full_commuting',
          question: 'Did you have commuting expenses to your workplace?',
          category: 'Travel',
          maxAmount: 4500
        },
        {
          id: 'full_work_clothes',
          question: 'Did you purchase work-specific clothing or uniforms?',
          category: 'Work',
          maxAmount: 500
        },
        {
          id: 'full_education',
          question: 'Did you take any courses or training for your job?',
          category: 'Education',
          maxAmount: 1000
        },
        {
          id: 'full_home_office',
          question: 'Did you have home office expenses (furniture, equipment)?',
          category: 'Work',
          maxAmount: 1250
        }
      ],
      order: ['full_work_tools', 'full_commuting', 'full_work_clothes', 'full_education', 'full_home_office']
    }
  };

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2000,
    });

    this.state = {
      conversationId: this.generateConversationId(),
      deductionAnswers: {},
      currentQuestionIndex: 0,
      isComplete: false,
      messages: [],
      step: 'upload',
      done: false
    };
  }

  private generateConversationId(): string {
    return `pfleged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

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
            const data = JSON.parse(input.data);
            this.state.extractedData = data;
            this.state.step = 'extract';
            
            return JSON.stringify({
              success: true,
              data: data,
              message: 'Tax data analyzed successfully'
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
            // Calculate tax summary directly
            const totalDeductions = input.deductions.reduce((sum, d) => sum + d.amount, 0);
            const taxableIncome = Math.max(0, input.grossIncome - totalDeductions);
            const year = this.state.extractedData?.year || 2021;
            const threshold = PflegedAgent.TAX_FREE_THRESHOLDS[year] || 10908;
            
            // Check for Verlustvortrag (loss carryforward)
            const verlustvortrag = this.state.deductionAnswers['master_verlustvortrag']?.amount || 0;
            const finalTaxableIncome = Math.max(0, taxableIncome - verlustvortrag);
            
            // REFUND FIRST LOGIC: If taxable income is below threshold, full refund
            let refund = 0;
            if (finalTaxableIncome <= threshold) {
              refund = input.taxPaid; // Full refund when below threshold
            } else {
              // If above threshold, calculate proper German tax
              const estimatedTax = this.calculateGermanTax(finalTaxableIncome, year);
              refund = Math.max(0, input.taxPaid - estimatedTax);
            }

            const summary = {
              grossIncome: input.grossIncome,
              totalDeductions,
              taxableIncome: finalTaxableIncome,
              estimatedTax: finalTaxableIncome * 0.15,
              taxPaid: input.taxPaid,
              refund,
              year
            };

            this.state.taxCalculation = summary;
            this.state.step = 'calculate';
            
            return JSON.stringify({
              success: true,
              summary: summary,
              message: 'Tax calculation completed'
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Calculation failed'
            });
          }
        }
      }),

      new DynamicStructuredTool({
        name: 'askDeductionQuestions',
        description: 'Ask relevant deduction questions based on user status',
        schema: z.object({
          status: z.enum(['bachelor', 'master', 'new_employee', 'full_time']).describe('User status'),
          currentQuestion: z.number().describe('Current question index')
        }),
        func: async (input) => {
          try {
            this.state.deductionFlow = this.deductionFlowMap[input.status];
            this.state.currentQuestionIndex = input.currentQuestion;
            this.state.step = 'questions';

            const currentQuestion = this.state.deductionFlow.questions[input.currentQuestion];
            
            return JSON.stringify({
              success: true,
              question: currentQuestion,
              progress: `${input.currentQuestion + 1}/${this.state.deductionFlow.questions.length}`,
              message: `Question ${input.currentQuestion + 1} of ${this.state.deductionFlow.questions.length}`
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get question'
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
        name: 'generateFinalSummary',
        description: 'Generate final tax filing summary with JSON and explanation',
        schema: z.object({
          userId: z.string().describe('User ID'),
          year: z.number().describe('Tax year'),
          includeJson: z.boolean().describe('Include JSON output')
        }),
        func: async (input) => {
          try {
            // Calculate tax summary directly
            const totalDeductions = Object.values(this.state.deductionAnswers)
              .filter(a => a.answer)
              .reduce((sum, a) => sum + (a.amount || 0), 0);

            if (!this.state.extractedData) {
              throw new Error('No extracted data available');
            }

            const grossIncome = this.state.extractedData.gross_income || 0;
            const taxableIncome = Math.max(0, grossIncome - totalDeductions);
            const taxPaid = this.state.extractedData.income_tax_paid || 0;
            const year = this.state.extractedData.year;
            const threshold = year ? PflegedAgent.TAX_FREE_THRESHOLDS[year] : 0;
            
            // Check for Verlustvortrag (loss carryforward)
            const verlustvortrag = this.state.deductionAnswers['master_verlustvortrag']?.amount || 0;
            const finalTaxableIncome = Math.max(0, taxableIncome - verlustvortrag);
            
            // REFUND FIRST LOGIC: If taxable income is below threshold, full refund
            let refund = 0;
            if (finalTaxableIncome <= threshold) {
              refund = taxPaid; // Full refund when below threshold
            } else {
              // If above threshold, calculate proper German tax
              const estimatedTax = this.calculateGermanTax(finalTaxableIncome, year);
              refund = Math.max(0, taxPaid - estimatedTax);
            }

            const summary = {
              grossIncome,
              totalDeductions,
              taxableIncome: finalTaxableIncome,
              estimatedTax: finalTaxableIncome * 0.15,
              taxPaid,
              refund,
              year: year || 0
            };

            this.state.taxCalculation = summary;
            this.state.step = 'summary';
            this.state.isComplete = true;
            
            const finalSummary = {
              user_id: input.userId,
              tax_year: input.year,
              gross_income: grossIncome,
              tax_paid: taxPaid,
              taxable_income: finalTaxableIncome,
              total_deductions: totalDeductions,
              loss_carryforward_used: verlustvortrag,
              loss_carryforward_remaining: 0, // Will be calculated based on previous year
              estimated_refund: refund,
              refund_type: finalTaxableIncome <= threshold ? 'full' : (refund > 0 ? 'partial' : 'none'),
              refund_reason: this.generateRefundReason(summary),
              filing_date: new Date().toISOString().split('T')[0]
            };

            // Store summary in memory (Supabase integration removed for now)
            console.log('Tax filing summary generated:', finalSummary);

            return JSON.stringify({
              success: true,
              summary: finalSummary,
              json: input.includeJson ? finalSummary : undefined,
              message: 'Tax filing summary generated and stored'
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to generate summary'
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
              done: false
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
        name: 'checkTaxThreshold',
        description: 'Check if income is below tax-free threshold for the year',
        schema: z.object({
          income: z.number().describe('Gross income in euros'),
          year: z.number().describe('Tax year')
        }),
        func: async (input) => {
          try {
            const threshold = PflegedAgent.TAX_FREE_THRESHOLDS[input.year];
            const isBelow = threshold !== undefined && input.income < threshold;
            
            return JSON.stringify({
              success: true,
              isBelowThreshold: isBelow,
              threshold: threshold,
              income: input.income,
              year: input.year,
              message: isBelow 
                ? `Income (€${input.income}) is below threshold (€${threshold}) - full refund applies`
                : `Income (€${input.income}) is above threshold (€${threshold}) - partial refund calculation needed`
            });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to check threshold'
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
    return ChatPromptTemplate.fromMessages([
      ['system', `You are Pfleged, an expert German tax advisor with deep knowledge of German tax law, deductions, and filing procedures. You guide users through their tax filing process with intelligence, empathy, and accuracy.

Your core responsibilities:
1. **Analyze extracted tax data** - Use analyzeExtractedData tool when user uploads documents
2. **Provide intelligent insights** - Explain what you found and what it means for their tax situation
3. **Guide through deductions** - Use askDeductionQuestions tool for personalized deduction questions
4. **Calculate refunds** - Use calculateTaxSummary tool to determine refunds and estimates
5. **Handle complex scenarios** - Use applyLossCarryforward tool for previous year losses
6. **Maintain conversation flow** - Keep the conversation natural and helpful

**Key German Tax Knowledge:**
- Tax-free thresholds by year (2021: €9,744, 2022: €10,347, 2023: €10,908)
- Common deductions: Werbungskosten, Sonderausgaben, Vorsorgeaufwendungen
- Student deductions: Tuition fees, books, travel, work-related expenses
- Employee deductions: Work tools, commuting, home office, professional development
- Loss carryforward (Verlustvortrag) for students with previous losses

**Conversation Style:**
- Be professional but friendly
- Explain complex tax concepts simply
- Ask one question at a time
- Provide clear next steps
- Show empathy for tax filing stress
- Use German tax terminology appropriately

**IMPORTANT: Always use tools when appropriate:**
- When user uploads documents → Use analyzeExtractedData
- When user asks about calculations → Use calculateTaxSummary
- When user needs deduction questions → Use askDeductionQuestions
- When user has previous losses → Use applyLossCarryforward
- When generating final summary → Use generateFinalSummary

**Current Session Context:**
- Conversation ID: ${this.state.conversationId}
- User ID: ${this.state.userId || 'Not set'}
- Extracted Data: ${this.state.extractedData ? 'Available' : 'Not available'}
- Questions Answered: ${this.state.currentQuestionIndex}
- Deduction Flow: ${this.state.deductionFlow ? this.state.deductionFlow.status : 'Not set'}
- Current Step: ${this.state.step}
- Conversation History: ${this.state.messages.length} messages

**Always:**
- Use tools for calculations and data operations
- Provide accurate German tax advice
- Be helpful, professional, and empathetic
- Guide users step-by-step through their tax filing
- Explain the reasoning behind your recommendations`],
      ['human', '{input}'],
      ['human', '{agent_scratchpad}']
    ]);
  }

  async initialize() {
    try {
      const tools = this.createTools();
      const prompt = this.createPrompt();

      const agent = await createOpenAIFunctionsAgent({
        llm: this.llm,
        tools: tools as any, // Type assertion to fix linter error
        prompt
      });

      this.agentExecutor = new AgentExecutor({
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
    if (!this.agentExecutor) {
      await this.initialize();
    }

    try {
      // Add user message to state
      this.state.messages.push({
        sender: 'user',
        text: input,
        timestamp: new Date()
      });

      console.log('Running agent with input:', input);
      console.log('Agent state before execution:', {
        extractedData: this.state.extractedData ? 'Available' : 'Not available',
        messagesCount: this.state.messages.length,
        step: this.state.step
      });

      // For initial analysis, use a more direct approach
      if (input.toLowerCase().includes('analyze') || input.toLowerCase().includes('initial')) {
        console.log('Using direct analysis approach');
        return this.handleInitialAnalysis();
      }

      // Run agent with explicit tool usage guidance
      const enhancedInput = `${input}

IMPORTANT: Use the available tools to help the user. If they're asking about tax data, use analyzeExtractedData. If they're asking about calculations, use calculateTaxSummary. If they're asking about deductions, use askDeductionQuestions. Always provide helpful, professional German tax advice.`;

      console.log('Enhanced input for agent:', enhancedInput);

      const result = await this.agentExecutor!.invoke({
        input: enhancedInput
      });

      console.log('Agent execution result:', result);

      // Add agent response to state
      this.state.messages.push({
        sender: 'assistant',
        text: result.output,
        timestamp: new Date()
      });

      return result.output;
    } catch (error) {
      console.error('Agent execution error:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack'
      });
      
      // Log error to console instead of Supabase
      console.error('Agent execution failed:', error instanceof Error ? error.message : 'Unknown error');

      // Provide a more helpful fallback response based on the input
      if (input.toLowerCase().includes('analyze') || input.toLowerCase().includes('initial')) {
        return this.handleInitialAnalysis();
      } else {
        return this.handleConversationFallback(input);
      }
    }
  }

  private handleInitialAnalysis(): string {
    if (!this.state.extractedData) {
      return "I don't see any tax data to analyze. Please upload your tax documents first.";
    }

    const { full_name, employer, gross_income, income_tax_paid, solidaritaetszuschlag, year } = this.state.extractedData;
    
    let response = `Here's what I found from your documents:

👤 **Name:** ${full_name || "N/A"}
🏢 **Employer:** ${employer || "N/A"}
💶 **Gross Income:** €${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
💰 **Lohnsteuer Paid:** €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
${solidaritaetszuschlag ? `💸 **Solidarity Tax:** €${Number(solidaritaetszuschlag).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n` : ''}📅 **Detected Tax Year:** ${year || "Not specified"}

Can you please confirm that the tax year you want to file is ${year}? (yes/no)

If this is correct, I'll help you with your tax filing process. If not, please upload the correct PDF for the year you want to file.`;

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
        this.state.step = 'questions';
        const { year, gross_income } = this.state.extractedData;
        const threshold = year ? PflegedAgent.TAX_FREE_THRESHOLDS[year] : 10908;
        
        if (gross_income && gross_income < threshold) {
          this.state.step = 'summary';
          return `Perfect! Since your income (€${Number(gross_income).toLocaleString('de-DE', { minimumFractionDigits: 2 })}) is below the tax-free threshold (€${threshold.toLocaleString('de-DE')}) for ${year}, you are eligible for a **full refund** of your tax paid.

Would you like me to help you file for another year?`;
        } else {
          return `Since your income exceeds the tax-free threshold, let's check for deductible expenses to reduce your taxable income.

Please select your status for the year:
1. **bachelor** (Bachelor's student)
2. **master** (Master's student)  
3. **new_employee** (Started job after graduation)
4. **full_time** (Full-time employee)`;
        }
      } else if (this.state.step === 'questions') {
        // User confirmed they want to proceed with deductions
        return `Great! Let's start with your deduction questions. I'll ask you about various expenses that might be deductible.

First, let me ask about your education expenses. Did you pay any tuition fees for your studies? (yes/no)`;
      }
    } else if (lastUserMessage.includes('no') || lastUserMessage.includes('wrong')) {
      this.state.step = 'upload';
      return "Please upload the correct PDF for the year you want to file.";
    } else if (/^[1-4]$/.test(lastUserMessage) || ['bachelor', 'master', 'new_employee', 'full_time'].includes(lastUserMessage)) {
      const status = /^[1-4]$/.test(lastUserMessage) ? 
        ['bachelor', 'master', 'new_employee', 'full_time'][parseInt(lastUserMessage) - 1] : 
        lastUserMessage;
      
      // Set the deduction flow based on status
      this.state.deductionFlow = this.deductionFlowMap[status as UserStatus];
      this.state.step = 'questions';
      
      return `Perfect! I've set your status as: **${status.toUpperCase()}**

Based on your extracted data, here's your tax summary:

**Tax Year:** ${this.state.extractedData?.year}
**Gross Income:** €${Number(this.state.extractedData?.gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
**Tax Paid:** €${Number(this.state.extractedData?.income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}

I'm now ready to help you with your tax filing. Would you like to proceed with deductions? (yes/no)`;
    } else if (lastUserMessage.includes('proceed') || lastUserMessage.includes('deductions')) {
      if (this.state.deductionFlow) {
        this.state.step = 'questions';
        const firstQuestion = this.state.deductionFlow.questions[0];
        return `Great! Let's start with your deduction questions. 

**${firstQuestion.question}**

Please answer with the amount in euros, or "no" if you don't have this expense.`;
      } else {
        return "I need to know your status first. Please select your status (1-4) or type bachelor/master/new_employee/full_time.";
      }
    } else {
      return "I'm here to help with your German tax filing. Please follow the conversation flow and let me know if you need any clarification.";
    }
    
    // Fallback return statement
    return "I'm here to help with your German tax filing. Please follow the conversation flow and let me know if you need any clarification.";
  }

  // Enhanced methods from taxAdvisor.ts
  setExtractedData(data: ExtractedData): void {
    this.state.extractedData = data;
    this.state.step = 'extract';
    console.log('Data extracted:', {
      year: data.year,
      gross_income: data.gross_income,
      income_tax_paid: data.income_tax_paid,
      employer: data.employer,
      full_name: data.full_name
    });
  }

  addUserMessage(message: string): void {
    this.state.messages.push({ sender: 'user', text: message, timestamp: new Date() });
  }

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

  private isBelowThreshold(): boolean {
    if (!this.state.extractedData) return false;
    
    const year = this.state.extractedData.year;
    const grossIncome = this.state.extractedData.gross_income || 0;
    
    if (!year) return false;
    
    const threshold = PflegedAgent.TAX_FREE_THRESHOLDS[year];
    console.log(`Threshold check: year=${year}, income=${grossIncome}, threshold=${threshold}, isBelow=${threshold !== undefined && grossIncome < threshold}`);
    return threshold !== undefined && grossIncome < threshold;
  }

  getState(): PflegedAgentState {
    return { ...this.state };
  }

  setUserId(userId: string) {
    this.state.userId = userId;
  }

  addDeductionAnswer(questionId: string, answer: DeductionAnswer) {
    this.state.deductionAnswers[questionId] = answer;
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

  getTaxCalculation(): TaxCalculation | null {
    if (!this.state.taxCalculation) {
      // Calculate based on current state
      const totalDeductions = Object.values(this.state.deductionAnswers)
        .filter(a => a.answer)
        .reduce((sum, a) => sum + (a.amount || 0), 0);

      if (!this.state.extractedData) {
        return null;
      }

      const grossIncome = this.state.extractedData.gross_income || 0;
      const taxableIncome = Math.max(0, grossIncome - totalDeductions);
      const taxPaid = this.state.extractedData.income_tax_paid || 0;
      const year = this.state.extractedData.year;
      const threshold = year ? PflegedAgent.TAX_FREE_THRESHOLDS[year] : 0;
      
      // Check for Verlustvortrag (loss carryforward)
      const verlustvortrag = this.state.deductionAnswers['master_verlustvortrag']?.amount || 0;
      const finalTaxableIncome = Math.max(0, taxableIncome - verlustvortrag);
      
      // REFUND FIRST LOGIC: If taxable income is below threshold, full refund
      let refund = 0;
      if (finalTaxableIncome <= threshold) {
        refund = taxPaid; // Full refund when below threshold
      } else {
        // If above threshold, calculate proper German tax
        const estimatedTax = this.calculateGermanTax(finalTaxableIncome, year);
        refund = Math.max(0, taxPaid - estimatedTax);
      }

      this.state.taxCalculation = {
        grossIncome,
        totalDeductions,
        taxableIncome: finalTaxableIncome,
        estimatedTax: finalTaxableIncome * 0.15,
        taxPaid,
        refund,
        year: year || 0
      };
    }
    return this.state.taxCalculation;
  }

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

  reset(): void {
    this.state = {
      conversationId: this.generateConversationId(),
      deductionAnswers: {},
      currentQuestionIndex: 0,
      isComplete: false,
      messages: [],
      step: 'upload',
      done: false
    };
  }

  private resetForNewYear(): void {
    // Reset state for new year but preserve conversation ID
    const conversationId = this.state.conversationId;
    
    this.state = {
      conversationId,
      userId: this.state.userId,
      deductionAnswers: {},
      currentQuestionIndex: 0,
      isComplete: false,
      messages: [],
      step: 'upload',
      done: false
    };
    
    console.log('State reset for new year. Conversation ID preserved:', conversationId);
  }
} 