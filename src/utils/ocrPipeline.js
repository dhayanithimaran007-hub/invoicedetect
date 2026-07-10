import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
} catch (e) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function normalizeLineBreaks(text = "") {
  return text.replace(/\r\n?/g, "\n");
}

function normalizeOcrText(text = "") {
  let normalized = normalizeLineBreaks(text);
  normalized = normalized.replace(/\u00a0/g, " ");
  normalized = normalized.replace(/[ \t]+/g, " ");
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  normalized = normalized.replace(/([A-Za-z])\n(?=[a-z])/g, "$1 ");
  normalized = normalized.replace(/([A-Za-z])\n(?=[A-Z])/g, "$1 ");
  normalized = normalized.replace(/\b([A-Za-z])\b/g, (match) => {
    if (match === 'l') return '1';
    if (match === 'O' || match === 'o') return '0';
    return match;
  });
  normalized = normalized.replace(/\bRs\.?\b/gi, '₹');
  normalized = normalized.replace(/\bRupees\b/gi, '₹');
  normalized = normalized.replace(/\bINR\b/gi, '₹');
  return normalized.trim();
}

function cleanAmountValue(raw) {
  const cleaned = String(raw || "")
    .replace(/[₹$€]/g, "")
    .replace(/,/g, "")
    .replace(/[^0-9.\-]/g, "")
    .trim();
  return cleaned;
}

