# questioner.py
"""
Handles dynamic questioning based on extracted data and user interaction.
"""

class Questioner:
    def __init__(self):
        pass

    def generate_questions(self, extracted_data: dict) -> list:
        """
        Generates follow-up questions based on extracted data.
        Args:
            extracted_data (dict): Data extracted from documents.
        Returns:
            list: List of questions to ask the user.
        """
        try:
            if not extracted_data or 'error' in extracted_data:
                return ["Could not extract data from your document. Please check the file."]
            questions = []
            # Example: Check for common tax fields
            required_fields = [
                ("Tax Paid", "How much tax did you pay this year?"),
                ("Gross Income", "What was your total gross income?"),
                ("Employer Name", "Who is your employer?"),
                ("Tax Class", "What is your tax class?"),
                ("Steuer-ID", "What is your Steuer-ID?"),
                ("Health Insurance", "What is your health insurance provider?")
            ]
            for field, question in required_fields:
                if field not in extracted_data or not extracted_data[field]:
                    questions.append(question)
            # If all required fields are present, ask for confirmation
            if not questions:
                questions.append("Is all the extracted information correct?")
            return questions
        except Exception as e:
            return [f"Question generation failed: {str(e)}"] 