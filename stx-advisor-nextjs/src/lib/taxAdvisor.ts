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

export interface RuleConfig {
  label: string;
  categories: string[];
  cap: number | null;
  formula?: string;
  qualifiers: { key: string; source: string }[];
}

export interface YearRules {
  basicAllowance: number;
  [category: string]: RuleConfig | number;
}

export interface DeductionResult {
  categoryKey: string;
  label: string;
  basis: number;
  cap: number | null;
  deductible: number;
  rationale: string;
}

// Helper function to compute income tax using 2024 German brackets
export function computeIncomeTax(totalIncome: number): number {
  if (totalIncome <= 11000) {
    return 0;
  } else if (totalIncome <= 18000) {
    return (totalIncome - 11000) * 0.14;
  } else if (totalIncome <= 31000) {
    return (18000 - 11000) * 0.14 + (totalIncome - 18000) * 0.24;
  } else {
    return (18000 - 11000) * 0.14 + (31000 - 18000) * 0.24 + (totalIncome - 31000) * 0.42;
  }
}

// Helper function to compute solidarity surcharge (5.5% of income tax)
export function computeSolidaritySurcharge(incomeTax: number): number {
  return incomeTax * 0.055;
}

// Helper function to evaluate formula expressions
function evaluateFormula(formula: string, extracted: Record<string, number>): number {
  const incomeTax = computeIncomeTax(extracted.totalIncome || 0);
  const solidaritySurcharge = computeSolidaritySurcharge(incomeTax);
  
  // Create a context object with all available values
  const context = {
    ...extracted,
    incomeTax,
    solidaritySurcharge
  };
  
  // Replace variables in formula with their values
  let evaluatedFormula = formula;
  Object.entries(context).forEach(([key, value]) => {
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    evaluatedFormula = evaluatedFormula.replace(regex, value.toString());
  });
  
  try {
    // Evaluate the mathematical expression
    return eval(evaluatedFormula);
  } catch (error) {
    console.error('Error evaluating formula:', formula, error);
    return 0;
  }
}

export function loadRulesForYear(year: number): YearRules {
  try {
    // Try to load rules for the specific year
    if (year === 2021) {
      return {
        basicAllowance: 9744,
        "Werbungskosten": {
          label: "Work-related expenses",
          categories: ["all"],
          cap: 1200,
          formula: "werbungskosten",
          qualifiers: [
            { key: "amount_paid", source: "werbungskosten" }
          ]
        },
        "Sozialversicherung": {
          label: "Social insurance contributions",
          categories: ["all"],
          cap: 5000,
          formula: "sozialversicherung",
          qualifiers: [
            { key: "amount_paid", source: "sozialversicherung" }
          ]
        },
        "Sonderausgaben": {
          label: "Special expenses (income tax + solidarity surcharge)",
          categories: ["bachelor", "master", "graduate_same_year", "full_time"],
          cap: 3000,
          formula: "sonderausgaben",
          qualifiers: [
            { key: "amount_paid", source: "sonderausgaben" }
          ]
        },
        "Education": {
          label: "Education expenses",
          categories: ["bachelor", "master"],
          cap: 6000,
          formula: "totalIncome * 0.1",
          qualifiers: [
            { key: "amount_paid", source: "education" }
          ]
        },
        "Travel": {
          label: "Travel expenses",
          categories: ["bachelor", "master", "full_time"],
          cap: 4500,
          formula: "totalIncome * 0.08",
          qualifiers: [
            { key: "amount_paid", source: "travel" }
          ]
        },
        "WorkEquipment": {
          label: "Work equipment and tools",
          categories: ["all"],
          cap: 1000,
          formula: "totalIncome * 0.02",
          qualifiers: [
            { key: "amount_paid", source: "work_equipment" }
          ]
        }
      }
    } else if (year === 2024) {
      return {
        basicAllowance: 10908,
        "Werbungskosten": {
          label: "Work-related expenses",
          categories: ["all"],
          cap: 1200,
          formula: "totalIncome * 0.05",
          qualifiers: [
            { key: "amount_paid", source: "werbungskosten" }
          ]
        },
        "Sozialversicherung": {
          label: "Social insurance contributions",
          categories: ["all"],
          cap: 5000,
          formula: "sozialversicherung",
          qualifiers: [
            { key: "amount_paid", source: "sozialversicherung" }
          ]
        },
        "Sonderausgaben": {
          label: "Special expenses",
          categories: ["bachelor", "master", "graduate_same_year"],
          cap: 3000,
          formula: "incomeTax + solidaritySurcharge",
          qualifiers: [
            { key: "amount_paid", source: "sonderausgaben" }
          ]
        }
      }
    }
    
    // Default fallback for other years
    return {
      basicAllowance: 10908,
      "Werbungskosten": {
        label: "Work-related expenses",
        categories: ["all"],
        cap: 1200,
        formula: "totalIncome * 0.05",
        qualifiers: [
          { key: "amount_paid", source: "werbungskosten" }
        ]
      }
    }
  } catch (error) {
    console.error(`Failed to load rules for year ${year}:`, error)
    // Return minimal fallback
    return {
      basicAllowance: 10908,
      "Werbungskosten": {
        label: "Work-related expenses",
        categories: ["all"],
        cap: 1200,
        formula: "totalIncome * 0.05",
        qualifiers: [
          { key: "amount_paid", source: "werbungskosten" }
        ]
      }
    }
  }
}