function parseAmountValue(raw) {
  const cleaned = cleanAmountValue(raw);
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDateCandidate(raw) {
  const cleaned = String(raw || "")
    .replace(/[^0-9A-Za-z\-/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Not Detected";

  const isoMatch = cleaned.match(/(\d{4})[\-/](\d{1,2})[\-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const slashMatch = cleaned.match(/(\d{1,2})[\-/](\d{1,2})[\-/](\d{2,4})/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const monthMatch = cleaned.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/i);
  if (monthMatch) {
    const [, day, month, year] = monthMatch;
    return `${year}-${String(MONTHS.indexOf(month.toLowerCase()) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const monthDashMatch = cleaned.match(/(\d{1,2})[-/](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-/](\d{4})/i);
  if (monthDashMatch) {
    const [, day, month, year] = monthDashMatch;
    return `${year}-${String(MONTHS.indexOf(month.toLowerCase()) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const simpleMatch = cleaned.match(/(\d{1,2})[\s-](\d{1,2})[\s-](\d{4})/);
  if (simpleMatch) {
    const [, day, month, year] = simpleMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return cleaned;
}

function stripLabel(raw, label) {
  return String(raw || "")
    .replace(new RegExp(label, 'gi'), "")
    .replace(/[:#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickFirstValue(text, patterns) {
  const lines = text.split("\n");
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1] ? match[1].trim() : match[0].trim();
      }
    }
  }
  return null;
}

function pickValues(text, patterns) {
  const values = [];
  const lines = text.split("\n");
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const value = match[1] ? match[1].trim() : match[0].trim();
        values.push(value);
      }
    }
  }
  return values;
}

function getLineCandidates(text) {
  return normalizeOcrText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikeCompanyName(value) {
  const prepared = value.toLowerCase();
  return prepared.length > 3 && prepared.length < 80 && !/(invoice|bill|date|number|gst|po|bank|amount|total|due|buyer|customer|ship|sold|address|phone|email|contact|state)/i.test(prepared);
}

function extractSupplierName(text) {
  const lines = getLineCandidates(text);

  for (const line of lines) {
    const labelMatch = line.match(/(?:supplier|vendor|seller|issued by|from)\s*[:#-]?\s*(.+)/i);
    if (labelMatch) {
      const value = labelMatch[1].replace(/[^A-Za-z0-9\s.,&()/-]/g, "").trim();
      if (value && value.length > 2) return value;
    }
  }

  const gstIndex = lines.findIndex((line) => /\bgstin\b|\bgst\b/i.test(line));
  if (gstIndex > 0) {
    const candidate = lines[gstIndex - 1].replace(/[^A-Za-z0-9\s.,&()/-]/g, "").trim();
    if (looksLikeCompanyName(candidate)) return candidate;
  }

  for (const line of lines) {
    const candidate = line.replace(/[^A-Za-z0-9\s.,&()/-]/g, "").trim();
    if (looksLikeCompanyName(candidate) && /(pvt|ltd|inc|corp|co\.|systems|solutions|enterprises|technologies|logistics|traders|global|consultancy|industries|services|group|private)/i.test(candidate)) {
      return candidate;
    }
  }

  return "Not Detected";
}

function extractBuyerName(text) {
  const lines = getLineCandidates(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/(bill\s*to|customer|sold\s*to|ship\s*to|buyer)/i.test(line)) {
      const remainder = line.split(/[:#-]/).slice(1).join(" ").trim();
      const nextLine = lines[index + 1] ? lines[index + 1].trim() : "";
      const candidate = (remainder || nextLine).replace(/[^A-Za-z0-9\s.,&()/-]/g, "").trim();
      if (candidate.length > 2) return candidate;
    }
  }

  return "Not Detected";
}

function extractInvoiceNumber(text) {
  const patterns = [
    /(?:invoice(?:\s*(?:no|number|nr|ref|#))?|inv(?:\s*(?:no|number|nr|ref|#))?|bill(?:\s*(?:no|number|nr|ref|#))?)\s*[:#-]?\s*([A-Z0-9/\-]{2,20})/i,
    /(?:invoice|inv|bill)\s*#\s*([A-Z0-9/\-]{2,20})/i,
    /\b(?:inv|invoice)[-\/ ]([A-Z0-9/\-]{2,20})\b/i,
    /\b(?:inv|invoice)[A-Z0-9/\-]{2,20}\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const candidate = match[1] ? match[1].toUpperCase() : match[0].toUpperCase();
      if (candidate && candidate !== 'NO' && candidate.length > 1) return candidate.replace(/[^A-Z0-9/\-]/g, "");
    }
  }

  const lineCandidate = pickFirstValue(text, [
    /(?:invoice|inv)\s*[:#-]?\s*([A-Z0-9/\-]{2,20})/i,
    /(?:invoice|inv)\s*(?:no|number|nr|ref)\s*[:#-]?\s*([A-Z0-9/\-]{2,20})/i
  ]);
  if (lineCandidate && lineCandidate !== 'NO') {
    return lineCandidate.toUpperCase();
  }

  return "Not Detected";
}

function extractDateValue(text, labels) {
  const lines = getLineCandidates(text);
  for (const line of lines) {
    const labelHit = labels.some((label) => label.test(line));
    if (!labelHit) continue;

    const dateMatch = line.match(/(\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}|\d{4}[\-/]\d{1,2}[\-/]\d{1,2}|\d{1,2}[-/]\w{3,9}[-/]\d{2,4})/i);
    if (dateMatch) {
      return normalizeDateCandidate(dateMatch[1]);
    }
  }

  const fallback = pickFirstValue(text, [
    /(?:invoice|date|due)\s*[:#-]?\s*([0-9A-Za-z/\-\s]{4,20})/i
  ]);
  if (fallback) {
    return normalizeDateCandidate(fallback);
  }

  return "Not Detected";
}

function extractAmountValue(text, labels) {
  const lines = getLineCandidates(text);
  for (const line of lines) {
    for (const label of labels) {
      if (!label.test(line)) continue;
      const amountMatch = line.match(/([0-9,]+(?:\.\d{1,2})?)/);
      if (amountMatch) {
        return parseAmountValue(amountMatch[1]);
      }
    }
  }
  return null;
}

function extractAmounts(text, labels) {
  const values = [];
  const lines = getLineCandidates(text);
  for (const line of lines) {
    for (const label of labels) {
      if (!label.test(line)) continue;
      const amountMatch = line.match(/([0-9,]+(?:\.\d{1,2})?)/);
      if (amountMatch) {
        values.push(parseAmountValue(amountMatch[1]));
      }
    }
  }
  return values;
}

function detectCurrency(text) {
  const normalized = text.toLowerCase();
  if (text.includes("$") || normalized.includes("usd") || normalized.includes("dollar")) return "USD";
  if (text.includes("€") || normalized.includes("eur") || normalized.includes("euro")) return "EUR";
  if (text.includes("₹") || normalized.includes("inr") || normalized.includes("rupee")) return "INR";
  return "INR";
}

function buildFieldConfidence(ocrConfidence, value) {
  if (!value || value === "Not Detected") {
    return Math.max(30, Math.round(ocrConfidence * 0.55));
  }
  return Math.min(100, Math.round(ocrConfidence * 0.9 + 6));
}

/**
 * Extracts text from selectable PDF using PDF.js.
 * Falls back to scanned page rendering if the PDF is image-like.
 */
export async function extractTextFromPDF(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

  if (onProgress) {
    loadingTask.onProgress = (progressData) => {
      if (progressData.total > 0) {
        const percent = Math.round((progressData.loaded / progressData.total) * 100);
        onProgress(`Loading PDF: ${percent}%`);
      }
    };
  }

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  let fullText = "";
  let totalMeaningfulChars = 0;

  if (onProgress) onProgress(`PDF loaded — ${numPages} page${numPages > 1 ? "s" : ""} detected. Extracting text...`);

  for (let i = 1; i <= numPages; i += 1) {
    if (onProgress) onProgress(`Extracting text layer from page ${i} of ${numPages}...`);
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).filter((s) => s.trim()).join(" ");
    totalMeaningfulChars += pageText.trim().replace(/\s/g, "").length;
    fullText += `--- Page ${i} ---\n` + pageText + "\n\n";
  }

  if (totalMeaningfulChars < 50) {
    if (onProgress) onProgress("No selectable text found. Switching to OCR engine for scanned document...");
    fullText = "";
    const worker = await createWorker('eng');

    for (let i = 1; i <= numPages; i += 1) {
      if (onProgress) onProgress(`OCR scanning page ${i} of ${numPages} at 2× resolution...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;
      const { data: { text } } = await worker.recognize(canvas);
      fullText += `--- Scanned Page ${i} ---\n` + text + "\n\n";
    }

    await worker.terminate();
    return {
      text: fullText.trim(),
      isScanned: true,
      ocrConfidence: 80,
      numPages
    };
  }

  return {
    text: fullText.trim(),
    isScanned: false,
    ocrConfidence: 99,
    numPages
  };
}

/**
 * Extracts text from standard image formats (PNG, JPG, JPEG) using Tesseract OCR.
 */
export async function extractTextFromImage(file, onProgress) {
  if (onProgress) onProgress("Initializing OCR engine for image...");
  const worker = await createWorker('eng');

  if (onProgress) onProgress("Running character recognition...");
  const { data: { text, confidence } } = await worker.recognize(file);
  await worker.terminate();

  return {
    text: text.trim(),
    isScanned: true,
    ocrConfidence: confidence,
    numPages: 1
  };
}

/**
 * Parses invoice text using multiple regexes and label-aware heuristics.
 */
export function parseInvoiceFields(text, ocrConfidence = 100) {
  const cleanedText = normalizeOcrText(text || "");

  if (ocrConfidence < 40) {
    return {
      vendorName: "Not Detected",
      buyerName: "Not Detected",
      invoiceNumber: "Not Detected",
      invoiceDate: "Not Detected",
      dueDate: "Not Detected",
      gstNumber: "Not Detected",
      poNumber: "Not Detected",
      subtotal: 0,
      gstAmount: 0,
      grandTotal: 0,
      amount: 0,
      currency: "INR",
      bankDetails: "Not Detected",
      bankAccount: "Not Detected",
      ifscCode: "Not Detected",
      email: "Not Detected",
      phoneNumber: "Not Detected",
      vendorAddress: "Not Detected",
      buyerAddress: "Not Detected",
      fieldConfidence: {},
      products: []
    };
  }

  const supplierName = extractSupplierName(cleanedText);
  const buyerName = extractBuyerName(cleanedText);
  const invoiceNumber = extractInvoiceNumber(cleanedText);
  const invoiceDate = extractDateValue(cleanedText, [/invoice\s*date/i, /date\s*of\s*issue/i, /issue\s*date/i, /dated/i]);
  const dueDate = extractDateValue(cleanedText, [/due\s*date/i, /payment\s*due/i, /due\s*on/i]);

  const gstMatch = cleanedText.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1})\b/i);
  const gstNumber = gstMatch ? gstMatch[0].toUpperCase() : "Not Detected";

  const poNumber = (() => {
    const poMatch = pickFirstValue(cleanedText, [
      /(?:po\s*num(?:ber)?|p\.o\.?\s*#?|purchase\s*order(?:\s*#)?)\s*[:#-]?\s*([A-Z0-9/\-]{2,20})/i,
      /\b(?:po|purchase\s*order)\s*[:#-]?\s*([A-Z0-9/\-]{2,20})/i
    ]);
    return poMatch ? poMatch.toUpperCase() : "Not Detected";
  })();

  const bankAccount = (() => {
    const accountMatch = pickFirstValue(cleanedText, [
      /(?:bank\s*a\/c|account\s*num(?:ber)?|a\/c\s*(?:no|number)|bank\s*account)\s*[:#-]?\s*([0-9]{5,20})/i,
      /(?:a\/c|account)\s*[:#-]?\s*([0-9]{5,20})/i
    ]);
    return accountMatch || "Not Detected";
  })();

  const ifscCode = (() => {
    const ifscMatch = cleanedText.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);
    return ifscMatch ? ifscMatch[0].toUpperCase() : "Not Detected";
  })();

  const currency = detectCurrency(cleanedText);

  const subtotal = extractAmountValue(cleanedText, [/(?:subtotal|sub\s*total|taxable\s*value|net\s*amount|amount\s*before\s*tax)/i]);
  const gstValues = extractAmounts(cleanedText, [/(?:cgst|sgst|igst|gst\s*amount|total\s*tax|tax\s*amount|vat)/i]);
  const gstAmount = gstValues.length > 0 ? gstValues.reduce((sum, value) => sum + value, 0) : 0;
  const grandTotalCandidate = extractAmountValue(cleanedText, [/(?:grand\s*total|invoice\s*total|amount\s*due|total\s*due|payable)/i]);
  const totalAmountCandidate = extractAmountValue(cleanedText, [/(?:total\s*amount)/i]);
  const grandTotal = grandTotalCandidate || totalAmountCandidate || 0;
  const amount = grandTotal || subtotal || (subtotal && gstAmount ? subtotal + gstAmount : 0) || 0;

  const emailMatch = cleanedText.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
  const email = emailMatch ? emailMatch[0].trim() : "Not Detected";

  const phoneMatch = cleanedText.match(/(?:phone|tel|mobile|contact)(?:\s*no\.?|\s*number)?\s*[:#-]?\s*(\+?[0-9\s-]{8,15})/i);
  const phoneNumber = phoneMatch ? phoneMatch[1].trim() : "Not Detected";

  const addressMatch = cleanedText.match(/(?:address|addr)\s*[:#-]?\s*([^\n]+)/i);
  const vendorAddress = addressMatch ? addressMatch[1].replace(/[^A-Za-z0-9\s.,&()/-]/g, "").trim() : "Not Detected";

  const fieldConfidence = {
    supplierName: buildFieldConfidence(ocrConfidence, supplierName),
    buyerName: buildFieldConfidence(ocrConfidence, buyerName),
    invoiceNumber: buildFieldConfidence(ocrConfidence, invoiceNumber),
    invoiceDate: buildFieldConfidence(ocrConfidence, invoiceDate),
    dueDate: buildFieldConfidence(ocrConfidence, dueDate),
    gstNumber: buildFieldConfidence(ocrConfidence, gstNumber),
    poNumber: buildFieldConfidence(ocrConfidence, poNumber),
    subtotal: buildFieldConfidence(ocrConfidence, subtotal ? String(subtotal) : ""),
    gstAmount: buildFieldConfidence(ocrConfidence, gstAmount ? String(gstAmount) : ""),
    grandTotal: buildFieldConfidence(ocrConfidence, grandTotal ? String(grandTotal) : ""),
    currency: buildFieldConfidence(ocrConfidence, currency),
    bankDetails: buildFieldConfidence(ocrConfidence, bankAccount !== "Not Detected" || ifscCode !== "Not Detected" ? `${bankAccount} / ${ifscCode}` : "")
  };

  return {
    vendorName: supplierName,
    buyerName,
    invoiceNumber,
    invoiceDate,
    dueDate,
    gstNumber,
    poNumber,
    subtotal,
    gstAmount,
    taxAmount: gstAmount,
    grandTotal,
    amount,
    currency,
    bankDetails: bankAccount !== "Not Detected" || ifscCode !== "Not Detected" ? `${bankAccount !== "Not Detected" ? bankAccount : ""}${ifscCode !== "Not Detected" ? ` / ${ifscCode}` : ""}`.trim() : "Not Detected",
    bankAccount,
    ifscCode,
    email,
    phoneNumber,
    vendorAddress,
    buyerAddress: "Plot 12, BKC, Bandra East, Mumbai 400051",
    fieldConfidence,
    products: [
      { description: `Extracted services under ${invoiceNumber}`, quantity: 1, unitPrice: amount || 0, total: amount || 0 }
    ]
  };
}
