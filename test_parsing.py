#!/usr/bin/env python3

import re

def parse_german_tax_document(text: str) -> dict:
    """
    Parse German tax document text and extract relevant fields
    """
    result = {
        "bruttolohn": 0,
        "lohnsteuer": 0,
        "solidaritaetszuschlag": 0,
        "employer": "Unknown",
        "name": "User",
        "year": None,
        "steuerklasse": None,
        "beschaeftigungszeitraum": None
    }
    
    try:
        # Extract year from text
        year_match = re.search(r'Veranlagungszeitraum:\s*(\d{4})', text)
        if year_match:
            result["year"] = int(year_match.group(1))
        
        # Extract employer
        employer_match = re.search(r'Arbeitgeber\s+Name des Arbeitgebers\s+([^\n]+)', text)
        if employer_match:
            result["employer"] = employer_match.group(1).strip()
        
        # Extract name (Identifikationsnummer)
        name_match = re.search(r'Identifikationsnummer\s+(\d+\s+\d+\s+\d+)', text)
        if name_match:
            result["name"] = f"User {name_match.group(1)}"
        
        # Extract tax class
        steuerklasse_match = re.search(r'Steuerklasse\s+(\d+)', text)
        if steuerklasse_match:
            result["steuerklasse"] = int(steuerklasse_match.group(1))
        
        # Extract employment period
        beschaeftigungszeitraum_match = re.search(r'Beschäftigungsjahr\s+\d{4}\s+vom\s+(\d{2}\.\d{2})\s+bis\s+(\d{2}\.\d{2})', text)
        if beschaeftigungszeitraum_match:
            result["beschaeftigungszeitraum"] = f"{beschaeftigungszeitraum_match.group(1)} - {beschaeftigungszeitraum_match.group(2)}"
        
        # Extract Bruttoarbeitslohn (gross income)
        bruttolohn_match = re.search(r'Bruttoarbeitslohn\s+([\d\.,]+)', text)
        if bruttolohn_match:
            bruttolohn_str = bruttolohn_match.group(1).replace('.', '').replace(',', '.')
            try:
                result["bruttolohn"] = float(bruttolohn_str)
            except ValueError:
                pass
        
        # Extract einbehaltene Lohnsteuer (income tax paid)
        lohnsteuer_match = re.search(r'einbehaltene Lohnsteuer\s+([\d\.,]+)', text)
        if lohnsteuer_match:
            lohnsteuer_str = lohnsteuer_match.group(1).replace('.', '').replace(',', '.')
            try:
                result["lohnsteuer"] = float(lohnsteuer_str)
            except ValueError:
                pass
        
        # Extract einbehaltener Solidaritätszuschlag
        solidaritaetszuschlag_match = re.search(r'einbehaltener Solidaritätszuschlag\s+([\d\.,]+)', text)
        if solidaritaetszuschlag_match:
            solidaritaetszuschlag_str = solidaritaetszuschlag_match.group(1).replace('.', '').replace(',', '.')
            try:
                result["solidaritaetszuschlag"] = float(solidaritaetszuschlag_str)
            except ValueError:
                pass
        
        # If no year found, try to extract from filename or text
        if not result["year"]:
            year_from_text = re.search(r'(\d{4})', text)
            if year_from_text:
                result["year"] = int(year_from_text.group(1))
        
        print(f"Parsed tax document: {result}")
        return result
        
    except Exception as e:
        print(f"Error parsing German tax document: {e}")
        return result

# Test with the sample text
test_text = """Transferticket: Seite 1 von 1 Abfragedatum: 30.07.20.25 Veranlagungszeitraum: 20.21 Identifikationsnummer: 62 010 574 032 Lohnsteuerbescheinigung Arbeitnehmer Identifikationsnummer 62 010 574 032 eTIN KTNBKVNK98D30F Arbeitgeber Name des Arbeitgebers InStaff  Jobs GmbH Betroffenes Jahr Beschäftigungsjahr 20.21 vom 01.03 bis 30.04 Besteuerungsmerkmale Besteuerungsmerkmale gültig ab 01.03 Steuerklasse 1 Besteuerungsgrundlagen Arbeitslohn Bruttoarbeitslohn 2.033,00 einbehaltene Lohnsteuer 16,75 einbehaltener Solidaritätszuschlag 0,00 Sozialversicherung nachgewiesene Beiträge zur privaten Krankenversicherung und Pflege-Pflichtversicherung 243,96 Sonstige Informationen Übermittlungszeitpunkt der Bescheinigung an die Finanzverwaltung 14.05.20.21 08:59:40"""

result = parse_german_tax_document(test_text)
print("Final result:", result) 