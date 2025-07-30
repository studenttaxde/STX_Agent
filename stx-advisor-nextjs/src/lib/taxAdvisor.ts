import OpenAI from 'openai';
import { ChatOpenAI } from '@langchain/openai';
import { BufferMemory } from 'langchain/memory';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { RunnableSequence } from '@langchain/core/runnables';
import { 
  ExtractedData, 
  UserData, 
  ConversationHistory, 
  TaxAdvisorState, 
  UserStatus, 
  DeductionQuestion, 
  DeductionAnswer, 
  DeductionFlow, 
  TaxCalculation, 
  DeductionSummary 
} from '@/types';

export class TaxAdvisor {
  private static readonly TAX_FREE_THRESHOLDS: Record<number, number> = {
    2017: 8820,
    2018: 9000,
    2019: 9168,
    2020: 9408,
    2021: 9744,
    2022: 10347,
    2023: 10908,
    2024: 11604,
    2025: 12300
  };

  private openai: OpenAI;
  private langchainLLM: ChatOpenAI;
  private memory: BufferMemory;
  private state: TaxAdvisorState;
  private agentExecutor: AgentExecutor | null = null;


  // Deduction flow definitions
  private readonly deductionFlowMap: Record<UserStatus, DeductionFlow> = {
    bachelor: {
      status: 'bachelor',
      questions: [
        {
          id: 'semester_fees',
          question: 'How much did you pay for semester/tuition fees? (amount in €)',
          category: 'Education',
          maxAmount: 6000
        },
        {
          id: 'laptop_materials',
          question: 'How much did you spend on laptop, printer, or study materials? (amount in €)',
          category: 'Education',
          maxAmount: 1000
        },
        {
          id: 'desk_chair',
          question: 'How much did you spend on desk or chair for studying? (amount in €)',
          category: 'Home Office',
          maxAmount: 500
        },
        {
          id: 'commute_university',
          question: 'What is your commute distance to university? (km one-way)',
          category: 'Travel',
          maxAmount: 4500
        },
        {
          id: 'application_costs',
          question: 'How much did you spend on application costs for internships/jobs? (amount in €)',
          category: 'Professional Development',
          maxAmount: 1000
        },
        {
          id: 'relocation',
          question: 'How much did you spend on work-related relocation costs? (amount in €)',
          category: 'Relocation',
          maxAmount: 1000
        },
        {
          id: 'language_courses',
          question: 'How much did you pay for language course fees? (amount in €)',
          category: 'Education',
          maxAmount: 1000
        },
        {
          id: 'mobile_internet',
          question: 'How much of your mobile/internet costs were used for studies? (amount in €)',
          category: 'Home Office',
          maxAmount: 500
        }
      ],
      order: ['semester_fees', 'laptop_materials', 'desk_chair', 'commute_university', 'application_costs', 'relocation', 'language_courses', 'mobile_internet']
    },
    master: {
      status: 'master',
      questions: [
        {
          id: 'tuition_fees',
          question: 'How much did you pay for tuition/semester fees? (amount in €)',
          category: 'Education',
          maxAmount: 6000
        },
        {
          id: 'laptop_equipment',
          question: 'How much did you spend on laptop or study equipment? (amount in €)',
          category: 'Education',
          maxAmount: 1000
        },
        {
          id: 'home_office_setup',
          question: 'How much did you spend on home office setup for your studies? (amount in €)',
          category: 'Home Office',
          maxAmount: 1250
        },
        {
          id: 'internet_mobile',
          question: 'How much of your internet/mobile costs were used for study? (amount in €)',
          category: 'Home Office',
          maxAmount: 500
        },
        {
          id: 'travel_university',
          question: 'What is your commute distance to university? (km one-way)',
          category: 'Travel',
          maxAmount: 4500
        },
        {
          id: 'books_software',
          question: 'How much did you spend on books, software, or courses? (amount in €)',
          category: 'Education',
          maxAmount: 1000
        },
        {
          id: 'application_costs',
          question: 'How much did you spend on application costs? (amount in €)',
          category: 'Professional Development',
          maxAmount: 1000
        },
        {
          id: 'relocation',
          question: 'How much did you spend on relocation costs? (amount in €)',
          category: 'Relocation',
          maxAmount: 1000
        }
      ],
      order: ['tuition_fees', 'laptop_equipment', 'home_office_setup', 'internet_mobile', 'travel_university', 'books_software', 'application_costs', 'relocation']
    },
    new_employee: {
      status: 'new_employee',
      questions: [
        {
          id: 'application_costs',
          question: 'How much did you spend on job application costs? (amount in €)',
          category: 'Professional Development',
          maxAmount: 1000
        },
        {
          id: 'relocation',
          question: 'How much did you spend on relocation costs for your new job? (amount in €)',
          category: 'Relocation',
          maxAmount: 1000
        },
        {
          id: 'work_equipment',
          question: 'How much did you spend on work equipment or tools? (amount in €)',
          category: 'Work Equipment',
          maxAmount: 1000
        },
        {
          id: 'commute_work',
          question: 'What is your commute distance to work? (km one-way)',
          category: 'Travel',
          maxAmount: 4500
        },
        {
          id: 'work_clothing',
          question: 'How much did you spend on work clothing or uniforms? (amount in €)',
          category: 'Work Expenses',
          maxAmount: 500
        },
        {
          id: 'training_courses',
          question: 'How much did you spend on professional training or courses? (amount in €)',
          category: 'Professional Development',
          maxAmount: 1000
        }
      ],
      order: ['application_costs', 'relocation', 'work_equipment', 'commute_work', 'work_clothing', 'training_courses']
    },
    full_time: {
      status: 'full_time',
      questions: [
        {
          id: 'work_equipment',
          question: 'How much did you spend on work equipment or tools? (amount in €)',
          category: 'Work Equipment',
          maxAmount: 1000
        },
        {
          id: 'commute_work',
          question: 'What is your commute distance to work? (km one-way)',
          category: 'Travel',
          maxAmount: 4500
        },
        {
          id: 'work_clothing',
          question: 'How much did you spend on work clothing or uniforms? (amount in €)',
          category: 'Work Expenses',
          maxAmount: 500
        },
        {
          id: 'home_office',
          question: 'How much did you spend on home office setup? (amount in €)',
          category: 'Home Office',
          maxAmount: 1250
        },
        {
          id: 'internet_mobile_work',
          question: 'How much of your internet/mobile costs were used for work? (amount in €)',
          category: 'Home Office',
          maxAmount: 500
        },
        {
          id: 'training_courses',
          question: 'How much did you spend on professional training or courses? (amount in €)',
          category: 'Professional Development',
          maxAmount: 1000
        },
        {
          id: 'union_fees',
          question: 'How much did you pay for union or professional association fees? (amount in €)',
          category: 'Professional Development',
          maxAmount: 1000
        },
        {
          id: 'work_insurance',
          question: 'How much did you pay for work-related insurance? (amount in €)',
          category: 'Work Expenses',
          maxAmount: 500
        }
      ],
      order: ['work_equipment', 'commute_work', 'work_clothing', 'home_office', 'internet_mobile_work', 'training_courses', 'union_fees', 'work_insurance']
    }
  };

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
    
