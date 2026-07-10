type InvoiceLike = Record<string, any>;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInvoiceId(value: unknown): string {
  const normalized = normalizeText(value).toUpperCase();
  return normalized === "NOT DETECTED" || !normalized ? "" : normalized;
}

function toNumber(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidGstNumber(value: string): boolean {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/.test(value);
}

function getRiskBand(score: number) {
  if (score >= 81) {
    return { level: "HIGH RISK", badgeText: "High Risk", badgeColor: "red" };
  }
  if (score >= 51) {
    return { level: "MEDIUM RISK", badgeText: "Medium Risk", badgeColor: "orange" };
  }
  if (score >= 21) {
    return { level: "LOW RISK", badgeText: "Low Risk", badgeColor: "yellow" };
  }
  return { level: "SAFE", badgeText: "Safe", badgeColor: "green" };
}

function getSuggestedAction(score: number, reasons: string[]) {
  if (score >= 81) return "Reject Invoice";
  if (score >= 51) return "Manual Investigation Required";
  if (reasons.length) return "Review with Finance Team";
  return "Approve Invoice";
}

function getConfidenceScore(score: number) {
  return Math.min(99, Math.max(60, 100 - score / 2));
}

function getConfidenceStatus(confidence: number) {
  if (confidence >= 95) return "Very High Confidence";
  if (confidence >= 80) return "High Confidence";
  if (confidence >= 70) return "Medium Confidence";
  return "Low Confidence";
}

function getLineItemTotal(invoice: InvoiceLike): number {
  const products = Array.isArray(invoice.products) ? invoice.products : [];
  return products.reduce((sum: number, item: any) => {
    const quantity = toNumber(item?.quantity);
    const unitPrice = toNumber(item?.unitPrice ?? item?.price ?? item?.amount);
    const total = toNumber(item?.total ?? item?.amount ?? quantity * unitPrice);
    return sum + (total || quantity * unitPrice);
  }, 0);
}

function buildComparisonRows(currentInvoice: InvoiceLike, previousInvoice: InvoiceLike) {
  const currentId = normalizeInvoiceId(currentInvoice.invoiceNumber || currentInvoice.invoice_id || currentInvoice.invoiceId || currentInvoice.id);
  const previousId = normalizeInvoiceId(previousInvoice.invoiceNumber || previousInvoice.invoice_id || previousInvoice.invoiceId || previousInvoice.id);
  const currentVendor = normalizeText(currentInvoice.vendorName || currentInvoice.vendor_name);
  const previousVendor = normalizeText(previousInvoice.vendorName || previousInvoice.vendor_name);
  const currentGst = normalizeText(currentInvoice.gstNumber || currentInvoice.gst_number);
  const previousGst = normalizeText(previousInvoice.gstNumber || previousInvoice.gst_number);
  const currentAmount = toNumber(currentInvoice.total_amount || currentInvoice.totalAmount || currentInvoice.amount || currentInvoice.grandTotal || currentInvoice.grand_total);
  const previousAmount = toNumber(previousInvoice.total_amount || previousInvoice.totalAmount || previousInvoice.amount || previousInvoice.grandTotal || previousInvoice.grand_total);
  const currentDate = normalizeText(currentInvoice.invoiceDate || currentInvoice.invoice_date);
  const previousDate = normalizeText(previousInvoice.invoiceDate || previousInvoice.invoice_date);

  return [
    { field: "Invoice ID", currentValue: currentId || "Not Detected", previousValue: previousId || "Not Detected", changed: currentId !== previousId },
    { field: "Vendor", currentValue: currentVendor || "Not Detected", previousValue: previousVendor || "Not Detected", changed: currentVendor !== previousVendor },
    { field: "GST", currentValue: currentGst || "Not Detected", previousValue: previousGst || "Not Detected", changed: currentGst !== previousGst },
    { field: "Amount", currentValue: currentAmount ? `₹${currentAmount.toLocaleString()}` : "Not Detected", previousValue: previousAmount ? `₹${previousAmount.toLocaleString()}` : "Not Detected", changed: Math.abs(currentAmount - previousAmount) > 1 },
    { field: "Date", currentValue: currentDate || "Not Detected", previousValue: previousDate || "Not Detected", changed: currentDate !== previousDate }
  ];
}

export function calculateFraudScore(invoice: InvoiceLike, previousInvoices: InvoiceLike[] = [], vendorsDatabase: InvoiceLike[] = []) {
  const reasons: string[] = [];
  const issues = {
    duplicateInvoice: false,
    duplicateInvoiceId: false,
    duplicateVendor: false,
    invalidGst: false,
    futureInvoice: false,
    amountMismatch: false,
    unknownVendor: false,
    lowOcrConfidence: false
  };

  const invoiceId = normalizeInvoiceId(invoice.invoiceNumber || invoice.invoice_id || invoice.invoiceId || invoice.id);
  const vendorName = normalizeText(invoice.vendorName || invoice.vendor_name);
  const gstNumber = normalizeText(invoice.gstNumber || invoice.gst_number);
  const invoiceDate = normalizeText(invoice.invoiceDate || invoice.invoice_date);
  const totalAmount = toNumber(invoice.total_amount || invoice.totalAmount || invoice.amount || invoice.grandTotal || invoice.grand_total);
  const grandTotal = toNumber(invoice.grandTotal || invoice.grand_total || invoice.total_amount || invoice.totalAmount || invoice.amount);
  const taxAmount = toNumber(invoice.taxAmount || invoice.tax_amount || invoice.gstAmount || invoice.gst_amount);
  const ocrConfidence = toNumber(invoice.ocrConfidence || invoice.ocr_confidence || invoice.confidence || 100);

  let score = 0;
  let matchingInvoice: InvoiceLike | null = null;

  if (invoiceId) {
    matchingInvoice = previousInvoices.find((entry: InvoiceLike) => {
      const previousId = normalizeInvoiceId(entry.invoiceNumber || entry.invoice_id || entry.invoiceId || entry.id);
      return previousId && previousId === invoiceId;
    }) ?? null;
  }

  if (matchingInvoice) {
    score += 80;
    issues.duplicateInvoice = true;
    issues.duplicateInvoiceId = true;
    reasons.push("Duplicate Invoice ID detected.");

    const previousVendor = normalizeText(matchingInvoice.vendorName || matchingInvoice.vendor_name);
    const previousAmount = toNumber(matchingInvoice.total_amount || matchingInvoice.totalAmount || matchingInvoice.amount || matchingInvoice.grandTotal || matchingInvoice.grand_total);
    const previousDate = normalizeText(matchingInvoice.invoiceDate || matchingInvoice.invoice_date);

    if (previousVendor && vendorName && previousVendor.toLowerCase() !== vendorName.toLowerCase()) {
      score += 15;
      reasons.push("Invoice ID reused by another vendor.");
    }

    if (
      previousVendor && vendorName &&
      previousVendor.toLowerCase() === vendorName.toLowerCase() &&
      previousAmount > 0 && totalAmount > 0 &&
      Math.abs(previousAmount - totalAmount) < 1 &&
      previousDate && invoiceDate && previousDate === invoiceDate
    ) {
      score += 40;
      issues.duplicateVendor = true;
      reasons.push("Possible duplicate invoice.");
    }
  }

  if (!isValidGstNumber(gstNumber)) {
    score += 20;
    issues.invalidGst = true;
    reasons.push("Invalid GST number.");
  }

  if (invoiceDate) {
    const parsedDate = new Date(invoiceDate);
    const today = new Date();
    parsedDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(parsedDate.getTime()) && parsedDate > today) {
      score += 30;
      issues.futureInvoice = true;
      reasons.push("Future invoice date.");
    }
  }

  const lineItemTotal = getLineItemTotal(invoice);
  const calculatedTotal = lineItemTotal + taxAmount;
  if (grandTotal > 0 && Math.abs(calculatedTotal - grandTotal) > 1) {
    score += 35;
    issues.amountMismatch = true;
    reasons.push("Grand total does not match calculated amount.");
  }

  const knownVendor = vendorsDatabase.some((entry: InvoiceLike) => {
    const existingVendor = normalizeText(entry.name || entry.vendorName || entry.vendor_name);
    return existingVendor && existingVendor.toLowerCase() === vendorName.toLowerCase();
  }) || previousInvoices.some((entry: InvoiceLike) => {
    const existingVendor = normalizeText(entry.vendorName || entry.vendor_name);
    return existingVendor && existingVendor.toLowerCase() === vendorName.toLowerCase();
  });

  if (vendorName && !knownVendor) {
    score += 15;
    issues.unknownVendor = true;
    reasons.push("Unknown vendor.");
  }

  if (ocrConfidence < 80) {
    score += 15;
    issues.lowOcrConfidence = true;
    reasons.push("Low OCR confidence.");
  }

  const fraudScore = Math.min(100, Math.max(0, score));
  const risk = getRiskBand(fraudScore);
  const confidenceScore = getConfidenceScore(fraudScore);
  const confidenceStatus = getConfidenceStatus(confidenceScore);
  const fraudCategory = fraudScore >= 81 ? "High Risk Fraud" : fraudScore >= 51 ? "Suspicious Invoice" : fraudScore >= 21 ? "Needs Review" : "Routine Invoice";
  const suggestedAction = getSuggestedAction(fraudScore, reasons);

  return {
    fraudScore,
    riskLevel: risk.level,
    riskCategory: risk.level,
    badgeText: risk.badgeText,
    badgeColor: risk.badgeColor,
    confidenceScore,
    aiConfidence: confidenceScore,
    confidenceStatus,
    fraudCategory,
    suggestedAction,
    reasons: [...new Set(reasons)],
    duplicateInvoice: issues.duplicateInvoice,
    duplicateInvoiceId: issues.duplicateInvoiceId,
    duplicateVendor: issues.duplicateVendor,
    invalidGst: issues.invalidGst,
    futureInvoice: issues.futureInvoice,
    amountMismatch: issues.amountMismatch,
    unknownVendor: issues.unknownVendor,
    lowOcrConfidence: issues.lowOcrConfidence,
    matchingInvoice,
    ledgerComparison: matchingInvoice
      ? {
          currentInvoice: invoice,
          previousInvoice: matchingInvoice,
          differences: buildComparisonRows(invoice, matchingInvoice)
        }
      : null
  };
}
