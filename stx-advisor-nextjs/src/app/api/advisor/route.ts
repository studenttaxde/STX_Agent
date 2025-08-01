import { NextRequest, NextResponse } from 'next/server';
import { PflegedAgent } from '@/lib/taxAdvisorAgent';
import { ExtractedData } from '@/types';

// Store agent instances per session (in production, use Redis or database)
const agentSessions = new Map<string, PflegedAgent>();

function getOrCreateAgent(sessionId: string): PflegedAgent {
  if (!agentSessions.has(sessionId)) {
    console.log('Creating new PflegedAgent instance for session:', sessionId);
    agentSessions.set(sessionId, new PflegedAgent());
  } else {
    console.log('Using existing PflegedAgent instance for session:', sessionId);
  }
  return agentSessions.get(sessionId)!;
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

    const agent = getOrCreateAgent(sessionId);

    switch (action) {
      case 'initialize':
        console.log('Initializing agent with extracted data:', extractedData);
        if (extractedData) {
          agent.setExtractedData(extractedData as ExtractedData);
        }
        
        // If there's existing data, inform the agent
        if (existingData) {
          console.log('Adding existing data to agent:', existingData);
          agent.addUserMessage(`I have existing data for ${existingData.year}: Income: €${existingData.gross_income}, Tax Paid: €${existingData.income_tax_paid}, Employer: ${existingData.employer}`);
        }
        
        // If there are suggested deductions, inform the agent
        if (suggestedDeductions && suggestedDeductions.length > 0) {
          console.log('Adding suggested deductions to agent:', suggestedDeductions);
          const deductionSuggestions = suggestedDeductions.map((d: any) => `${d.category}: €${d.amount}`).join(', ');
          agent.addUserMessage(`Based on previous years, you commonly claimed: ${deductionSuggestions}`);
        }
        
        console.log('Getting initial agent message');
        let initialMessage = '';
        
        try {
          // Use the agent for intelligent response
          initialMessage = await agent.runAgent('Initialize tax filing process with extracted data');
        } catch (agentError) {
          console.error('Agent error, falling back to direct response:', agentError);
          // Fallback to direct response if agent fails
          if (extractedData) {
            const { full_name, employer, gross_income, income_tax_paid, solidaritaetszuschlag, year } = extractedData;
            initialMessage = `Here's what I found from your documents:

👤 **Name:** ${full_name || "N/A"}
🏢 **Employer:** ${employer || "N/A"}
💶 **Gross Income:** €${Number(gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
💰 **Lohnsteuer Paid:** €${Number(income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
${solidaritaetszuschlag ? `💸 **Solidarity Tax:** €${Number(solidaritaetszuschlag).toLocaleString('de-DE', { minimumFractionDigits: 2 })}\n` : ''}📅 **Detected Tax Year:** ${year || "Not specified"}

Can you please confirm that the tax year you want to file is ${year}? (yes/no)

If this is correct, I'll help you with your tax filing process. If not, please upload the correct PDF for the year you want to file.`;
          } else {
            initialMessage = "Welcome! I'm here to help you with your German tax filing. Please upload your tax documents to get started.";
          }
        }
        
        console.log('Initial message received:', initialMessage);
        
        return NextResponse.json({
          success: true,
          message: initialMessage,
          done: false,
          deduction_flow: null,
          current_question_index: 0
        });

      case 'respond':
        console.log('Processing user response:', message);
        console.log('Current agent state:', {
          messagesCount: agent.getConversationHistory().length,
          extractedData: agent.getUserData(),
          deductionAnswers: agent.getDeductionAnswers()
        });
        
        // If this is the first message and we have extracted data, initialize the conversation
        if (agent.getConversationHistory().length === 0 && agent.getUserData().year) {
          console.log('Re-initializing conversation for existing session');
          try {
            const initialMessage = await agent.runAgent('Initialize tax filing process');
            agent.addAgentMessage(initialMessage);
          } catch (error) {
            console.error('Failed to initialize agent:', error);
          }
        }
        
        if (message) {
          agent.addUserMessage(message);
        }

        console.log('Getting next agent message');
        let nextMessage = '';
        
        try {
          // Use the agent for intelligent response
          nextMessage = await agent.runAgent(message || 'Continue conversation');
        } catch (agentError) {
          console.error('Agent error, falling back to direct response:', agentError);
          // Fallback to direct response if agent fails
          const extractedData = agent.getUserData();
          const lastUserMessage = message?.toLowerCase() || '';
          
          if (lastUserMessage.includes('yes') || lastUserMessage.includes('correct')) {
            // User confirmed the year
            if (extractedData.year && extractedData.gross_income) {
              const threshold = getTaxFreeThreshold(extractedData.year);
              if (extractedData.gross_income < threshold) {
                // Below threshold - show early exit
                nextMessage = generateEarlyExitSummary(extractedData);
              } else {
                // Above threshold - ask for status
                nextMessage = getStatusSelectionMessage();
              }
            }
          } else if (lastUserMessage.includes('no') || lastUserMessage.includes('wrong')) {
            nextMessage = "Please upload the correct PDF for the year you want to file.";
          } else if (/^[1-4]$/.test(lastUserMessage) || ['bachelor', 'master', 'new_employee', 'full_time'].includes(lastUserMessage)) {
            // Status selected
            const status = /^[1-4]$/.test(lastUserMessage) ? 
              ['bachelor', 'master', 'new_employee', 'full_time'][parseInt(lastUserMessage) - 1] : 
              lastUserMessage;
            
            nextMessage = `Perfect! I've set your status as: **${status.toUpperCase()}**

Based on your extracted data, here's your tax summary:

**Tax Year:** ${extractedData.year}
**Gross Income:** €${Number(extractedData.gross_income || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
**Tax Paid:** €${Number(extractedData.income_tax_paid || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}

For a complete analysis with deductions and personalized questions, please use the full Pfleged AI agent.

Would you like to file a tax return for another year?`;
          } else if (lastUserMessage.includes('another year') || lastUserMessage.includes('yes')) {
            nextMessage = "Perfect! I've reset the system for a new year. Please upload the PDF for the new year you want to file, and I'll help you with that tax return.";
          } else if (lastUserMessage.includes('no') || lastUserMessage.includes('finish')) {
            nextMessage = "Thank you for using our tax advisor! Your filing is complete. You can always come back to file for another year later.";
          } else {
            nextMessage = "I'm here to help with your German tax filing. Please follow the conversation flow and let me know if you need any clarification.";
          }
        }
        
        console.log('Next message received:', nextMessage);
        
        // Check if conversation is done based on keywords and deduction flow completion
        const doneKeywords = [
          'all done', 'summary', 'refund', 'no further questions', 
          'eligible for a full refund', 'Thank you for using'
        ];
        
        // Check if conversation is done
        const isDone = doneKeywords.some(keyword => 
          nextMessage.toLowerCase().includes(keyword.toLowerCase())
        ) || agent.isComplete();
        
        // Get current state
        const state = agent.getState();
        
        return NextResponse.json({
          success: true,
          message: nextMessage,
          done: isDone,
          deduction_flow: state.deductionFlow,
          current_question_index: state.currentQuestionIndex,
          conversation_id: state.conversationId,
          step: state.step
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

// Helper functions for fallback responses
function getTaxFreeThreshold(year: number): number {
  const thresholds: Record<number, number> = {
    2021: 9744,
    2022: 10347,
    2023: 10908,
    2024: 10908,
    2025: 11280,
    2026: 11640
  };
  return thresholds[year] || 10908;
}

function generateEarlyExitSummary(extractedData: any): string {
  const { year, gross_income, income_tax_paid, full_name, employer } = extractedData;
  const threshold = getTaxFreeThreshold(year);
  
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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }
    
    // Remove the session from memory
    if (agentSessions.has(sessionId)) {
      agentSessions.delete(sessionId);
      console.log('Removed agent session:', sessionId);
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