    // Initialize LangChain components
    this.langchainLLM = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.3,
      openAIApiKey: apiKey
    });
    
    this.memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'chat_history'
    });
    
            // Set up LangSmith environment variables for server-side tracing
        if (typeof window === 'undefined') {
          process.env.LANGCHAIN_TRACING_V2 = 'true';
          process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT || 'STX_Advisor';
          process.env.LANGCHAIN_ENDPOINT = process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com';
          process.env.LANGCHAIN_API_KEY = process.env.LANGCHAIN_API_KEY || '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';
        }
    
    this.state = {
      conversationHistory: [],
      extractedData: {},
      userData: {},
      askedQuestions: new Set(),
      filedYears: new Set(),
      deductionAnswers: {},
      currentQuestionIndex: 0,
      deductionFlow: undefined,
      taxCalculation: undefined,
      done: false
    };
  }

  setExtractedData(data: ExtractedData): void {
    this.state.extractedData = data;
    const year = data.year;
    if (year) {
      this.state.userData.year = year;
    }
    this.state.userData.gross_income = data.gross_income;
    this.state.userData.income_tax_paid = data.income_tax_paid;
    
    // Log data extraction for debugging
    console.log('Data extracted:', {
      year: data.year,
      gross_income: data.gross_income,
      income_tax_paid: data.income_tax_paid,
      employer: data.employer,
      full_name: data.full_name
    });
  }

  addUserMessage(message: string): void {
    this.state.conversationHistory.push({ role: 'user', content: message });
    // Also add to LangChain memory
    this.memory.chatHistory.addMessage(new HumanMessage(message));
  }

  addAgentMessage(message: string): void {
    this.state.conversationHistory.push({ role: 'assistant', content: message });
    // Also add to LangChain memory
    this.memory.chatHistory.addMessage(new AIMessage(message));
  }

  // LangChain Tools for tax calculations
  private createTaxTools(): any[] {
    // Simple function-based tools that work with LangChain
    const tools = [
      {
        name: 'calculate_tax_refund',
        description: 'Calculate potential tax refund based on income, tax paid, and deductions',
        schema: {
          type: 'object',
          properties: {
            gross_income: { type: 'number', description: 'Gross income in euros' },
            tax_paid: { type: 'number', description: 'Income tax paid in euros' },
            total_deductions: { type: 'number', description: 'Total deductions in euros' },
            year: { type: 'number', description: 'Tax year' }
          },
          required: ['gross_income', 'tax_paid', 'year']
        },
        func: async (input: any) => {
          const { gross_income, tax_paid, total_deductions = 0, year } = input;
          try {
            const threshold = TaxAdvisor.TAX_FREE_THRESHOLDS[year];
            if (!threshold) {
              return `No threshold data available for year ${year}`;
            }
            
            const taxableIncome = Math.max(0, gross_income - total_deductions);
            
            if (taxableIncome < threshold) {
              return `Income below threshold (€${threshold}). Full refund possible: €${tax_paid}`;
            }
            
            const estimatedTax = taxableIncome * 0.15;
            const estimatedRefund = Math.max(0, tax_paid - estimatedTax);
            return `Estimated refund: €${estimatedRefund.toFixed(2)} (Taxable income: €${taxableIncome.toFixed(2)})`;
          } catch (error) {
            throw error;
          }
        }
      },
      {
        name: 'check_tax_deductions',
        description: 'Check common tax deductions for German taxpayers based on status',
        schema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'User status (bachelor, master, new_employee, full_time)' },
            income: { type: 'number', description: 'Gross income in euros' },
            year: { type: 'number', description: 'Tax year' }
          },
          required: ['status', 'income', 'year']
        },
        func: async (input: any) => {
          const { status, income, year } = input;
          try {
            const deductionFlow = this.deductionFlowMap[status as UserStatus];
            if (!deductionFlow) {
              return `No deduction flow available for status: ${status}`;
            }
            
            const threshold = TaxAdvisor.TAX_FREE_THRESHOLDS[year];
            if (threshold && income < threshold) {
              return `Income (€${income}) is below the tax-free threshold (€${threshold}) for ${year}. No deductions needed.`;
            }
            
            const deductions = deductionFlow.questions.map(q => q.category).join(', ');
            return `Available deductions for ${status}: ${deductions}`;
          } catch (error) {
            throw error;
          }
        }
      }
    ];

    return tools;
  }

  private async initializeAgent(): Promise<void> {
    if (this.agentExecutor) return;

    try {
      const tools = this.createTaxTools();
      
      const prompt = ChatPromptTemplate.fromTemplate(`
You are a professional German tax advisor assistant. You help users with their tax returns and provide accurate, helpful advice.

Current user data:
- Year: {year}
- Gross Income: €{gross_income}
- Tax Paid: €{tax_paid}
- Status: {status}
- Filed Years: {filed_years}
- Current Deduction Flow: {current_deduction_flow}
- Current Question Index: {current_question_index}
- Deduction Answers: {deduction_answers}

IMPORTANT RULES:
1. Ask ONE question at a time and wait for the user's response
2. Be dynamic - if the user says "no" to a deduction, move to the next relevant question
3. If the user says "none" or "no expenses", skip that category and move on
4. If the user provides multiple amounts for the same category, ask for clarification
5. You can conclude early if the user indicates they have no more deductions
6. Be conversational and helpful
7. After gathering all relevant information, provide a summary
8. Use the available tools to calculate tax refunds and check deductions

Chat History:
{chat_history}

Human: {input}
AI Assistant: {agent_scratchpad}`);

      const agent = await createOpenAIFunctionsAgent({
        llm: this.langchainLLM,
        tools,
        prompt,
      });

      this.agentExecutor = new AgentExecutor({
        agent,
        tools,
        memory: this.memory,
        verbose: false,
      });

    } catch (error) {
      console.error('Failed to initialize LangChain agent:', error);
      throw error;
    }
  }

  private buildInitialSummary(): string {
    const { full_name, address, employer, total_hours, gross_income, income_tax_paid, year } = this.state.extractedData;

    return `Here's what I found from your documents:

👤 **Name:** ${full_name || "N/A"}
🏢 **Employer:** ${employer || "N/A"}
⏱️ **Work Period:** ${total_hours ? `${total_hours} hours` : "Not specified"}
💶 **Gross Income:** €${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
💰 **Lohnsteuer Paid:** €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
📅 **Detected Tax Year:** ${year || "Not specified"}`;
  }

  private isBelowThreshold(): boolean {
    const year = this.state.userData.year;
    const grossIncome = this.state.userData.gross_income || 0;
    
    if (!year) return false;
    
    const threshold = TaxAdvisor.TAX_FREE_THRESHOLDS[year];
    return threshold !== undefined && grossIncome < threshold;
  }

  private earlyExitSummary(): string {
    const { year, gross_income, income_tax_paid } = this.state.userData;
    const threshold = year ? TaxAdvisor.TAX_FREE_THRESHOLDS[year] : 0;
    
    let result = `# 📊 **Tax Filing Summary for ${this.state.extractedData.full_name || "User"}**\n\n`;
    result += `## 💰 **Financial Overview**\n`;
    result += `- **Tax Year:** ${year}\n`;
    result += `- **Gross Income:** €${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n`;
    result += `- **Tax Paid:** €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n`;
    result += `- **Tax-Free Threshold:** €${threshold.toLocaleString('de-DE')}\n`;
    result += `- **Status:** Below tax-free limit\n\n`;
    
    result += `## ✅ **Tax Refund**\n`;
    result += `Since your income (€${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}) is below the tax-free threshold (€${threshold.toLocaleString('de-DE')}) for ${year}, you are eligible for a **full refund** of €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}.\n\n`;
    
    result += `## 📋 **No Additional Deductions Needed**\n`;
    result += `Since you're below the tax-free threshold, no additional deductions are required. You will receive the full amount of tax paid as a refund.\n\n`;
    
    result += `## 📄 **Complete Filing Data (JSON)**\n`;
    const jsonSummary = {
      name: this.state.extractedData.full_name || "User",
      tax_year: year,
      gross_income: Number(gross_income || 0),
      tax_paid: Number(income_tax_paid || 0),
      tax_free_threshold: threshold,
      status: "below_threshold",
      estimated_refund: Number(income_tax_paid || 0),
      employer: this.state.extractedData.employer || "Not specified",
      filing_date: new Date().toISOString().split('T')[0],
      deductions: {},
      total_deductions: 0,
      taxable_income: Number(gross_income || 0)
    };
    
    result += `\`\`\`json\n${JSON.stringify(jsonSummary, null, 2)}\n\`\`\`\n\n`;
    
    result += `## ✅ **Next Steps**\n`;
    result += `1. File your tax return to claim the full refund\n`;
    result += `2. Use the JSON data for your tax filing software or accountant\n`;
    result += `3. Keep this summary for your records\n\n`;
    
    result += `*This summary includes all necessary information for filing your German tax return for ${year}.*`;
    
    return result;
  }

  private getCurrentQuestion(): DeductionQuestion | null {
    if (!this.state.deductionFlow || this.state.currentQuestionIndex >= this.state.deductionFlow.order.length) {
      return null;
    }
    
    const currentQuestionId = this.state.deductionFlow.order[this.state.currentQuestionIndex];
    return this.state.deductionFlow.questions.find(q => q.id === currentQuestionId) || null;
  }

  private processDeductionAnswer(answer: string): DeductionAnswer | null {
    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion) return null;

    const cleanAnswer = answer.trim().toLowerCase();
    console.log(`Processing deduction answer: "${answer}" -> "${cleanAnswer}" for question: ${currentQuestion.category}`);
    
    // Check for "n/a" or "no" responses
    const isNo = /^(no|n|nein|false|0|none|n\/a|not applicable|na)$/i.test(cleanAnswer);
    if (isNo) {
      console.log(`Detected NO response for ${currentQuestion.category}`);
      return {
        questionId: currentQuestion.id,
        answer: false,
        amount: 0,
        details: 'No deduction claimed'
      };
    }
    
    // Check for "yes" responses (use max amount)
    const isYes = /^(yes|y|ja|j|true|1)$/i.test(cleanAnswer);
    if (isYes) {
      const maxAmount = currentQuestion.maxAmount || 0;
      console.log(`Detected YES response for ${currentQuestion.category}, using max amount: ${maxAmount}`);
      return {
        questionId: currentQuestion.id,
        answer: true,
        amount: maxAmount,
        details: `Claimed maximum €${maxAmount.toFixed(2)} for ${currentQuestion.category}`
      };
    }
    
    // Enhanced parsing for complex input formats
    let totalAmount = 0;
    let details = '';
    
    // 1. Extract all numbers from the input
    const numberMatches = cleanAnswer.match(/\d+(?:[.,]\d{1,3})*/g);
    console.log(`Found number matches:`, numberMatches);
    
    if (numberMatches && numberMatches.length > 0) {
      // Convert all found numbers to amounts
      const amounts = numberMatches.map(num => {
        const cleanNum = num.replace(/,/g, '');
        return parseFloat(cleanNum);
      }).filter(amount => !isNaN(amount) && amount > 0);
      
      console.log(`Parsed amounts:`, amounts);
      
      if (amounts.length > 0) {
        totalAmount = amounts.reduce((sum, amount) => sum + amount, 0);
        
        // Create detailed description
        if (amounts.length === 1) {
          details = `Claimed €${amounts[0].toFixed(2)} for ${currentQuestion.category}`;
        } else {
          const amountDetails = amounts.map(amount => `€${amount.toFixed(2)}`).join(', ');
          details = `Claimed total €${totalAmount.toFixed(2)} for ${currentQuestion.category} (${amountDetails})`;
        }
        
        const maxAmount = currentQuestion.maxAmount || 0;
        console.log(`Total amount: ${totalAmount}, Max allowed: ${maxAmount}`);
        
        // Accept the amount but cap it at maximum if it exceeds
        if (totalAmount > 0) {
          const finalAmount = Math.min(totalAmount, maxAmount);
          const finalDetails = totalAmount > maxAmount 
            ? `Claimed €${finalAmount.toFixed(2)} for ${currentQuestion.category} (capped from €${totalAmount.toFixed(2)})`
            : details;
          
          console.log(`✅ Valid deduction: ${finalDetails}`);
          return {
            questionId: currentQuestion.id,
            answer: true,
            amount: finalAmount,
            details: finalDetails
          };
        }
      }
    }
    
    // 2. Handle distance and days format: "18km, 210 days", "18 km 210 days"
    const distanceDaysMatch = cleanAnswer.match(/(\d+)\s*(?:km|kilometer).*?(\d+)\s*(?:days|day|tage)/i);
    if (distanceDaysMatch) {
      const distance = parseInt(distanceDaysMatch[1]);
      const days = parseInt(distanceDaysMatch[2]);
      
      // Calculate commuting cost: distance * days * 0.30€ per km
      const amount = distance * days * 0.30;
      const maxAmount = currentQuestion.maxAmount || 0;
      
      console.log(`Distance/days calculation: ${distance}km × ${days} days × €0.30 = €${amount}`);
      
      if (amount > 0) {
        const finalAmount = Math.min(amount, maxAmount);
        const finalDetails = amount > maxAmount 
          ? `Claimed €${finalAmount.toFixed(2)} for ${currentQuestion.category} (capped from €${amount.toFixed(2)})`
          : `Claimed €${amount.toFixed(2)} for ${currentQuestion.category} (${distance}km × ${days} days × €0.30/km)`;
        
        return {
          questionId: currentQuestion.id,
          answer: true,
          amount: finalAmount,
          details: finalDetails
        };
      }
    }
    
    // 3. Just distance: "18km", "18 km"
    const distanceMatch = cleanAnswer.match(/(\d+)\s*(?:km|kilometer)/i);
    if (distanceMatch) {
      const distance = parseInt(distanceMatch[1]);
      // Assume 220 working days per year
      const amount = distance * 220 * 0.30;
      const maxAmount = currentQuestion.maxAmount || 0;
      
      console.log(`Distance calculation: ${distance}km × 220 days × €0.30 = €${amount}`);
      
      if (amount > 0) {
        const finalAmount = Math.min(amount, maxAmount);
        const finalDetails = amount > maxAmount 
          ? `Claimed €${finalAmount.toFixed(2)} for ${currentQuestion.category} (capped from €${amount.toFixed(2)})`
          : `Claimed €${amount.toFixed(2)} for ${currentQuestion.category} (${distance}km × 220 days × €0.30/km)`;
        
        return {
          questionId: currentQuestion.id,
          answer: true,
          amount: finalAmount,
          details: finalDetails
        };
      }
    }
    
    // 4. Just days: "210 days", "210 day"
    const daysMatch = cleanAnswer.match(/(\d+)\s*(?:days|day|tage)/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      // Assume 10km average distance
      const amount = 10 * days * 0.30;
      const maxAmount = currentQuestion.maxAmount || 0;
      
      console.log(`Days calculation: 10km × ${days} days × €0.30 = €${amount}`);
      
      if (amount > 0) {
        const finalAmount = Math.min(amount, maxAmount);
        const finalDetails = amount > maxAmount 
          ? `Claimed €${finalAmount.toFixed(2)} for ${currentQuestion.category} (capped from €${amount.toFixed(2)})`
          : `Claimed €${amount.toFixed(2)} for ${currentQuestion.category} (10km × ${days} days × €0.30/km)`;
        
        return {
          questionId: currentQuestion.id,
          answer: true,
          amount: finalAmount,
          details: finalDetails
        };
      }
    }
    
    // 5. Amount with currency: "€18210", "18210€", "18210 euro"
    const currencyMatch = cleanAnswer.match(/[€$]?\s*(\d+(?:[.,]\d{1,3})*)\s*[€$]?\s*(?:euro|eur)?/i);
    if (currencyMatch) {
      const cleanNumber = currencyMatch[1].replace(/,/g, '');
      const amount = parseFloat(cleanNumber);
      const maxAmount = currentQuestion.maxAmount || 0;
      
      console.log(`Currency match: ${amount}`);
      
      if (amount > 0) {
        const finalAmount = Math.min(amount, maxAmount);
        const finalDetails = amount > maxAmount 
          ? `Claimed €${finalAmount.toFixed(2)} for ${currentQuestion.category} (capped from €${amount.toFixed(2)})`
          : `Claimed €${amount.toFixed(2)} for ${currentQuestion.category}`;
        
        return {
          questionId: currentQuestion.id,
          answer: true,
          amount: finalAmount,
          details: finalDetails
        };
      }
    }
    
    // 6. Simple numbers: "18210", "18.210", "18,210"
    const numericMatch = cleanAnswer.match(/^(\d+(?:[.,]\d{1,3})*)$/);
    if (numericMatch) {
      // Remove commas and convert to number
      const cleanNumber = numericMatch[1].replace(/,/g, '');
      const amount = parseFloat(cleanNumber);
      const maxAmount = currentQuestion.maxAmount || 0;
      
      console.log(`Simple number match: ${amount}`);
      
      if (amount > 0) {
        const finalAmount = Math.min(amount, maxAmount);
        const finalDetails = amount > maxAmount 
          ? `Claimed €${finalAmount.toFixed(2)} for ${currentQuestion.category} (capped from €${amount.toFixed(2)})`
          : `Claimed €${amount.toFixed(2)} for ${currentQuestion.category}`;
        
        return {
          questionId: currentQuestion.id,
          answer: true,
          amount: finalAmount,
          details: finalDetails
        };
      }
    }
    
    console.log(`❌ No valid deduction found for: "${cleanAnswer}"`);
    return null;
  }

  private addDynamicDeduction(category: string, amount: number, details: string): void {
    this.state.deductionAnswers[category] = {
      questionId: category,
      answer: true,
      amount: amount,
      details: details
    };
  }

  private calculateTaxSummary(): DeductionSummary {
    const totalDeductions = Object.values(this.state.deductionAnswers)
      .filter(a => a.answer)
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    const grossIncome = this.state.userData.gross_income || 0;
    const taxableIncome = Math.max(0, grossIncome - totalDeductions);
    const taxPaid = this.state.userData.income_tax_paid || 0;
    
    // Simple tax calculation (in reality this would be more complex)
    const estimatedTax = taxableIncome * 0.15;
    const refund = Math.max(0, taxPaid - estimatedTax);

    const deductions = Object.values(this.state.deductionAnswers)
      .filter(a => a.answer)
      .map(a => {
        const question = this.state.deductionFlow?.questions.find(q => q.id === a.questionId);
        return {
          category: question?.category || 'Unknown',
          amount: a.amount || 0,
          description: a.details || question?.question || 'Unknown deduction'
        };
      });

    return {
      totalDeductions,
      deductions,
      taxableIncome,
      refund
    };
  }

  private generateFinalSummary(): string {
    const summary = this.calculateTaxSummary();
    const { year, gross_income, income_tax_paid } = this.state.userData;
    const status = this.state.userData.status;

    let result = `# 📊 **Tax Filing Summary for ${this.state.extractedData.full_name || "User"}**\n\n`;
    result += `## 💰 **Financial Overview**\n`;
    result += `- **Tax Year:** ${year}\n`;
    result += `- **Gross Income:** €${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n`;
    result += `- **Tax Paid:** €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n`;
    result += `- **Total Deductions:** €${summary.totalDeductions.toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n`;
    result += `- **Taxable Income:** €${summary.taxableIncome.toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n`;
    result += `- **Estimated Refund:** €${summary.refund.toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n\n`;

    // Detailed expense breakdown
    if (summary.deductions.length > 0) {
      result += `## 📋 **Detailed Expense Breakdown**\n`;
      result += `*All expenses claimed for tax deduction:*\n\n`;
      
      summary.deductions.forEach((deduction, index) => {
        result += `${index + 1}. **${deduction.category}**\n`;
        result += `   - Amount: €${deduction.amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n`;
        result += `   - Description: ${deduction.description}\n\n`;
      });
    }

    // Create detailed deductions object for JSON
    const detailedDeductions: Record<string, { amount: number; description: string; category: string }> = {};
    Object.values(this.state.deductionAnswers)
      .filter(a => a.answer)
      .forEach(answer => {
        const question = this.state.deductionFlow?.questions.find(q => q.id === answer.questionId);
        detailedDeductions[answer.questionId] = {
          amount: answer.amount || 0,
          description: answer.details || question?.question || 'Unknown deduction',
          category: question?.category || 'Unknown'
        };
      });

    const jsonSummary = {
      name: this.state.extractedData.full_name || "User",
      status: status,
      tax_year: year,
      gross_income: Number(gross_income || 0),
      tax_paid: Number(income_tax_paid || 0),
      detailed_deductions: detailedDeductions,
      total_deductions: summary.totalDeductions,
      taxable_income: summary.taxableIncome,
      estimated_refund: summary.refund,
      employer: this.state.extractedData.employer || "Not specified",
      filing_date: new Date().toISOString().split('T')[0]
    };

    result += `## 📄 **Complete Filing Data (JSON)**\n`;
    result += `*Use this data for your tax filing:*\n\n`;
    result += `\`\`\`json\n${JSON.stringify(jsonSummary, null, 2)}\n\`\`\`\n\n`;
    
    result += `## ✅ **Next Steps**\n`;
    result += `1. Review all expenses and amounts listed above\n`;
    result += `2. Ensure you have receipts/documentation for all claimed expenses\n`;
    result += `3. Use the JSON data for your tax filing software or accountant\n`;
    result += `4. Keep this summary for your records\n\n`;
    
    result += `*This summary includes all necessary information for filing your German tax return for ${year}.*`;

    return result;
  }

  async nextAdvisorMessage(): Promise<string> {
    const lastUserMessage = this.state.conversationHistory.slice().reverse().find(msg => msg.role === 'user')?.content.toLowerCase();
    const lastAgentMessage = this.state.conversationHistory.slice().reverse().find(msg => msg.role === 'assistant')?.content.toLowerCase();

    try {
      // Initial message: Display summary and confirm year
      if (this.state.conversationHistory.length === 0) {
        const summary = this.buildInitialSummary();
        this.addAgentMessage(summary);

        const year = this.state.extractedData.year;
        if (year) {
          const confirmMsg = `Can you please confirm that the tax year you want to file is ${year}? (yes/no)

If this is correct, I'll help you with your tax filing process. If not, please upload the correct PDF for the year you want to file.`;
          this.addAgentMessage(confirmMsg);
          return `${summary}\n\n${confirmMsg}`;
        }
        
        return summary;
      }
      
      // Handle year confirmation
      if (lastAgentMessage && lastAgentMessage.includes('confirm that the tax year')) {
        if (lastUserMessage && /^(yes|y|yeah|correct|right)$/i.test(lastUserMessage)) {
          const year = this.state.userData.year;
          if (year) {
            this.state.filedYears.add(year);
          }
          
          // Check threshold after year confirmation
          if (this.isBelowThreshold()) {
            const summary = this.earlyExitSummary();
            const finalMsg = `${summary}\n\nWould you like to file a tax return for another year?`;
            this.addAgentMessage(finalMsg);
            return finalMsg;
          }
          
          // If not below threshold, ask for status
          const nextQuestion = `Since your income exceeds the tax-free threshold, let's check for deductible expenses to reduce your taxable income.

Please select your status for the year:
1. **bachelor** (Bachelor's student)
2. **master** (Master's student)  
3. **new_employee** (Started job after graduation)
4. **full_time** (Full-time employee)`;
          this.addAgentMessage(nextQuestion);
          return nextQuestion;
        }
        
        if (lastUserMessage && /^(no|n|nope|not correct|wrong year)$/i.test(lastUserMessage)) {
          const result = "Please upload the correct PDF for the year you want to file.";
          return result;
        }
      }
      
      // Handle status selection
      if (lastAgentMessage && (lastAgentMessage.includes('select your status for the year') || lastAgentMessage.includes('Please select your status'))) {
        let status: UserStatus | null = null;
        
        // Handle numeric input (1, 2, 3, 4)
        if (lastUserMessage && /^[1-4]$/.test(lastUserMessage)) {
          const statusMap: Record<string, UserStatus> = {
            '1': 'bachelor',
            '2': 'master', 
            '3': 'new_employee',
            '4': 'full_time'
          };
          status = statusMap[lastUserMessage];
        }
        // Handle text input
        else if (lastUserMessage && ['bachelor', 'master', 'new_employee', 'full_time'].includes(lastUserMessage)) {
          status = lastUserMessage as UserStatus;
        }
        
        if (status) {
          this.state.userData.status = status;
          this.state.deductionFlow = this.deductionFlowMap[status];
          this.state.currentQuestionIndex = 0;
          
          const firstQuestion = this.state.deductionFlow.questions[0];
          const questionMsg = `Perfect! I've set your status as: **${status.replace('_', ' ').toUpperCase()}**

Now I'll ask you specific deduction questions one by one to maximize your tax savings. Let's start with the first deduction question:

**${firstQuestion.question}**

Please provide the amount or type "n/a" if this doesn't apply to you.`;
          
          this.addAgentMessage(questionMsg);
          return questionMsg;
        } else {
          const result = "Please choose a valid status by typing the number (1-4) or the status name: bachelor, master, new_employee, or full_time.";
          return result;
        }
      }
      
      // Handle "file for another year" response
      if (lastAgentMessage && lastAgentMessage.includes('file a tax return for another year')) {
        if (lastUserMessage && /^(yes|y|yeah|correct|right)$/i.test(lastUserMessage)) {
          // Reset for new year while preserving helpful information
          this.resetForNewYear();
          
          const result = "🎯 **Ready for another year!**\n\nI've reset the conversation for your new tax filing. Please upload the PDF for the year you want to file next.\n\n💡 **Helpful Info:** I remember you've filed for: " + 
            (this.state.filedYears.size > 0 ? Array.from(this.state.filedYears).sort().join(", ") : "no previous years") + 
            ". This helps me provide better advice for your new filing.";
          
          return result;
        } else {
          const result = "Thank you for using STX Advisor. Have a great day!";
          return result;
        }
      }

      // Dynamic deduction flow - use proper deduction flow logic
      if (this.state.deductionFlow && this.state.currentQuestionIndex < this.state.deductionFlow.questions.length) {
        const currentQuestion = this.state.deductionFlow.questions[this.state.currentQuestionIndex];
        
        // Process the user's answer to the current question
        const answer = this.processDeductionAnswer(lastUserMessage || '');
        if (answer !== null) {
          // Store the answer
          this.state.deductionAnswers[currentQuestion.id] = answer;
          this.state.currentQuestionIndex++;
          
          // Check if we have more questions
          if (this.state.currentQuestionIndex < this.state.deductionFlow.questions.length) {
            const nextQuestion = this.state.deductionFlow.questions[this.state.currentQuestionIndex];
            const nextQuestionMsg = `Thank you! Your ${currentQuestion.category} deduction: €${(answer.amount || 0).toFixed(2)}

Next question:

**${nextQuestion.question}**

Please provide the amount or type "n/a" if this doesn't apply to you.`;
            
            this.addAgentMessage(nextQuestionMsg);
            return nextQuestionMsg;
          } else {
            // All questions answered, generate final summary
            const finalSummary = this.generateFinalSummary();
            this.addAgentMessage(finalSummary);
            this.state.done = true;
            return finalSummary;
          }
        } else {
          // Invalid answer, ask the same question again
          const retryMsg = `I didn't understand your response. Please provide a specific amount for ${currentQuestion.category} or type "n/a" if this doesn't apply to you.

**${currentQuestion.question}**

Please provide the amount or type "n/a" if this doesn't apply to you.`;
          
          this.addAgentMessage(retryMsg);
          return retryMsg;
        }
      }
      
      // If we reach here, use fallback for general conversation
      try {
        await this.initializeAgent();
        
        if (!this.agentExecutor) {
          throw new Error('Agent not initialized');
        }

        const filedYears = Array.from(this.state.filedYears).sort();
        const filedYearsStr = filedYears.length > 0 ? `User has already filed for: ${filedYears.join(", ")}.` : "User has not filed for any year yet.";
        
        const currentStatus = this.state.userData.status;
        const currentFlow = this.state.deductionFlow;
        const currentQuestionIndex = this.state.currentQuestionIndex;
        
        const systemPrompt = `You are a professional German tax advisor. You help users with their tax returns and provide accurate, helpful advice.

Current user data:
- Year: ${this.state.userData.year || 'unknown'}
- Gross Income: €${this.state.userData.gross_income || 0}
- Tax Paid: €${this.state.userData.income_tax_paid || 0}
- Status: ${currentStatus || 'unknown'}
- ${filedYearsStr}

IMPORTANT RULES:
1. Ask ONE question at a time and wait for the user's response
2. Be dynamic - if the user says "no" to a deduction, move to the next relevant question
3. If the user says "none" or "no expenses", skip that category and move on
4. If the user provides multiple amounts for the same category, ask for clarification
5. You can conclude early if the user indicates they have no more deductions
6. Be conversational and helpful
7. After gathering all relevant information, provide a summary

Current deduction flow: ${currentFlow ? currentFlow.status : 'none'}
Current question index: ${currentQuestionIndex}

User's last message: ${lastUserMessage || 'none'}

Provide a helpful response that guides the user through their tax filing process.`;

        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            ...this.state.conversationHistory.map(msg => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content
            }))
          ],
          temperature: 0.7,
          max_tokens: 500
        });

        const reply = response.choices[0]?.message?.content || 'I apologize, but I need more information to help you properly. Could you please provide more details about your tax situation?';
        
        // Check if the reply indicates a summary or conclusion
        if (reply.toLowerCase().includes('summary') || reply.toLowerCase().includes('conclusion') || reply.toLowerCase().includes('final')) {
          this.state.done = true;
        }
        
        this.addAgentMessage(reply);
        return reply;
        
      } catch (error) {
        console.error('Error in agent conversation:', error);
        const fallbackMsg = "I'm having trouble processing your request. Could you please rephrase your question or provide more specific details about what you need help with?";
        this.addAgentMessage(fallbackMsg);
        return fallbackMsg;
      }
    } catch (error) {
      console.error('Error in nextAdvisorMessage:', error);
      return "I encountered an error. Please try again.";
    }
  }

  getConversationHistory(): ConversationHistory[] {
    return this.state.conversationHistory;
  }

  getUserData(): UserData {
    return this.state.userData;
  }

  getFiledYears(): Set<number> {
    return this.state.filedYears;
  }

  getDeductionAnswers(): DeductionAnswer[] {
    return Object.values(this.state.deductionAnswers);
  }

  getTaxCalculation(): TaxCalculation | null {
    if (!this.state.taxCalculation) {
      const summary = this.calculateTaxSummary();
      this.state.taxCalculation = {
        grossIncome: this.state.userData.gross_income || 0,
        totalDeductions: summary.totalDeductions,
        taxableIncome: summary.taxableIncome,
        estimatedTax: summary.taxableIncome * 0.15,
        taxPaid: this.state.userData.income_tax_paid || 0,
        refund: summary.refund,
        year: this.state.userData.year || 0
      };
    }
    return this.state.taxCalculation;
  }

  reset(): void {
    this.state = {
      conversationHistory: [],
      extractedData: {},
      userData: {},
      askedQuestions: new Set(),
      filedYears: this.state.filedYears, // Keep filedYears across resets
      deductionAnswers: {},
      currentQuestionIndex: 0,
      deductionFlow: undefined,
      taxCalculation: undefined,
      done: false
    };
    
    // Reset LangChain memory
    this.memory.clear();
    this.agentExecutor = null;
  }

  private resetForNewYear(): void {
    // Preserve filed years but clear current year data
    const preservedFiledYears = new Set(this.state.filedYears);
    
    this.state = {
      conversationHistory: [],
      extractedData: {},
      userData: {},
      askedQuestions: new Set(),
      filedYears: preservedFiledYears, // Keep filedYears across resets
      deductionAnswers: {},
      currentQuestionIndex: 0,
      deductionFlow: undefined,
      taxCalculation: undefined,
      done: false
    };
    
    // Reset LangChain memory
    this.memory.clear();
    this.agentExecutor = null;
  }
}

