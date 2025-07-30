# 🇩🇪 German Tax Agent Flow Documentation

## Overview

The STX Advisor implements a comprehensive German tax advisor with step-by-step deduction flow logic. The system handles four user types and guides them through relevant tax deductions based on their status.

## User Status Types

### 1. **Bachelor Student** (`bachelor`)
- **Target:** Undergraduate students
- **Deductions:** Education-focused expenses
- **Questions:** 5 total

### 2. **Master Student** (`master`)
- **Target:** Graduate students
- **Deductions:** Advanced education and research expenses
- **Questions:** 6 total

### 3. **New Employee** (`new_employee`)
- **Target:** First-time employees
- **Deductions:** Job-related startup expenses
- **Questions:** 6 total

### 4. **Full-time Employee** (`full_time`)
- **Target:** Established employees
- **Deductions:** Ongoing work-related expenses
- **Questions:** 6 total

## Deduction Flow Implementation

### Flow Structure

```typescript
interface DeductionFlow {
  status: UserStatus;
  questions: DeductionQuestion[];
  order: string[]; // Question IDs in order
}

interface DeductionQuestion {
  id: string;
  question: string;
  category: string;
  maxAmount?: number;
  required?: boolean;
  dependsOn?: string;
}
```

### Bachelor Student Flow

1. **University Fees** (€6,000 max)
   - Question: "Did you pay university fees or semester fees?"
   - Category: Education

2. **Books & Materials** (€1,000 max)
   - Question: "Did you purchase books, study materials, or equipment for your studies?"
   - Category: Education

3. **Travel to University** (€4,500 max)
   - Question: "Did you have travel expenses to and from university?"
   - Category: Travel

4. **Home Office** (€1,250 max)
   - Question: "Did you work from home during your studies?"
   - Category: Home Office

5. **Internships** (€1,000 max)
   - Question: "Did you complete any internships or practical training?"
   - Category: Professional Development

### Master Student Flow

1. **University Fees** (€6,000 max)
2. **Books & Materials** (€1,000 max)
3. **Travel to University** (€4,500 max)
4. **Home Office** (€1,250 max)
5. **Research Expenses** (€2,000 max)
   - Question: "Did you have research-related expenses or conference attendance?"
   - Category: Professional Development
6. **Relocation** (€1,000 max)
   - Question: "Did you relocate for your master's program?"
   - Category: Relocation

### New Employee Flow

1. **Relocation** (€1,000 max)
   - Question: "Did you relocate for this job?"
   - Category: Relocation

2. **Work Clothes** (€500 max)
   - Question: "Did you purchase work-specific clothing or uniforms?"
   - Category: Work Expenses

3. **Travel to Work** (€4,500 max)
   - Question: "Do you have travel expenses to and from work?"
   - Category: Travel

4. **Home Office** (€1,250 max)
   - Question: "Do you work from home?"
   - Category: Home Office

5. **Professional Development** (€1,000 max)
   - Question: "Did you attend any professional development courses or training?"
   - Category: Professional Development

6. **Tools & Equipment** (€800 max)
   - Question: "Did you purchase any work-related tools or equipment?"
   - Category: Work Expenses

### Full-time Employee Flow

1. **Travel to Work** (€4,500 max)
2. **Home Office** (€1,250 max)
3. **Professional Development** (€1,000 max)
4. **Work Clothes** (€500 max)
5. **Tools & Equipment** (€800 max)
6. **Insurance** (€1,000 max)
   - Question: "Do you have professional liability insurance or other work-related insurance?"
   - Category: Insurance

## Tax Calculation Logic

### Threshold Check
- **Early Exit:** If income < tax-free threshold for the year
- **Full Refund:** Tax paid amount
- **No Further Questions:** Skip deduction flow

### Tax Calculation Formula
```typescript
const taxableIncome = Math.max(0, grossIncome - totalDeductions);
const estimatedTax = taxableIncome * 0.15; // 15% estimate
const refund = Math.max(0, taxPaid - estimatedTax);
```

