import fs from 'node:fs/promises';
import path from 'node:path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';

export interface ParseResult {
  text: string;
  charCount: number;
  estimatedTokens: number;
  truncated: boolean;
}

const MAX_PARSED_CHARS = 50000;

export async function parseFileContent(filePath: string, mimeType: string): Promise<ParseResult> {
  const ext = path.extname(filePath).toLowerCase();
  let rawText = '';

  try {
    if (ext === '.pdf' || mimeType === 'application/pdf') {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      rawText = data.text || '';
    } else if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value || '';
    } else if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      const buffer = await fs.readFile(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      const sheetsText: string[] = [];

      for (const sheetName of sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        sheetsText.push(`--- Planilha: ${sheetName} ---\n${csv}`);
      }
      rawText = sheetsText.join('\n\n');
    } else if (ext === '.csv' || mimeType === 'text/csv') {
      const content = await fs.readFile(filePath, 'utf-8');
      const records = parseCsv(content, { skip_empty_lines: true });
      rawText = records.map((r: any) => (Array.isArray(r) ? r.join(', ') : JSON.stringify(r))).join('\n');
    } else {
      rawText = await fs.readFile(filePath, 'utf-8');
    }

    let truncated = false;
    if (rawText.length > MAX_PARSED_CHARS) {
      rawText = rawText.slice(0, MAX_PARSED_CHARS) + '\n\n[... Conteúdo truncado para otimização de contexto ...]';
      truncated = true;
    }

    const charCount = rawText.length;
    const estimatedTokens = Math.ceil(charCount / 4);

    return {
      text: rawText,
      charCount,
      estimatedTokens,
      truncated,
    };
  } catch (error: any) {
    console.error(`Error parsing file ${filePath}:`, error.message);
    return {
      text: `[Erro ao extrair conteúdo do arquivo: ${error.message}]`,
      charCount: 0,
      estimatedTokens: 0,
      truncated: false,
    };
  }
}
