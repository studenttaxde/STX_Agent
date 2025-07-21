# memory.py
"""
Stores conversation history and extracted data for context and continuity.
"""

class Memory:
    def __init__(self):
        self.conversation = []
        self.extracted_data = {}

    def add_message(self, message: str):
        self.conversation.append(message)

    def get_conversation(self) -> list:
        return self.conversation

    def store_data(self, data: dict):
        self.extracted_data.update(data)

    def get_data(self) -> dict:
        return self.extracted_data 