import { z } from 'zod';

// Agent Request Schemas
export const AgentInitializeSchema = z.object({
  action: z.literal('initialize'),
  sessionId: z.string().min(1, 'Session ID is required'),
  extractedData: z.object({
    full_name: z.string().optional(),
    address: z.string().optional(),
    employer: z.string().optional(),
    total_hours: z.number().optional(),
    gross_income: z.number().optional(),
    income_tax_paid: z.number().optional(),
    solidaritaetszuschlag: z.number().optional(),
    year: z.number().optional(),
    fallback: z.string().optional(),
    error: z.string().optional(),
  }).optional(),
  existingData: z.object({
    year: z.number(),
    gross_income: z.number(),
    income_tax_paid: z.number(),
    employer: z.string(),
  }).optional(),
  suggestedDeductions: z.array(z.object({
    category: z.string(),
    amount: z.number(),
  })).optional(),
});

export const AgentRespondSchema = z.object({
  action: z.literal('respond'),
  sessionId: z.string().min(1, 'Session ID is required'),
  message: z.string().optional(),
  extractedData: z.object({
    full_name: z.string().optional(),
    address: z.string().optional(),
    employer: z.string().optional(),
    total_hours: z.number().optional(),
    gross_income: z.number().optional(),
    income_tax_paid: z.number().optional(),
    solidaritaetszuschlag: z.number().optional(),
    year: z.number().optional(),
    fallback: z.string().optional(),
    error: z.string().optional(),
  }).optional(),
  multiPDFData: z.any().optional(),
});

export const RunAgentSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  input: z.string().min(1, 'Input is required'),
  conversationId: z.string().optional(),
  extractedData: z.any().optional(),
  deductionAnswers: z.record(z.any()).optional(),
});

export const AutodetectSchema = z.object({
  statusKey: z.enum(['bachelor', 'master', 'new_employee', 'full_time']),
  taxYear: z.string().optional(),
  pdfs: z.array(z.instanceof(File)).min(1, 'At least one PDF file is required'),
});

// Agent Response Schemas
export const AgentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  done: z.boolean(),
  deduction_flow: z.any().nullable(),
  current_question_index: z.number(),
  conversation_id: z.string().optional(),
  step: z.string().optional(),
});

export const RunAgentResponseSchema = z.object({
  success: z.boolean(),
  result: z.string(),
  state: z.object({
    conversationId: z.string(),
    step: z.string(),
    isComplete: z.boolean(),
    currentQuestionIndex: z.number(),
    hasExtractedData: z.boolean(),
    hasDeductionFlow: z.boolean(),
    messagesCount: z.number(),
    done: z.boolean(),
  }),
});

export const AutodetectResponseSchema = z.object({
  deductions: z.array(z.object({
    category: z.string(),
    basis: z.number(),
    cap: z.number().nullable(),
    deductible: z.number(),
    label: z.string().optional(),
    rationale: z.string().optional(),
  })),
  extractedFields: z.any(),
  taxYear: z.number(),
  summary: z.object({
    totalIncome: z.number(),
    basicAllowance: z.number(),
    isBelowThreshold: z.boolean(),
  }),
});

// Type exports
export type AgentInitializeRequest = z.infer<typeof AgentInitializeSchema>;
export type AgentRespondRequest = z.infer<typeof AgentRespondSchema>;
export type RunAgentRequest = z.infer<typeof RunAgentSchema>;
export type AutodetectRequest = z.infer<typeof AutodetectSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type RunAgentResponse = z.infer<typeof RunAgentResponseSchema>;
export type AutodetectResponse = z.infer<typeof AutodetectResponseSchema>; 