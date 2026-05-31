import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ExtractionResult {
  rawText: string;
  structuredText: string;
  metadata: {
    fileName: string;
    fileType: string;
    fileSize: number;
    pageCount?: number;
    wordCount: number;
    extractedAt: string;
  };
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File "${file.name}" exceeds the 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`;
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['docx', 'pdf', 'txt'].includes(ext)) {
    return `Unsupported file type: .${ext}`;
  }
  return null;
}

export async function extractText(file: File): Promise<ExtractionResult> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const ext = file.name.split('.').pop()?.toLowerCase();

  let rawText = '';
  let structuredText = '';
  let pageCount: number | undefined;

  switch (ext) {
    case 'txt':
      rawText = await file.text();
      structuredText = rawText;
      break;

    case 'docx': {
      const result = await extractDocx(file);
      rawText = result.rawText;
      structuredText = result.structuredText;
      break;
    }

    case 'pdf': {
      const result = await extractPdf(file);
      rawText = result.rawText;
      structuredText = result.structuredText;
      pageCount = result.pageCount;
      break;
    }

    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }

  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  return {
    rawText,
    structuredText,
    metadata: {
      fileName: file.name,
      fileType: `.${ext}`,
      fileSize: file.size,
      pageCount,
      wordCount,
      extractedAt: new Date().toISOString(),
    },
  };
}

async function extractDocx(file: File): Promise<{ rawText: string; structuredText: string }> {
  const arrayBuffer = await file.arrayBuffer();

  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
  const html = htmlResult.value;

  const rawResult = await mammoth.extractRawText({ arrayBuffer });
  const rawText = rawResult.value;

  const structuredText = parseHtmlToStructured(html);

  return { rawText, structuredText };
}

function parseHtmlToStructured(html: string): string {
  const lines: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function processNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || '';

    if (!text) return;

    switch (tag) {
      case 'h1':
        lines.push(`# ${text}`);
        lines.push('');
        return;
      case 'h2':
        lines.push(`## ${text}`);
        lines.push('');
        return;
      case 'h3':
        lines.push(`### ${text}`);
        lines.push('');
        return;
      case 'h4':
        lines.push(`#### ${text}`);
        lines.push('');
        return;
      case 'h5':
      case 'h6':
        lines.push(`##### ${text}`);
        lines.push('');
        return;
      case 'p':
        lines.push(text);
        lines.push('');
        return;
      case 'ul':
        processListItems(el, 'ul', 0);
        lines.push('');
        return;
      case 'ol':
        processListItems(el, 'ol', 0);
        lines.push('');
        return;
      case 'table':
        processTable(el);
        lines.push('');
        return;
      case 'blockquote':
        lines.push(`> ${text}`);
        lines.push('');
        return;
      default:
        for (const child of Array.from(el.children)) {
          processNode(child);
        }
    }
  }

  function processListItems(listEl: HTMLElement, listType: string, depth: number) {
    const items = Array.from(listEl.children).filter(
      (child) => child.tagName.toLowerCase() === 'li'
    );
    items.forEach((item, index) => {
      const indent = '  '.repeat(depth);
      const directText = Array.from(item.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .filter(Boolean)
        .join(' ');

      const marker = listType === 'ol' ? `${index + 1}.` : '-';

      if (directText) {
        lines.push(`${indent}${marker} ${directText}`);
      }

      const nestedLists = Array.from(item.children).filter((child) => {
        const t = child.tagName.toLowerCase();
        return t === 'ul' || t === 'ol';
      });
      for (const nested of nestedLists) {
        processListItems(nested as HTMLElement, nested.tagName.toLowerCase(), depth + 1);
      }

      if (!directText && nestedLists.length === 0) {
        const fallback = item.textContent?.trim() || '';
        if (fallback) {
          lines.push(`${indent}${marker} ${fallback}`);
        }
      }
    });
  }

  function processTable(tableEl: HTMLElement) {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const cellTexts = cells.map((c) => c.textContent?.trim() || '');
      lines.push(`| ${cellTexts.join(' | ')} |`);
    }
  }

  const body = doc.body;
  for (const child of Array.from(body.children)) {
    processNode(child);
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface TextItem {
  str: string;
  transform: number[];
  height: number;
  width: number;
  dir: string;
}

async function extractPdf(
  file: File
): Promise<{ rawText: string; structuredText: string; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;

  const rawLines: string[] = [];
  const structuredLines: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items as TextItem[];

    if (items.length === 0) continue;

    const fontSizes = items.filter((i) => i.str.trim()).map((i) => i.height);
    const medianFontSize = getMedian(fontSizes);

    let currentLine = '';
    let lastY: number | null = null;
    let lastFontSize = 0;

    for (const item of items) {
      const text = item.str;
      const y = item.transform[5];
      const fontSize = item.height;

      if (lastY !== null && Math.abs(y - lastY) > fontSize * 0.5) {
        if (currentLine.trim()) {
          const classified = classifyLine(currentLine.trim(), lastFontSize, medianFontSize);
          structuredLines.push(classified);
          rawLines.push(currentLine.trim());
        }
        currentLine = '';
      }

      currentLine += text;
      lastY = y;
      lastFontSize = fontSize;
    }

    if (currentLine.trim()) {
      const classified = classifyLine(currentLine.trim(), lastFontSize, medianFontSize);
      structuredLines.push(classified);
      rawLines.push(currentLine.trim());
    }

    if (pageNum < pageCount) {
      structuredLines.push('');
      rawLines.push('');
    }
  }

  return {
    rawText: rawLines.join('\n').trim(),
    structuredText: structuredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    pageCount,
  };
}

function classifyLine(text: string, fontSize: number, medianFontSize: number): string {
  const ratio = fontSize / medianFontSize;

  const bulletPattern = /^[\u2022\u2023\u25E6\u2043\u2219\-\*]\s+/;
  const numberedPattern = /^\d+[\.\)]\s+/;
  const letterPattern = /^[a-z][\.\)]\s+/i;

  if (bulletPattern.test(text)) return `- ${text.replace(bulletPattern, '')}`;
  if (numberedPattern.test(text)) return text;
  if (letterPattern.test(text)) return `- ${text}`;

  if (ratio > 1.6) return `# ${text}`;
  if (ratio > 1.3) return `## ${text}`;
  if (ratio > 1.1) return `### ${text}`;

  return text;
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
