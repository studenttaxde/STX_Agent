import openai
import os
import json

class TaxAdvisor:
    TAX_FREE_THRESHOLDS = {
        2017: 8820,
        2018: 9000,
        2019: 9168,
        2020: 9408,
        2021: 9744,
        2022: 10347,
        2023: 10908,
        2024: 11604,
        2025: 12300
    }

    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        openai.api_key = self.api_key
        self.conversation_history = []
        self.extracted_data = {}
        self.user_data = {}  # tracks user answers
        self.asked_questions = set()
        self.filed_years = set()  # Track filed years

    def _build_initial_summary(self):
        """Create a clean, human-readable summary of extracted tax data."""
        # Fallback: if 'fallback' key is present, show that instead
        if isinstance(self.extracted_data, dict) and "fallback" in self.extracted_data:
            return f"Could not parse structured data. Here is the extracted info:\n\n{self.extracted_data['fallback']}"
        name = self.extracted_data.get("full_name", "N/A")
        address = self.extracted_data.get("address", "N/A")
        employer = self.extracted_data.get("employer", "N/A")
        hours = self.extracted_data.get("total_hours", "not specified")
        income = self.extracted_data.get("gross_income", 0)
        tax = self.extracted_data.get("income_tax_paid", 0)
        year = self.extracted_data.get("year", "unknown")

        return (
        f"Here’s a quick summary of your  {year} tax data:\n\n"
        f"👤 **Name:** {name}\n"
        f"🏠 **Address:** {address}\n"
        f"🏢 **Employer:** {employer}\n"
        f"⏱️ **Hours Worked:** {hours}\n"
        f"💶 **Gross Income:** €{income:,.2f}\n"
        f"💰 **Income Tax Paid:** €{tax:,.2f}\n\n"
        f"Let’s begin with a few quick questions to see what deductions you might qualify for. 😊"
        )


    def set_extracted_data(self, data: dict):
        self.extracted_data = data
        year = data.get("year")
        if year:
            self.user_data['year'] = year
            self.filed_years.add(year)
        self.user_data['gross_income'] = data.get("gross_income")
        self.user_data['income_tax_paid'] = data.get("income_tax_paid")

    def add_user_message(self, message: str):
        self.conversation_history.append({"role": "user", "content": message})

    def add_agent_message(self, message: str):
        self.conversation_history.append({"role": "assistant", "content": message})

    def _is_below_threshold(self):
        year = self.user_data.get("year")
        gross_income = self.user_data.get("gross_income", 0)
        try:
            year_int = int(year)
        except (TypeError, ValueError):
            return False
        threshold = self.TAX_FREE_THRESHOLDS.get(year_int)
        if threshold is not None and gross_income is not None:
            return gross_income < threshold
        return False

    def _early_exit_summary(self):
        year = self.user_data.get("year")
        refund = self.user_data.get("income_tax_paid", 0)
        return (
            f"Your gross income in {year} is below the tax-free threshold of €{self.TAX_FREE_THRESHOLDS[year]:,.0f}.\n"
            f"You are likely eligible for a full refund of your paid income tax: **€{refund:.2f}**.\n"
            "We don’t need further details. ✅\n\n"
            "Would you like to file a tax return for another year?"
        )

    def next_advisor_message(self):
        # Step 1: Early exit if tax-free threshold met
        if self._is_below_threshold():
            return self._early_exit_summary()

        # Step 2: Add readable extracted summary if not already present
        if not any("Here’s a quick summary" in msg['content'] for msg in self.conversation_history if msg["role"] == "assistant"):
            summary = self._build_initial_summary()
            self.conversation_history.insert(0, {
               "role": "assistant",
               "content": summary
            })
            return summary  # <-- Return the summary directly!

        # Step 3: System role defining the assistant behavior
        filed_years = sorted(list(self.filed_years))
        filed_years_str = ", ".join(str(y) for y in filed_years) if filed_years else "none"
        system_message = {
            "role": "system",
            "content": (
                "You are a professional German tax return advisor helping a user file their tax return.\n"
                "Ask only ONE question at a time. Be short and professional.\n"
                "Ask follow-up questions based only on what has already been answered.\n"
                "Your goal is to:\n"
                "- Confirm the filing year\n"
                "- Confirm professional status (student, graduate, employee)\n"
                "- Ask relevant questions to find possible deductions (university fees, insurance, relocation, etc.)\n"
                "- Stop asking questions and generate summary if income is below threshold.\n"
                "- After filing is done, ask if the user wants to file for another year.\n"
                f"- The user has already filed for these years: {filed_years_str}.\n"
                "If the user has not filed for the previous year or next year, suggest filing for those years as well.\n"
            )
        }

        # Step 4: Compose final message history
        messages = [system_message] + self.conversation_history

        # Step 5: Call OpenAI with the full conversation
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.3
        )

        advisor_reply = response.choices[0].message.content

        if advisor_reply:
            self.add_agent_message(advisor_reply)
            return advisor_reply
        else:
            return "[No response from advisor]"
