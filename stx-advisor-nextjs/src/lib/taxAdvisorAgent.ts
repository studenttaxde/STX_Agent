import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
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
import { TaxAdvisor } from './taxAdvisor';
import { supabase } from './supabase';
import { SupabaseService } from './supabaseService';

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
        name: 'parseTaxPdf',
        description: 'Extract tax data from uploaded PDF documents',
        schema: z.object({
          fileData: z.string().describe('Base64 encoded PDF data or file path')
        }),
        func: async (input) => {
          try {
            // Call the existing PDF extraction API
            const response = await fetch('/api/extract-pdfs', {
              method: 'POST',
              body: JSON.stringify({ files: [input.fileData] }),
              headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
              throw new Error(`PDF extraction failed: ${response.status}`);
            }

            const result = await response.json();
            this.state.extractedData = result.data;
            this.state.step = 'extract';
            
            return JSON.stringify({
              success: true,
              data: result.data,
              message: 'PDF data extracted successfully'
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
            const taxAdvisor = new TaxAdvisor();
            taxAdvisor.setExtractedData({
              gross_income: input.grossIncome,
              income_tax_paid: input.taxPaid,
              year: 2021, // Default year
              employer: 'Unknown',
              full_name: 'User'
            });

            // Add deductions to state
            input.deductions.forEach(deduction => {
              this.state.deductionAnswers[deduction.category] = {
                questionId: deduction.category,
                answer: true,
                amount: deduction.amount,
                details: `${deduction.category} deduction`
              };
            });

            const summary = taxAdvisor.getTaxCalculation();
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
            // Get loss carryforward from Supabase
            const { data: lossData, error } = await supabase
              .from('user_tax_data')
              .select('loss_carryforward, loss_carryforward_used, loss_carryforward_remaining')
              .eq('user_id', input.userId)
              .eq('tax_year', input.year - 1)
              .single();

            if (error) {
              console.error('Error fetching loss carryforward:', error);
              return JSON.stringify({
                success: false,
                error: 'Failed to fetch loss carryforward data'
              });
            }

            const availableLoss = lossData?.loss_carryforward_remaining || 0;
            const appliedLoss = Math.min(availableLoss, input.amount);
            const remainingLoss = availableLoss - appliedLoss;

            this.state.lossCarryforward = {
              used: appliedLoss,
              remaining: remainingLoss
            };

            // Update Supabase with used loss carryforward
            await supabase
              .from('user_tax_data')
              .upsert({
                user_id: input.userId,
                tax_year: input.year,
                loss_carryforward_used: appliedLoss,
                loss_carryforward_remaining: remainingLoss
              });

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
            const taxAdvisor = new TaxAdvisor();
            
            if (this.state.extractedData) {
              taxAdvisor.setExtractedData(this.state.extractedData);
            }

            // Add deduction answers to advisor
            Object.values(this.state.deductionAnswers).forEach(answer => {
              // This would need to be implemented in TaxAdvisor
            });

            const summary = taxAdvisor.getTaxCalculation();
            this.state.step = 'summary';
            this.state.isComplete = true;
            
            const finalSummary = {
              user_id: input.userId,
              tax_year: input.year,
              gross_income: summary?.grossIncome || 0,
              tax_paid: summary?.taxPaid || 0,
              taxable_income: summary?.taxableIncome || 0,
              total_deductions: summary?.totalDeductions || 0,
              loss_carryforward_used: this.state.lossCarryforward?.used || 0,
              loss_carryforward_remaining: this.state.lossCarryforward?.remaining || 0,
              estimated_refund: summary?.refund || 0,
              refund_type: summary?.refund === summary?.taxPaid ? 'full' : 'partial',
              refund_reason: this.generateRefundReason(summary),
              filing_date: new Date().toISOString().split('T')[0]
            };

            // Store in Supabase
            await supabase
              .from('user_tax_data')
              .upsert({
                user_id: input.userId,
                tax_year: input.year,
                filing_json: finalSummary,
                agent_notes: `Processed by Pfleged agent on ${new Date().toISOString()}`
              });

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
            // Store current year data if needed
            if (input.preserveData && this.state.extractedData) {
              await supabase
                .from('user_tax_data')
                .upsert({
                  user_id: input.userId,
                  tax_year: this.state.extractedData.year,
                  filing_json: {
                    conversation_id: this.state.conversationId,
                    completed_at: new Date().toISOString()
                  }
                });
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
      ['system', `You are Pfleged, a seasoned and smart German tax advisor. You guide users step-by-step through filing their returns.

Your goals:
1. Extract correct tax data from PDFs (via internal tools)
2. Ask minimal but powerful deduction questions
3. If taxable income < threshold → full refund
4. Else, use proper brackets to calculate estimated refund
5. Apply any loss carryforward if available
6. Output a clean JSON object + human explanation
7. Store final results in Supabase
8. If user wants to continue, file next year

Keep things simple, legal, and explain all refund logic clearly.

Current state:
- Conversation ID: ${this.state.conversationId}
- User ID: ${this.state.userId || 'Not set'}
- Extracted data: ${this.state.extractedData ? 'Available' : 'Not available'}
- Questions answered: ${this.state.currentQuestionIndex}
- Deduction flow: ${this.state.deductionFlow ? 'Set' : 'Not set'}
- Current step: ${this.state.step}

Available tools:
- parseTaxPdf: Extract tax data from PDFs
- calculateTaxSummary: Calculate tax with deductions
- askDeductionQuestions: Get relevant questions
- applyLossCarryforward: Handle loss carryforward
- generateFinalSummary: Create final summary
- resetForNewYear: Reset for next year
- checkTaxThreshold: Check if income is below threshold
- processDeductionAnswer: Process user answers to deduction questions

Always use tools for calculations and data operations. Be helpful, accurate, and professional.`],
      ['human', '{input}'],
      ['human', '{agent_scratchpad}']
    ]);
  }

  async initialize() {
    const tools = this.createTools();
    const prompt = this.createPrompt();

    const agent = await createReactAgent({
      llm: this.llm,
      tools: tools as any, // Type assertion to fix linter error
      prompt
    });

    this.agentExecutor = new AgentExecutor({
      agent,
      tools: tools as any, // Type assertion to fix linter error
      verbose: true
    });
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

      // Run agent
      const result = await this.agentExecutor!.invoke({
        input: input
      });

      // Add agent response to state
      this.state.messages.push({
        sender: 'assistant',
        text: result.output,
        timestamp: new Date()
      });

      return result.output;
    } catch (error) {
      console.error('Agent execution error:', error);
      
      // Log error to Supabase
      await SupabaseService.logError(
        this.state.conversationId,
        'agent_execution',
        error instanceof Error ? error.message : 'Unknown error',
        { endpoint: '/api/advisor/run-agent' }
      );

      return 'I encountered an error while processing your request. Please try again or contact support.';
    }
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