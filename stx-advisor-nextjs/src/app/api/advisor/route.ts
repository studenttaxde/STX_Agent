import { NextRequest, NextResponse } from 'next/server';
import { ExtractedData } from '@/types';

// Simple conversation state
interface ConversationState {
  sessionId: string;
  extractedData?: ExtractedData;
  messages: Array<{ sender: 'user' | 'assistant'; text: string; timestamp: Date }>;
  currentStep: 'upload' | 'extract' | 'confirm' | 'questions' | 'calculate' | 'summary';
  deductionAnswers: Record<string, any>;
  currentQuestionIndex: number;
  done: boolean;
}

// Store conversation states per session
const conversationStates = new Map<string, ConversationState>();

// Tax-free thresholds by year
const TAX_FREE_THRESHOLDS: Record<number, number> = {
  2021: 9744,
  2022: 10347,
  2023: 10908,
  2024: 10908,
  2025: 11280,
  2026: 11640
};

function getOrCreateConversation(sessionId: string): ConversationState {
  if (!conversationStates.has(sessionId)) {
    console.log('Creating new conversation state for session:', sessionId);
    conversationStates.set(sessionId, {
      sessionId,
      messages: [],
      currentStep: 'upload',
      deductionAnswers: {},
      currentQuestionIndex: 0,
      done: false
    });
  } else {
    console.log('Using existing conversation state for session:', sessionId);
  }
  return conversationStates.get(sessionId)!;
}

