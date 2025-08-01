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
}

export class PflegedAgent {
  private llm: ChatOpenAI;
  private agentExecutor: AgentExecutor;
  private state: PflegedAgentState;

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
      messages: []
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
            const deductionFlowMap: Record<UserStatus, DeductionFlow> = {
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
                  }
                ],
                order: ['bachelor_tuition', 'bachelor_books', 'bachelor_travel']
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
                    id: 'master_verlustvortrag',
                    question: 'Do you have any loss carryforward (Verlustvortrag) from previous years?',
                    category: 'Loss Carryforward',
                    maxAmount: 10000
                  }
                ],
                order: ['master_tuition', 'master_books', 'master_travel', 'master_verlustvortrag']
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
                  }
                ],
                order: ['new_work_tools', 'new_commuting']
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
                    id: 'full_home_office',
                    question: 'Did you have home office expenses (furniture, equipment)?',
                    category: 'Work',
                    maxAmount: 1250
                  }
                ],
                order: ['full_work_tools', 'full_commuting', 'full_home_office']
              }
            };

            this.state.deductionFlow = deductionFlowMap[input.status];
            this.state.currentQuestionIndex = input.currentQuestion;

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
              .select('loss_carryforward')
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

            const availableLoss = lossData?.loss_carryforward || 0;
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
              messages: []
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

Available tools:
- parseTaxPdf: Extract tax data from PDFs
- calculateTaxSummary: Calculate tax with deductions
- askDeductionQuestions: Get relevant questions
- applyLossCarryforward: Handle loss carryforward
- generateFinalSummary: Create final summary
- resetForNewYear: Reset for next year

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
      tools,
      prompt
    });

    this.agentExecutor = new AgentExecutor({
      agent,
      tools,
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
      const result = await this.agentExecutor.invoke({
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
      await supabase
        .from('supabase-logs')
        .insert({
          conversation_id: this.state.conversationId,
          error_type: 'agent_execution',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });

      return 'I encountered an error while processing your request. Please try again or contact support.';
    }
  }

  getState(): PflegedAgentState {
    return { ...this.state };
  }

  setUserId(userId: string) {
    this.state.userId = userId;
  }

  setExtractedData(data: ExtractedData) {
    this.state.extractedData = data;
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
} 