### Tax-Free Thresholds by Year
- 2017: €8,820
- 2018: €9,000
- 2019: €9,168
- 2020: €9,408
- 2021: €9,744
- 2022: €10,347
- 2023: €10,908
- 2024: €11,604
- 2025: €12,300

## Conversation Flow

### 1. Initial Data Extraction
- Extract PDF data (name, income, tax paid, year)
- Display summary to user
- Confirm tax year

### 2. Threshold Check
- If income < threshold → Early exit with full refund
- If income ≥ threshold → Continue to status selection

### 3. Status Selection
- Present 4 status options
- Validate user selection
- Load appropriate deduction flow

### 4. Deduction Questions
- Ask one question at a time
- Accept "yes"/"no" answers
- Track answers and amounts
- Calculate running totals

### 5. Final Summary
- Display comprehensive tax summary
- Show all deductions applied
- Calculate final refund amount
- Provide JSON summary

## LangSmith Tracing

### Traced Operations
1. **Data Extraction** (`setExtractedData`)
2. **Tax Calculations** (`calculate_tax_refund`)
3. **Deduction Checks** (`check_tax_deductions`)
4. **Agent Initialization** (`initialize_agent`)
5. **Conversation Turns** (`advisor_message`)

### Trace Data
- User inputs and responses
- Deduction answers and amounts
- Tax calculations and thresholds
- Conversation flow progression
- Error handling and fallbacks

## API Endpoints

### `/api/advisor`
- **POST:** Handle conversation flow
- **Actions:** `initialize`, `respond`, `reset`, `get_state`
- **Response:** Includes deduction flow state and tax calculations

### Response Structure
```json
{
  "success": true,
  "advisor_message": "string",
  "done": false,
  "deduction_answers": [...],
  "tax_calculation": {...},
  "deduction_flow": {
    "status": "bachelor",
    "current_question_index": 2,
    "total_questions": 5
  }
}
```

## Error Handling

### Common Scenarios
1. **Invalid Status:** Prompt for valid selection
2. **Invalid Answers:** Request yes/no response
3. **Missing Data:** Fallback to OpenAI
4. **LangSmith Errors:** Continue without tracing
5. **API Failures:** Graceful degradation

### Fallback Mechanisms
- LangChain agent → OpenAI direct
- Custom tracing → Console logging
- Structured flow → Free-form conversation

## Testing Scenarios

### Test Cases
1. **Below Threshold:** Early exit with full refund
2. **Bachelor Student:** Complete 5-question flow
3. **Master Student:** Complete 6-question flow
4. **New Employee:** Complete 6-question flow
5. **Full-time Employee:** Complete 6-question flow
6. **Invalid Inputs:** Error handling and recovery
7. **Multiple Years:** Session management

### Expected Outcomes
- Correct deduction calculations
- Proper tax refund estimates
- Complete conversation flow
- LangSmith trace visibility
- JSON summary generation

## Deployment Considerations

### Environment Variables
- `OPENAI_API_KEY`: Required for AI responses
- `LANGCHAIN_API_KEY`: Required for tracing
- `LANGCHAIN_PROJECT`: Project name for traces
- `LANGCHAIN_ENDPOINT`: LangSmith endpoint

### Performance
- Session-based state management
- Async LangSmith operations
- Memory-efficient conversation history
- Graceful error handling

## Future Enhancements

### Planned Features
1. **More Deduction Categories:** Health, charity, etc.
2. **Dynamic Thresholds:** Real-time tax law updates
3. **Document Upload:** Receipt processing
4. **Multi-language Support:** German interface
5. **Advanced Calculations:** Progressive tax rates
6. **Export Options:** PDF reports, tax forms

### Integration Opportunities
1. **Tax Software APIs:** Direct form submission
2. **Banking APIs:** Automatic expense detection
3. **Government APIs:** Real-time tax law updates
4. **Accounting Software:** QuickBooks, Xero integration

---

*This documentation covers the complete German Tax Agent Flow implementation in the STX Advisor system.* 