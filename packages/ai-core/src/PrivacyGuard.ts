export interface SanitizationResult {
  cleanText: string;
  maskedItemsCount: number;
  detectedTypes: string[];
}

export class PrivacyGuard {
  static sanitizePrompt(input: string): SanitizationResult {
    if (!input) {
      return { cleanText: '', maskedItemsCount: 0, detectedTypes: [] };
    }

    let text = input;
    let count = 0;
    const typesSet = new Set<string>();

    // 1. CPF (format XXX.XXX.XXX-XX or 11 digits)
    const cpfRegex = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g;
    text = text.replace(cpfRegex, (match) => {
      // Ignore if it's clearly a timestamp or number range
      if (match.length === 11 && (match.startsWith('17') || match.startsWith('18') || match.startsWith('20'))) {
        return match;
      }
      count++;
      typesSet.add('CPF');
      return '[CPF MASCARADO]';
    });

    // 2. Email Address
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    text = text.replace(emailRegex, () => {
      count++;
      typesSet.add('EMAIL');
      return '[EMAIL MASCARADO]';
    });

    // 3. Credit Card Numbers (13-19 digits with space or hyphen)
    const creditCardRegex = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;
    text = text.replace(creditCardRegex, () => {
      count++;
      typesSet.add('CARTAO_CREDITO');
      return '[CARTÃO DE CRÉDITO MASCARADO]';
    });

    return {
      cleanText: text,
      maskedItemsCount: count,
      detectedTypes: Array.from(typesSet),
    };
  }
}