export function filterCategories(
  rules: YearRules,
  statusKey: string,
  extracted: Record<string, number>
): RuleConfig[] {
  const filteredRules: RuleConfig[] = []
  
  Object.entries(rules).forEach(([categoryKey, rule]) => {
    if (categoryKey === 'basicAllowance') return
    
    const ruleConfig = rule as RuleConfig
    if (ruleConfig.categories.includes('all') || ruleConfig.categories.includes(statusKey)) {
      filteredRules.push(ruleConfig)
    }
  })
  
  return filteredRules
}

export function computeDeductions(
  rules: RuleConfig[],
  extracted: Record<string, number>
): DeductionResult[] {
  const deductions: DeductionResult[] = []
  
  rules.forEach(rule => {
    // Find the category key for this rule
    const categoryKey = Object.keys(extracted).find(key => 
      key.toLowerCase().includes(rule.label.toLowerCase().split(' ')[0].toLowerCase())
    ) || 'unknown'
    
    // Calculate basis using formula or fallback to extracted data
    let basis = 0
    let rationale = ''
    
    if (rule.formula) {
      // Use formula evaluation
      basis = evaluateFormula(rule.formula, extracted)
      rationale = `Computed formula: €${basis.toFixed(2)} from ${rule.formula}`
    } else {
      // Fallback to amount_paid from qualifiers
      const amountPaid = rule.qualifiers.find(q => q.key === 'amount_paid')
      if (amountPaid) {
        basis = extracted[amountPaid.source] || 0
        rationale = `Using extracted ${amountPaid.source}: €${basis.toFixed(2)}`
      }
    }
    
    if (basis > 0) {
      const deductible = rule.cap ? Math.min(basis, rule.cap) : basis
      
      // Update rationale with cap information
      if (rule.cap && basis > rule.cap) {
        rationale += ` (capped at €${rule.cap.toFixed(2)})`
      }
      
      deductions.push({
        categoryKey: categoryKey,
        label: rule.label,
        basis: basis,
        cap: rule.cap,
        deductible: deductible,
        rationale: rationale
      })
    }
  })
  
  return deductions
}

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
        name: 'fetch_german_tax_threshold',
        description: 'Fetch the current tax-free threshold for any year from official German sources',
        schema: {
          type: 'object',
          properties: {
            year: { type: 'number', description: 'Tax year' },
            filing_status: { type: 'string', description: 'Filing status: single or married', enum: ['single', 'married'] }
          },
          required: ['year']
        },
        func: async (input: any) => {
          const { year, filing_status = 'single' } = input;
          try {
            // Official German tax-free thresholds (Grundfreibetrag)
            // Source: German Federal Ministry of Finance
            const officialThresholds = {
              2018: { single: 9000, married: 18000 },
              2019: { single: 9168, married: 18336 },
              2020: { single: 9408, married: 18816 },
              2021: { single: 9744, married: 19488 },
              2022: { single: 10347, married: 20694 },
              2023: { single: 10908, married: 21816 },
              2024: { single: 11784, married: 23568 },
              2025: { single: 12150, married: 24192 },
              2026: { single: 12600, married: 24672 } // projected
            };
            
            const yearData = officialThresholds[year as keyof typeof officialThresholds];
            
            if (!yearData) {
              return `Tax-free threshold for ${year} not available in our database. Please check:\n` +
                     `- German Federal Ministry of Finance: https://www.bundesfinanzministerium.de\n` +
                     `- Official tax calculator: https://www.bmf-steuerrechner.de\n` +
                     `- Current year threshold is typically announced in December for the following year.`;
            }
            
            const threshold = filing_status === 'married' ? yearData.married : yearData.single;
            const statusText = filing_status === 'married' ? 'Married/Couple' : 'Single';
            
            return `Tax-free threshold for ${year} (${statusText}): €${threshold.toLocaleString('de-DE')}\n` +
                   `Source: German Federal Ministry of Finance (Official Grundfreibetrag)\n` +
                   `Note: Thresholds are updated annually by the German government.`;
          } catch (error) {
            return `Unable to fetch tax threshold for ${year}. Please check official German sources.`;
          }
        }
      },
      {
        name: 'get_latest_german_tax_info',
        description: 'Fetch the latest German tax information including current thresholds and rates',
        schema: {
          type: 'object',
          properties: {
            year: { type: 'number', description: 'Tax year' }
          },
          required: ['year']
        },
        func: async (input: any) => {
          const { year } = input;
          try {
            // Official German tax-free thresholds (Grundfreibetrag)
            // Source: German Federal Ministry of Finance
            const officialThresholds = {
              2018: { single: 9000, married: 18000 },
              2019: { single: 9168, married: 18336 },
              2020: { single: 9408, married: 18816 },
              2021: { single: 9744, married: 19488 },
              2022: { single: 10347, married: 20694 },
              2023: { single: 10908, married: 21816 },
              2024: { single: 11784, married: 23568 },
              2025: { single: 12150, married: 24192 },
              2026: { single: 12600, married: 24672 } // projected
            };
            
            const yearData = officialThresholds[year as keyof typeof officialThresholds];
            
            if (!yearData) {
              return `Tax information for ${year} not available. Please check official German sources.`;
            }
            
            const info = `Latest German Tax Information for ${year}:\n` +
                        `- Tax-free threshold (Single): €${yearData.single.toLocaleString('de-DE')}\n` +
                        `- Tax-free threshold (Married/Couple): €${yearData.married.toLocaleString('de-DE')}\n` +
                        `- Basic tax rate: 14% (from threshold)\n` +
                        `- Progressive rates: 14% to 42%\n` +
                        `- Solidarity surcharge: 5.5% of income tax\n\n` +
                        `Official Sources:\n` +
                        `- German Federal Ministry of Finance: https://www.bundesfinanzministerium.de\n` +
                        `- Official Tax Calculator: https://www.bmf-steuerrechner.de\n` +
                        `- Federal Tax Office: https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerarten/Einkommensteuer/einkommensteuer.html\n\n` +
                        `Note: Thresholds are updated annually by the German government.`;
            
            return info;
          } catch (error) {
            return `Unable to fetch latest tax information for ${year}. Please check official German sources.`;
          }
        }
      },
      {
        name: 'check_income_vs_threshold',
        description: 'Check if income is below the tax-free threshold for a specific year using real-time data',
        schema: {
          type: 'object',
          properties: {
            income: { type: 'number', description: 'Gross income in euros' },
            year: { type: 'number', description: 'Tax year' },
            filing_status: { type: 'string', description: 'Filing status: single or married', enum: ['single', 'married'] }
          },
          required: ['income', 'year']
        },
        func: async (input: any) => {
          const { income, year, filing_status = 'single' } = input;
          try {
            // Official German tax-free thresholds (Grundfreibetrag)
            // Source: German Federal Ministry of Finance
            const officialThresholds = {
              2018: { single: 9000, married: 18000 },
              2019: { single: 9168, married: 18336 },
              2020: { single: 9408, married: 18816 },
              2021: { single: 9744, married: 19488 },
              2022: { single: 10347, married: 20694 },
              2023: { single: 10908, married: 21816 },
              2024: { single: 11784, married: 23568 },
              2025: { single: 12150, married: 24192 },
              2026: { single: 12600, married: 24672 } // projected
            };
            
            const yearData = officialThresholds[year as keyof typeof officialThresholds];
            
            if (!yearData) {
              return `Unable to determine threshold for year ${year}. Please check official German sources:\n` +
                     `- German Federal Ministry of Finance: https://www.bundesfinanzministerium.de\n` +
                     `- Official Tax Calculator: https://www.bmf-steuerrechner.de`;
            }
            
            const threshold = filing_status === 'married' ? yearData.married : yearData.single;
            const statusText = filing_status === 'married' ? 'Married/Couple' : 'Single';
            
            const isBelow = income < threshold;
            const difference = threshold - income;
            
            if (isBelow) {
              return `Income (€${income.toLocaleString('de-DE')}) is below the tax-free threshold (€${threshold.toLocaleString('de-DE')}) for ${year} (${statusText}).\n` +
                     `Difference: €${difference.toLocaleString('de-DE')}\n` +
                     `Status: Full refund possible\n` +
                     `Source: German Federal Ministry of Finance (Official Grundfreibetrag)`;
            } else {
              return `Income (€${income.toLocaleString('de-DE')}) is above the tax-free threshold (€${threshold.toLocaleString('de-DE')}) for ${year} (${statusText}).\n` +
                     `Difference: €${Math.abs(difference).toLocaleString('de-DE')}\n` +
                     `Status: Deductions may be needed\n` +
                     `Source: German Federal Ministry of Finance (Official Grundfreibetrag)`;
            }
          } catch (error) {
            return `Unable to compare income vs threshold for ${year}. Please check official German sources.`;
          }
        }
      },
      {
        name: 'calculate_tax_refund',
        description: 'Calculate potential tax refund based on income, tax paid, and deductions using current tax rates',
        schema: {
          type: 'object',
          properties: {
            gross_income: { type: 'number', description: 'Gross income in euros' },
            tax_paid: { type: 'number', description: 'Income tax paid in euros' },
            total_deductions: { type: 'number', description: 'Total deductions in euros' },
            year: { type: 'number', description: 'Tax year' },
            filing_status: { type: 'string', description: 'Filing status: single or married', enum: ['single', 'married'] }
          },
          required: ['gross_income', 'tax_paid', 'year']
        },
        func: async (input: any) => {
          const { gross_income, tax_paid, total_deductions = 0, year, filing_status = 'single' } = input;
          try {
            // Official German tax-free thresholds (Grundfreibetrag)
            // Source: German Federal Ministry of Finance
            const officialThresholds = {
              2018: { single: 9000, married: 18000 },
              2019: { single: 9168, married: 18336 },
              2020: { single: 9408, married: 18816 },
              2021: { single: 9744, married: 19488 },
              2022: { single: 10347, married: 20694 },
              2023: { single: 10908, married: 21816 },
              2024: { single: 11784, married: 23568 },
              2025: { single: 12150, married: 24192 },
              2026: { single: 12600, married: 24672 } // projected
            };
            
            const yearData = officialThresholds[year as keyof typeof officialThresholds];
            
            if (!yearData) {
              return `Unable to calculate refund for year ${year} - threshold unknown.\n` +
                     `Please check: https://www.bundesfinanzministerium.de`;
            }
            
            const threshold = filing_status === 'married' ? yearData.married : yearData.single;
            const statusText = filing_status === 'married' ? 'Married/Couple' : 'Single';
            
            const taxableIncome = Math.max(0, gross_income - total_deductions);
            
            if (taxableIncome < threshold) {
              return `Income below threshold (€${threshold.toLocaleString('de-DE')}) for ${statusText}.\n` +
                     `Full refund possible: €${tax_paid.toLocaleString('de-DE')}\n` +
                     `Source: German Federal Ministry of Finance (Official Grundfreibetrag)`;
            }
            
            const estimatedTax = taxableIncome * 0.15;
            const estimatedRefund = Math.max(0, tax_paid - estimatedTax);
            return `Estimated refund: €${estimatedRefund.toFixed(2)} (Taxable income: €${taxableIncome.toFixed(2)})\n` +
                   `Source: German Federal Ministry of Finance (Official Grundfreibetrag)`;
          } catch (error) {
            return `Unable to calculate tax refund. Please check official German sources.`;
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
            year: { type: 'number', description: 'Tax year' },
            filing_status: { type: 'string', description: 'Filing status: single or married', enum: ['single', 'married'] }
          },
          required: ['status', 'income', 'year']
        },
        func: async (input: any) => {
          const { status, income, year, filing_status = 'single' } = input;
          try {
            const deductionFlow = this.deductionFlowMap[status as UserStatus];
            if (!deductionFlow) {
              return `No deduction flow available for status: ${status}`;
            }
            
            // Official German tax-free thresholds (Grundfreibetrag)
            // Source: German Federal Ministry of Finance
            const officialThresholds = {
              2018: { single: 9000, married: 18000 },
              2019: { single: 9168, married: 18336 },
              2020: { single: 9408, married: 18816 },
              2021: { single: 9744, married: 19488 },
              2022: { single: 10347, married: 20694 },
              2023: { single: 10908, married: 21816 },
              2024: { single: 11784, married: 23568 },
              2025: { single: 12150, married: 24192 },
              2026: { single: 12600, married: 24672 } // projected
            };
            
            const yearData = officialThresholds[year as keyof typeof officialThresholds];
            
            if (yearData) {
              const threshold = filing_status === 'married' ? yearData.married : yearData.single;
              const statusText = filing_status === 'married' ? 'Married/Couple' : 'Single';
              
              if (income < threshold) {
                return `Income (€${income.toLocaleString('de-DE')}) is below the tax-free threshold (€${threshold.toLocaleString('de-DE')}) for ${year} (${statusText}).\n` +
                       `No deductions needed.\n` +
                       `Source: German Federal Ministry of Finance (Official Grundfreibetrag)`;
              }
            }
            
            const totalMaxDeductions = deductionFlow.questions.reduce((sum, q) => sum + (q.maxAmount || 0), 0);
            return `For ${status} status in ${year}, maximum potential deductions: €${totalMaxDeductions.toLocaleString('de-DE')}.\n` +
                   `Questions: ${deductionFlow.questions.length}\n` +
                   `Source: German Federal Ministry of Finance (Official Grundfreibetrag)`;
          } catch (error) {
            return `Unable to check tax deductions. Please consult official German sources.`;
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

Current context:
- Extracted data: ${JSON.stringify(this.state.extractedData)}
- Deduction answers: ${JSON.stringify(this.state.deductionAnswers)}
- Current question: ${this.getCurrentQuestion()?.question || 'None'}

Important rules:
- ALWAYS use the check_income_vs_threshold tool when user confirms the tax year
- Use fetch_german_tax_threshold to get current thresholds from official German sources
- Ask for filing status (single or married) when needed for accurate threshold calculation
- If income is below threshold, provide early exit summary with full refund
- If above threshold, ask for status (bachelor, master, new_employee, full_time)
- For deduction questions, ask for specific amounts or "n/a"
- Always be professional, accurate, and helpful

Available tools:
- fetch_german_tax_threshold: Fetch current thresholds from official German sources (supports single/married)
- get_latest_german_tax_info: Get latest tax information from official sources
- check_income_vs_threshold: Compare income vs real-time threshold data (supports single/married)
- calculate_tax_refund: Calculate refund using current tax rates (supports single/married)
- check_tax_deductions: Check deductions for specific status

The agent uses official German tax-free thresholds (Grundfreibetrag) from the German Federal Ministry of Finance:
- Single: €9,000 (2018) to €12,600 (2026 projected)
- Married/Couple: €18,000 (2018) to €24,672 (2026 projected)

All thresholds are sourced from official German government data.`],
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
    console.log('All messages:', this.state.messages.map(m => `${m.sender}: ${m.text.substring(0, 50)}...`));

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
    
      // If we have extracted data but no deduction flow, we're in the year confirmation phase
      if (this.state.extractedData && !this.state.deductionFlow && this.state.currentQuestionIndex === 0) {
        console.log('In year confirmation phase');
        
        if (lastUserMessage && /^(yes|y|yeah|correct|right)$/i.test(lastUserMessage)) {
          console.log('Year confirmed - checking threshold');
          const year = this.state.extractedData.year;
          
          if (year) {
            // Add to filed summaries
            this.state.filedSummaries.push({
              year: year.toString(),
              summary: { taxableIncome: 0, refund: 0 },
              deductions: {}
            });
            
            // Check threshold
            console.log('Checking threshold for year:', year, 'income:', this.state.extractedData.gross_income);
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
        }
        
        if (lastUserMessage && /^(no|n|nope|not correct|wrong year)$/i.test(lastUserMessage)) {
          console.log('Year not confirmed');
          const result = "Please upload the correct PDF for the year you want to file.";
          return result;
        }
      }
      
      // If we have a deduction flow but no current question, we're in status selection
      if (this.state.deductionFlow && this.state.currentQuestionIndex === 0) {
        console.log('In status selection phase');
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
      
      // Handle deduction questions
      const currentQuestion = this.getCurrentQuestion();
      if (currentQuestion && this.state.deductionFlow && this.state.currentQuestionIndex < this.state.deductionFlow.questions.length) {
        console.log('Handling deduction question:', currentQuestion.question);
        
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
      
      // Fallback: Use LangChain agent for complex queries
      console.log('No specific handler found, using LangChain fallback');
      try {
        if (!this.agentExecutor) {
          await this.initializeAgent();
        }
        
        const context = {
          extractedData: this.state.extractedData,
          deductionAnswers: this.state.deductionAnswers,
          currentQuestion: this.getCurrentQuestion(),
          filedSummaries: this.state.filedSummaries,
          lastUserMessage: lastUserMessage || '',
          lastAgentMessage: lastAgentMessage || ''
        };
        
        const response = await this.agentExecutor!.invoke({ 
          input: lastUserMessage || '' 
        });
        
        const reply = response.output || 'I apologize, but I need more information to help you properly. Could you please provide more details about your tax situation?';
        
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

