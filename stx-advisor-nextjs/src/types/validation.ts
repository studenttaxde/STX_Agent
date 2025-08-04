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

// Type exports
export type AgentInitializeRequest = z.infer<typeof AgentInitializeSchema>;
export type AgentRespondRequest = z.infer<typeof AgentRespondSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>; 