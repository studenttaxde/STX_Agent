import OpenAI from 'openai';
import { ChatOpenAI } from '@langchain/openai';
import { BufferMemory } from 'langchain/memory';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
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

export class TaxAdvisor {
  private static readonly TAX_FREE_THRESHOLDS: Record<number, number> = {
    2021: 9744,
    2022: 10347,
    2023: 10908,
    2024: 10908,
    2025: 11280,
    2026: 11640
  };

  private openai: OpenAI;
  private langchainLLM: ChatOpenAI;
  private memory: BufferMemory;
  private state: TaxAdvisorState;
  private agentExecutor: AgentExecutor | null = null;

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
        }
      ],
      order: ['master_tuition', 'master_books', 'master_travel', 'master_work', 'master_research']
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
      messages: [],
      loading: false,
      step: 'upload',
      extractedData: null,
      multiPDFData: null,
      filedSummaries: [],
      deductionAnswers: {},
      currentQuestionIndex: 0,
      deductionFlow: null,
      taxCalculation: null,
      done: false
    };
  }

  setExtractedData(data: ExtractedData): void {
    this.state.extractedData = data;
    
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
    this.state.messages.push({ sender: 'user', text: message });
    // Also add to LangChain memory
    this.memory.chatHistory.addMessage(new HumanMessage(message));
  }

  addAgentMessage(message: string): void {
    this.state.messages.push({ sender: 'assistant', text: message });
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
            
            const totalMaxDeductions = deductionFlow.questions.reduce((sum, q) => sum + (q.maxAmount || 0), 0);
            return `For ${status} status in ${year}, maximum potential deductions: €${totalMaxDeductions}. Questions: ${deductionFlow.questions.length}`;
          } catch (error) {
            throw error;
          }
        }
      }
    ];
    
    return tools;
  }

  private async initializeAgent(): Promise<void> {
    const tools = this.createTaxTools();
    
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `You are a German tax advisor helping users with their tax returns. 
      
Your role is to:
1. Analyze extracted tax data from PDFs
2. Guide users through deduction questions
3. Calculate potential tax refunds
4. Provide clear, helpful responses

Always be professional, accurate, and helpful. Use the available tools to perform calculations.`],
      ['human', '{input}'],
      ['human', '{agent_scratchpad}']
    ]);

    const agent = await createOpenAIFunctionsAgent({
      llm: this.langchainLLM,
      tools,
      prompt
    });

    this.agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true
    });
  }

  private buildInitialSummary(): string {
    if (!this.state.extractedData) {
      return "No data available to summarize.";
    }
    
    const { full_name, employer, total_hours, gross_income, income_tax_paid, solidaritaetszuschlag, year } = this.state.extractedData;

    return `Here's what I found from your documents:

👤 **Name:** ${full_name || "N/A"}
🏢 **Employer:** ${employer || "N/A"}
⏱️ **Work Period:** ${total_hours ? `${total_hours} hours` : "Not specified"}
💶 **Gross Income:** €${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
💰 **Lohnsteuer Paid:** €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
${solidaritaetszuschlag ? `💸 **Solidarity Tax:** €${Number(solidaritaetszuschlag).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n` : ''}📅 **Detected Tax Year:** ${year || "Not specified"}`;
  }

  private isBelowThreshold(): boolean {
    if (!this.state.extractedData) return false;
    
    const year = this.state.extractedData.year;
    const grossIncome = this.state.extractedData.gross_income || 0;
    
    if (!year) return false;
    
    const threshold = TaxAdvisor.TAX_FREE_THRESHOLDS[year];
    console.log(`Threshold check: year=${year}, income=${grossIncome}, threshold=${threshold}, isBelow=${threshold !== undefined && grossIncome < threshold}`);
    return threshold !== undefined && grossIncome < threshold;
  }

  private earlyExitSummary(): string {
    if (!this.state.extractedData) {
      return "No data available for summary.";
    }
    
    const { year, gross_income, income_tax_paid, solidaritaetszuschlag, full_name, employer } = this.state.extractedData;
    const threshold = year ? TaxAdvisor.TAX_FREE_THRESHOLDS[year] : 0;
    
    let result = `# 📊 **Tax Filing Summary for ${full_name || "User"}**\n\n`;
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
      name: full_name || "User",
      tax_year: year,
      gross_income: Number(gross_income || 0),
      tax_paid: Number(income_tax_paid || 0),
      solidarity_tax: Number(solidaritaetszuschlag || 0),
      tax_free_threshold: threshold,
      status: "below_threshold",
      estimated_refund: Number(income_tax_paid || 0),
      employer: employer || "Not specified",
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
    
    // Extract numeric amounts from complex responses
    let amount = 0;
    let details = answer;
    
    // Handle complex responses like "1040 for laptop, and 95 for study material"
    const amountMatches = answer.match(/(\d+(?:[.,]\d+)?)\s*(?:euro|eur|€|for|on|spent|cost|paid)?\s*([^,]+)/gi);
    if (amountMatches && amountMatches.length > 0) {
      // Take the first amount found
      const firstMatch = amountMatches[0];
      const numMatch = firstMatch.match(/(\d+(?:[.,]\d+)?)/);
      if (numMatch) {
        amount = parseFloat(numMatch[1].replace(',', '.'));
        details = answer;
      }
    } else {
      // Handle simple numeric responses
      const numericMatch = answer.match(/(\d+(?:[.,]\d+)?)/);
      if (numericMatch) {
        amount = parseFloat(numericMatch[1].replace(',', '.'));
        details = answer;
      }
    }
    
    // Handle special cases like "18km, 210 days" for commuting
    if (currentQuestion.category === 'Travel' && answer.includes('km') && answer.includes('days')) {
      const kmMatch = answer.match(/(\d+)\s*km/i);
      const daysMatch = answer.match(/(\d+)\s*days?/i);
      if (kmMatch && daysMatch) {
        const km = parseInt(kmMatch[1]);
        const days = parseInt(daysMatch[1]);
        amount = km * days * 0.30; // €0.30 per km per day
        details = `${km}km, ${days} days commuting`;
      }
    }
    
    // Cap the amount at the maximum allowed
    const maxAmount = currentQuestion.maxAmount || 0;
    if (amount > maxAmount) {
      console.log(`Capping amount from ${amount} to ${maxAmount} for ${currentQuestion.category}`);
      amount = maxAmount;
    }
    
    console.log(`Final deduction: ${currentQuestion.category} - €${amount} - ${details}`);
    
    return {
      questionId: currentQuestion.id,
      answer: amount > 0,
      amount: amount,
      details: details
    };
  }

  private addDynamicDeduction(category: string, amount: number, details: string): void {
    const deductionId = `dynamic_${category.toLowerCase().replace(/\s+/g, '_')}`;
    this.state.deductionAnswers[deductionId] = {
      questionId: deductionId,
      answer: true,
      amount: amount,
      details: details
    };
  }

  private calculateTaxSummary(): DeductionSummary {
    const totalDeductions = Object.values(this.state.deductionAnswers)
      .filter(a => a.answer)
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    if (!this.state.extractedData) {
      return {
        totalDeductions: 0,
        deductions: [],
        taxableIncome: 0,
        refund: 0
      };
    }

    const grossIncome = this.state.extractedData.gross_income || 0;
    const taxableIncome = Math.max(0, grossIncome - totalDeductions);
    const taxPaid = this.state.extractedData.income_tax_paid || 0;
    
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
    if (!this.state.extractedData) {
      return "No data available for summary.";
    }

    const summary = this.calculateTaxSummary();
    const { year, gross_income, income_tax_paid, full_name, employer } = this.state.extractedData;

    let result = `# 📊 **Tax Filing Summary for ${full_name || "User"}**\n\n`;
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
      name: full_name || "User",
      tax_year: year,
      gross_income: Number(gross_income || 0),
      tax_paid: Number(income_tax_paid || 0),
      detailed_deductions: detailedDeductions,
      total_deductions: summary.totalDeductions,
      taxable_income: summary.taxableIncome,
      estimated_refund: summary.refund,
      employer: employer || "Not specified",
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
    const lastUserMessage = this.state.messages.slice().reverse().find(msg => msg.sender === 'user')?.text.toLowerCase();
    const lastAgentMessage = this.state.messages.slice().reverse().find(msg => msg.sender === 'assistant')?.text.toLowerCase();

    console.log('=== TaxAdvisor Debug ===');
    console.log('Last user message:', lastUserMessage);
    console.log('Last agent message:', lastAgentMessage);
    console.log('Messages count:', this.state.messages.length);
    console.log('Current question index:', this.state.currentQuestionIndex);
    console.log('Deduction flow:', this.state.deductionFlow ? 'set' : 'null');
    console.log('Done state:', this.state.done);

    try {
      // Initial message: Display summary and confirm year
      if (this.state.messages.length === 0) {
        console.log('Handling initial message');
        const summary = this.buildInitialSummary();
        this.addAgentMessage(summary);

        const year = this.state.extractedData?.year;
        if (year) {
          const confirmMsg = `Can you please confirm that the tax year you want to file is ${year}? (yes/no)

If this is correct, I'll help you with your tax filing process. If not, please upload the correct PDF for the year you want to file.`;
          this.addAgentMessage(confirmMsg);
          return `${summary}\n\n${confirmMsg}`;
        }
        
        return summary;
      }
      
      // Handle year confirmation
      if (lastAgentMessage && (lastAgentMessage.includes('confirm that the tax year') || lastAgentMessage.includes('Can you please confirm'))) {
        console.log('Handling year confirmation');
        if (lastUserMessage && /^(yes|y|yeah|correct|right)$/i.test(lastUserMessage)) {
          const year = this.state.extractedData?.year;
          if (year) {
            // Add to filed summaries
            this.state.filedSummaries.push({
              year: year.toString(),
              summary: { taxableIncome: 0, refund: 0 },
              deductions: {}
            });
          }
          
          // Check threshold after year confirmation
          console.log('Checking threshold for year:', year, 'income:', this.state.extractedData?.gross_income);
          if (this.isBelowThreshold()) {
            console.log('Below threshold, showing early exit');
            const summary = this.earlyExitSummary();
            const finalMsg = `${summary}\n\nWould you like to file a tax return for another year?`;
            this.addAgentMessage(finalMsg);
            this.state.done = true;
            return finalMsg;
          }
          
          // If not below threshold, ask for status
          console.log('Above threshold, asking for status');
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
        console.log('Handling status selection');
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
          console.log('Status selected:', status);
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
        console.log('Handling file another year response');
        if (lastUserMessage && /^(yes|y|yeah|sure|ok)$/i.test(lastUserMessage)) {
          this.resetForNewYear();
          const result = "Great! Please upload the PDF for the new year you want to file.";
          return result;
        } else {
          const result = "Thank you for using our tax advisor! Your filing is complete.";
          this.state.done = true;
          return result;
        }
      }
      
      // Handle deduction questions
      const currentQuestion = this.getCurrentQuestion();
      if (currentQuestion && this.state.deductionFlow && this.state.currentQuestionIndex < this.state.deductionFlow.questions.length) {
        console.log('Handling deduction question:', currentQuestion.question);
        
        // Check if the last agent message was asking for an amount or if we're in deduction flow
        const isAskingForAmount = lastAgentMessage && (
          lastAgentMessage.includes('provide the amount') ||
          lastAgentMessage.includes('type "n/a"') ||
          lastAgentMessage.includes('doesn\'t apply to you') ||
          lastAgentMessage.includes('specific amount')
        );
        
        if (isAskingForAmount || this.state.currentQuestionIndex > 0) {
          const deductionAnswer = this.processDeductionAnswer(lastUserMessage || '');
          
          if (deductionAnswer) {
            console.log('Deduction answer processed:', deductionAnswer);
            this.state.deductionAnswers[deductionAnswer.questionId] = deductionAnswer;
            this.state.currentQuestionIndex++;
            
            const nextQuestion = this.getCurrentQuestion();
            if (nextQuestion) {
              const nextMsg = `Great! I've recorded €${deductionAnswer.amount} for ${deductionAnswer.details}.

**${nextQuestion.question}**

Please provide the amount or type "n/a" if this doesn't apply to you.`;
              this.addAgentMessage(nextMsg);
              return nextMsg;
            } else {
              // All questions answered, generate final summary
              console.log('All questions answered, generating final summary');
              const summary = this.generateFinalSummary();
              const finalMsg = `${summary}\n\nWould you like to file a tax return for another year?`;
              this.addAgentMessage(finalMsg);
              this.state.done = true;
              return finalMsg;
            }
          } else {
            const result = "I couldn't understand your response. Please provide a specific amount (e.g., '500') or type 'n/a' if this doesn't apply to you.";
            return result;
          }
        }
      }
      
      // Handle complex responses with multiple amounts
      if (lastUserMessage && lastUserMessage.includes('for') && /\d+/.test(lastUserMessage)) {
        console.log('Handling complex response with amounts');
        const deductionAnswer = this.processDeductionAnswer(lastUserMessage);
        if (deductionAnswer && deductionAnswer.answer) {
          this.state.deductionAnswers[deductionAnswer.questionId] = deductionAnswer;
          this.state.currentQuestionIndex++;
          
          const nextQuestion = this.getCurrentQuestion();
          if (nextQuestion) {
            const nextMsg = `Great! I've recorded €${deductionAnswer.amount} for ${deductionAnswer.details}.

**${nextQuestion.question}**

Please provide the amount or type "n/a" if this doesn't apply to you.`;
            this.addAgentMessage(nextMsg);
            return nextMsg;
          } else {
            const summary = this.generateFinalSummary();
            const finalMsg = `${summary}\n\nWould you like to file a tax return for another year?`;
            this.addAgentMessage(finalMsg);
            this.state.done = true;
            return finalMsg;
          }
        }
      }
      
      // Simple fallback for unrecognized responses
      console.log('No specific handler found, using fallback');
      const fallbackMsg = "I didn't understand your response. Please provide a specific amount (e.g., '500') or type 'n/a' if this doesn't apply to you. You can also restart the conversation by uploading a new PDF.";
      this.addAgentMessage(fallbackMsg);
      return fallbackMsg;
      
    } catch (error) {
      console.error('Error in nextAdvisorMessage:', error);
      const errorMsg = "I encountered an error. Please try uploading your PDF again or restart the conversation.";
      this.addAgentMessage(errorMsg);
      return errorMsg;
    }
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

  getFiledYears(): Set<number> {
    return new Set(this.state.filedSummaries.map(summary => parseInt(summary.year)));
  }

  getDeductionAnswers(): DeductionAnswer[] {
    return Object.values(this.state.deductionAnswers);
  }

  getTaxCalculation(): TaxCalculation | null {
    if (!this.state.taxCalculation) {
      const summary = this.calculateTaxSummary();
      if (!this.state.extractedData) {
        return null;
      }
      this.state.taxCalculation = {
        grossIncome: this.state.extractedData.gross_income || 0,
        totalDeductions: summary.totalDeductions,
        taxableIncome: summary.taxableIncome,
        estimatedTax: summary.taxableIncome * 0.15,
        taxPaid: this.state.extractedData.income_tax_paid || 0,
        refund: summary.refund,
        year: this.state.extractedData.year || 0
      };
    }
    return this.state.taxCalculation;
  }

  reset(): void {
    this.state = {
      messages: [],
      loading: false,
      step: 'upload',
      extractedData: null,
      multiPDFData: null,
      filedSummaries: this.state.filedSummaries, // Keep filedSummaries across resets
      deductionAnswers: {},
      currentQuestionIndex: 0,
      deductionFlow: null,
      taxCalculation: null,
      done: false
    };
    
    // Reset LangChain memory
    this.memory.clear();
    this.agentExecutor = null;
  }

  private resetForNewYear(): void {
    // Preserve filed years but clear current year data
    const preservedFiledSummaries = [...this.state.filedSummaries];
    
    this.state = {
      messages: [],
      loading: false,
      step: 'upload',
      extractedData: null,
      multiPDFData: null,
      filedSummaries: preservedFiledSummaries, // Keep filedSummaries across resets
      deductionAnswers: {},
      currentQuestionIndex: 0,
      deductionFlow: null,
      taxCalculation: null,
      done: false
    };
    
    // Reset LangChain memory
    this.memory.clear();
    this.agentExecutor = null;
  }
}