function buildInitialSummary(extractedData: ExtractedData): string {
  const { full_name, employer, gross_income, income_tax_paid, solidaritaetszuschlag, year } = extractedData;

  return `Here's what I found from your documents:

👤 **Name:** ${full_name || "N/A"}
🏢 **Employer:** ${employer || "N/A"}
💶 **Gross Income:** €${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
💰 **Lohnsteuer Paid:** €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
${solidaritaetszuschlag ? `💸 **Solidarity Tax:** €${Number(solidaritaetszuschlag).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n` : ''}📅 **Detected Tax Year:** ${year || "Not specified"}

Can you please confirm that the tax year you want to file is ${year}? (yes/no)

If this is correct, I'll help you with your tax filing process. If not, please upload the correct PDF for the year you want to file.`;
}

function isBelowThreshold(income: number, year: number): boolean {
  const threshold = TAX_FREE_THRESHOLDS[year];
  return threshold !== undefined && income < threshold;
}

function generateEarlyExitSummary(extractedData: ExtractedData): string {
  const { year, gross_income, income_tax_paid, full_name, employer } = extractedData;
  const threshold = year ? TAX_FREE_THRESHOLDS[year] : 0;
  
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
  
  result += `Would you like to file a tax return for another year?`;
  
  return result;
}

function getStatusSelectionMessage(): string {
  return `Since your income exceeds the tax-free threshold, let's check for deductible expenses to reduce your taxable income.

Please select your status for the year:
1. **bachelor** (Bachelor's student)
2. **master** (Master's student)  
3. **new_employee** (Started job after graduation)
4. **full_time** (Full-time employee)`;
}

export async function POST(request: NextRequest) {
  try {
    console.log('Advisor API called');
    const body = await request.json();
    const { action, sessionId, extractedData, message, existingData, suggestedDeductions } = body;

    console.log('Request body:', { action, sessionId, hasExtractedData: !!extractedData, hasMessage: !!message });

    if (!sessionId) {
      console.error('Missing sessionId in request');
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const conversation = getOrCreateConversation(sessionId);

    switch (action) {
      case 'initialize':
        console.log('Initializing conversation with extracted data:', extractedData);
        if (extractedData) {
          conversation.extractedData = extractedData as ExtractedData;
          conversation.currentStep = 'extract';
        }
        
        // If there's existing data, add it to the conversation
        if (existingData) {
          console.log('Adding existing data to conversation:', existingData);
          conversation.messages.push({
            sender: 'user',
            text: `I have existing data for ${existingData.year}: Income: €${existingData.gross_income}, Tax Paid: €${existingData.income_tax_paid}, Employer: ${existingData.employer}`,
            timestamp: new Date()
          });
        }
        
        // If there are suggested deductions, add them to the conversation
        if (suggestedDeductions && suggestedDeductions.length > 0) {
          console.log('Adding suggested deductions to conversation:', suggestedDeductions);
          const deductionSuggestions = suggestedDeductions.map((d: any) => `${d.category}: €${d.amount}`).join(', ');
          conversation.messages.push({
            sender: 'user',
            text: `Based on previous years, you commonly claimed: ${deductionSuggestions}`,
            timestamp: new Date()
          });
        }
        
        console.log('Getting initial message');
        let initialMessage = '';
        
        if (conversation.extractedData) {
          initialMessage = buildInitialSummary(conversation.extractedData);
        } else {
          initialMessage = "Welcome! I'm here to help you with your German tax filing. Please upload your tax documents to get started.";
        }
        
        conversation.messages.push({
          sender: 'assistant',
          text: initialMessage,
          timestamp: new Date()
        });
        
        console.log('Initial message generated:', initialMessage);
        
        return NextResponse.json({
          success: true,
          message: initialMessage,
          done: false,
          deduction_flow: null,
          current_question_index: 0
        });

      case 'respond':
        console.log('Processing user response:', message);
        console.log('Current conversation state:', {
          messagesCount: conversation.messages.length,
          extractedData: conversation.extractedData,
          currentStep: conversation.currentStep
        });
        
        // Add user message to conversation
        if (message) {
          conversation.messages.push({
            sender: 'user',
            text: message,
            timestamp: new Date()
          });
        }

        // Process the response based on current step
        let nextMessage = '';
        
        if (conversation.currentStep === 'extract') {
          // User confirmed the year
          if (message && /^(yes|y|yeah|correct|right)$/i.test(message)) {
            console.log('Year confirmed - checking threshold');
            
            if (conversation.extractedData) {
              const year = conversation.extractedData.year;
              const grossIncome = conversation.extractedData.gross_income || 0;
              
              if (year && isBelowThreshold(grossIncome, year)) {
                // Below threshold - show early exit
                nextMessage = generateEarlyExitSummary(conversation.extractedData);
                conversation.currentStep = 'summary';
                conversation.done = true;
              } else {
                // Above threshold - ask for status
                nextMessage = getStatusSelectionMessage();
                conversation.currentStep = 'questions';
              }
            }
          } else if (message && /^(no|n|nope|not correct|wrong year)$/i.test(message)) {
            nextMessage = "Please upload the correct PDF for the year you want to file.";
            conversation.currentStep = 'upload';
          } else {
            nextMessage = "Please confirm if the tax year is correct by answering 'yes' or 'no'.";
          }
        } else if (conversation.currentStep === 'questions') {
          // Handle status selection
          let status: string | null = null;
          
          if (message && /^[1-4]$/.test(message)) {
            const statusMap: Record<string, string> = {
              '1': 'bachelor',
              '2': 'master', 
              '3': 'new_employee',
              '4': 'full_time'
            };
            status = statusMap[message];
          } else if (message && ['bachelor', 'master', 'new_employee', 'full_time'].includes(message)) {
            status = message;
          }
          
          if (status) {
            nextMessage = `Perfect! I've set your status as: **${status.replace('_', ' ').toUpperCase()}**

Now I'll help you with your tax filing. Since this is a simplified version, I'll provide you with a summary of your tax situation.

Based on your extracted data, here's your tax summary:

**Tax Year:** ${conversation.extractedData?.year}
**Gross Income:** €${Number(conversation.extractedData?.gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
**Tax Paid:** €${Number(conversation.extractedData?.income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}

For a complete analysis with deductions and personalized questions, please use the full Pfleged AI agent.

Would you like to file a tax return for another year?`;
            conversation.currentStep = 'summary';
            conversation.done = true;
          } else {
            nextMessage = "Please choose a valid status by typing the number (1-4) or the status name: bachelor, master, new_employee, or full_time.";
          }
        } else if (conversation.currentStep === 'summary') {
          // Handle "file for another year" response
          if (message && /^(yes|y|yeah|sure|ok)$/i.test(message)) {
            nextMessage = "Perfect! I've reset the system for a new year. Please upload the PDF for the new year you want to file, and I'll help you with that tax return.";
            conversation.currentStep = 'upload';
            conversation.done = false;
            conversation.messages = [];
            conversation.extractedData = undefined;
            conversation.deductionAnswers = {};
            conversation.currentQuestionIndex = 0;
          } else if (message && /^(no|n|nope|not|false)$/i.test(message)) {
            nextMessage = "Thank you for using our tax advisor! Your filing is complete. You can always come back to file for another year later.";
            conversation.done = true;
          } else {
            nextMessage = "Please answer 'yes' if you want to file for another year, or 'no' to finish.";
          }
        } else {
          nextMessage = "I'm here to help with your German tax filing. Please follow the conversation flow and let me know if you need any clarification.";
        }
        
        // Add agent response to conversation
        conversation.messages.push({
          sender: 'assistant',
          text: nextMessage,
          timestamp: new Date()
        });
        
        console.log('Next message generated:', nextMessage);
        
        return NextResponse.json({
          success: true,
          message: nextMessage,
          done: conversation.done,
          deduction_flow: null,
          current_question_index: conversation.currentQuestionIndex,
          conversation_id: conversation.sessionId,
          step: conversation.currentStep
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Advisor API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }
    
    // Remove the session from memory
    if (conversationStates.has(sessionId)) {
      conversationStates.delete(sessionId);
      console.log('Removed conversation session:', sessionId);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
