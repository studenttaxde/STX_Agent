import pdf from 'pdf-parse';

export interface ExtractedFields {
  totalIncome: number;
  werbungskosten: number;
  sozialversicherung: number;
  sonderausgaben: number;
}

export async function parseLohnsteuerbescheinigung(
  buffer: ArrayBuffer
): Promise<ExtractedFields> {
  try {
    // Convert ArrayBuffer to Buffer for pdf-parse
    const bufferNode = Buffer.from(buffer);
    
    // Extract text from PDF
    const data = await pdf(bufferNode);
    const text = data.text;
    
    console.log('Extracted PDF text:', text.substring(0, 500) + '...');
    
    // Helper function to extract numbers from text using regex
    const extractNumber = (pattern: RegExp): number => {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Remove thousands separators and convert to number
        const cleanNumber = match[1].replace(/\./g, '').replace(/,/g, '.');
        const parsed = parseFloat(cleanNumber);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    };
    
    // Extract fields using regex patterns for German tax documents
    const totalIncome = extractNumber(/Steuerpflichtiges Einkommen[:\s]*([\d.,]+)/i) ||
                       extractNumber(/Bruttoarbeitslohn[:\s]*([\d.,]+)/i) ||
                       extractNumber(/Gesamtbetrag[:\s]*([\d.,]+)/i);
    
    const werbungskosten = extractNumber(/Werbungskosten[:\s]*([\d.,]+)/i) ||
                          extractNumber(/Arbeitsmittel[:\s]*([\d.,]+)/i) ||
                          extractNumber(/Fahrtkosten[:\s]*([\d.,]+)/i);
    
    const sozialversicherung = extractNumber(/Sozialversicherungsbeiträge[:\s]*([\d.,]+)/i) ||
                              extractNumber(/Krankenversicherung[:\s]*([\d.,]+)/i) ||
                              extractNumber(/Rentenversicherung[:\s]*([\d.,]+)/i) ||
                              extractNumber(/Arbeitslosenversicherung[:\s]*([\d.,]+)/i) ||
                              extractNumber(/Pflegeversicherung[:\s]*([\d.,]+)/i);
    
    const sonderausgaben = extractNumber(/Sonderausgaben[:\s]*([\d.,]+)/i) ||
                          extractNumber(/Lohnsteuer[:\s]*([\d.,]+)/i) ||
                          extractNumber(/Solidaritätszuschlag[:\s]*([\d.,]+)/i);
    
    // Additional patterns for common German tax document formats
    const additionalPatterns = {
      totalIncome: [
        /Einkünfte[:\s]*([\d.,]+)/i,
        /Einkommen[:\s]*([\d.,]+)/i,
        /Bezüge[:\s]*([\d.,]+)/i
      ],
      werbungskosten: [
        /Arbeitszimmer[:\s]*([\d.,]+)/i,
        /Fortbildungskosten[:\s]*([\d.,]+)/i,
        /Berufsbekleidung[:\s]*([\d.,]+)/i
      ],
      sozialversicherung: [
        /Versicherungsbeiträge[:\s]*([\d.,]+)/i,
        /Sozialabgaben[:\s]*([\d.,]+)/i
      ],
      sonderausgaben: [
        /Steuern[:\s]*([\d.,]+)/i,
        /Abgaben[:\s]*([\d.,]+)/i
      ]
    };
    
    // Try additional patterns if primary patterns didn't find values
    const finalTotalIncome = totalIncome || extractNumber(additionalPatterns.totalIncome[0]);
    const finalWerbungskosten = werbungskosten || extractNumber(additionalPatterns.werbungskosten[0]);
    const finalSozialversicherung = sozialversicherung || extractNumber(additionalPatterns.sozialversicherung[0]);
    const finalSonderausgaben = sonderausgaben || extractNumber(additionalPatterns.sonderausgaben[0]);
    
    const result: ExtractedFields = {
      totalIncome: finalTotalIncome,
      werbungskosten: finalWerbungskosten,
      sozialversicherung: finalSozialversicherung,
      sonderausgaben: finalSonderausgaben
    };
    
    console.log('Extracted fields:', result);
    
    return result;
    
  } catch (error) {
    console.error('Error parsing PDF:', error);
    
    // Return default values if parsing fails
    return {
      totalIncome: 0,
      werbungskosten: 0,
      sozialversicherung: 0,
      sonderausgaben: 0
    };
  }
} 