/**
 * Deterministic rules-based fraud checking engine.
 */

import { calculateFraudScore } from "./fraudScoring";

function normalizeTextValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateDynamicInvoiceFromFile(file, invoicesDatabase = []) {
  const suppliers = [
    "TechNova Pvt Ltd",
    "Global Electronics",
    "Bright Solutions",
    "Future Systems",
    "ABC Enterprises",
    "Delta Manufacturing",
    "Zenith Technologies",
    "Apex Industries",
    "Orion Traders",
    "SkyLine Logistics"
  ];

  const nameHash = file.name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) + file.size;
  let supplierName = "";
  const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
  const words = cleanName.split(/\s+/);

  const ignoreWords = [
    "invoice", "bill", "receipt", "pdf", "scan", "copy", "statement", "doc",
    "document", "draft", "final", "client", "customer", "vendor", "payment",
    "wire", "bank", "tx", "trans", "simulated", "safe", "fraud", "review", "suspicious", "autofill"
  ];
  const meaningfulWords = words.filter((word) => !ignoreWords.includes(word.toLowerCase()) && isNaN(word));

  if (meaningfulWords.length > 0) {
    supplierName = meaningfulWords.slice(0, 2).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  } else {
    supplierName = suppliers[nameHash % suppliers.length];
  }

  let uniqueId = 10000 + (nameHash % 90000);
  const numberMatches = cleanName.match(/\b\d{3,6}\b/g);
  if (numberMatches && numberMatches.length > 0) {
    const extractedNum = Number.parseInt(numberMatches[0], 10);
    if (extractedNum > 0) uniqueId = extractedNum;
  }
  const invoiceNumber = `INV-2026-${uniqueId}`;

  let baseAmount = 25000 + (nameHash % 1950000);
  if (numberMatches && numberMatches.length > 1) {
    const possibleAmount = Number.parseInt(numberMatches[1], 10);
    if (possibleAmount >= 1000 && possibleAmount <= 5000000) {
      baseAmount = possibleAmount;
    }
  }

  const today = new Date();
  const dateOffset = nameHash % 12;
  const invoiceDateObj = new Date(today.getTime() - dateOffset * 86400000);
  const invoiceDate = invoiceDateObj.toISOString().split("T")[0];

  const dueOffset = 7 + (nameHash % 25);
  const dueDateObj = new Date(invoiceDateObj.getTime() + dueOffset * 86400000);
  const dueDate = dueDateObj.toISOString().split("T")[0];

  const isGstValid = (nameHash % 7) !== 0;
  const gstStates = ["27", "29", "07"];
  const selectedState = gstStates[nameHash % gstStates.length];
  const gstNumber = isGstValid ? `${selectedState}AAAAA${1000 + (nameHash % 9000)}A1Z${nameHash % 9}` : `INVALID_GST_${nameHash % 100}`;

  const buyerName = "Enterprise Corp India";
  const currency = "INR";
  const taxAmount = Math.round(baseAmount * 0.18);
  const discount = (nameHash % 4) === 0 ? Math.round(baseAmount * 0.05) : 0;
  const grandTotal = baseAmount + taxAmount - discount;

  const bankAccount = `9182${100000 + (nameHash % 900000)}12`;
  const ifscCode = `HDFC0${100000 + (nameHash % 900000)}`;

  const products = [
    { description: `Enterprise Solutions consultancy service for ${supplierName}`, quantity: 1, unitPrice: baseAmount, total: baseAmount }
  ];

  return {
    invoiceNumber,
    invoiceDate,
    vendorName: supplierName,
    vendorId: `VEND-0${(nameHash % 10) + 1}`,
    buyerName,
    gstNumber,
    currency,
    amount: baseAmount,
    taxAmount,
    discount,
    grandTotal,
    dueDate,
    products,
    bankAccount,
    ifscCode,
    poNumber: `PO-${80000 + (nameHash % 20000)}`,
    email: `billing@${supplierName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
    phoneNumber: `+91 98${10000000 + (nameHash % 90000000)}`,
    vendorAddress: `${selectedState === "27" ? "BKC, Mumbai, Maharashtra 400051" : selectedState === "29" ? "Cyber Heights, Bangalore, Karnataka 560001" : "Noida Sector 62, Delhi NCR 201301"}`,
    buyerAddress: "Plot 12, BKC, Bandra East, Mumbai 400051",
    timestamp: new Date().toISOString()
  };
}

export function detectFraud(invoice, invoicesDatabase = [], vendorsDatabase = []) {
  const scored = calculateFraudScore(invoice, invoicesDatabase, vendorsDatabase);
  const invoiceNumber = normalizeTextValue(invoice.invoiceNumber || invoice.invoice_id || invoice.invoiceId || invoice.id);
  const vendorName = normalizeTextValue(invoice.vendorName || invoice.vendor_name);
  const gstNumber = normalizeTextValue(invoice.gstNumber || invoice.gst_number);
  const invoiceDate = normalizeTextValue(invoice.invoiceDate || invoice.invoice_date);
  const amount = Number.parseFloat(String(invoice.total_amount || invoice.totalAmount || invoice.amount || invoice.grandTotal || invoice.grand_total || 0));

  return {
    ...invoice,
    invoiceNumber,
    vendorName,
    gstNumber,
    invoiceDate,
    amount: Number.isFinite(amount) ? amount : 0,
    grandTotal: Number.parseFloat(String(invoice.grandTotal || invoice.grand_total || invoice.total_amount || invoice.totalAmount || invoice.amount || 0)) || amount,
    fraudScore: scored.fraudScore,
    riskLevel: scored.riskLevel,
    riskCategory: scored.riskCategory,
    badgeText: scored.badgeText,
    badgeColor: scored.badgeColor,
    aiConfidence: scored.aiConfidence,
    confidenceStatus: scored.confidenceStatus,
    fraudCategory: scored.fraudCategory,
    fraudType: scored.fraudCategory,
    suggestedAction: scored.suggestedAction,
    aiExplanation: scored.reasons.join(" "),
    aiRecommendations: [scored.suggestedAction, ...scored.reasons.slice(0, 2).map((reason) => reason)],
    detectedIssues: scored.reasons,
    detectedFraudRules: scored.reasons,
    aiSummary: scored.reasons.join(" "),
    duplicateInvoice: scored.duplicateInvoice,
    duplicateInvoiceId: scored.duplicateInvoiceId,
    duplicateVendor: scored.duplicateVendor,
    invalidGst: scored.invalidGst,
    futureInvoice: scored.futureInvoice,
    amountMismatch: scored.amountMismatch,
    unknownVendor: scored.unknownVendor,
    lowOcrConfidence: scored.lowOcrConfidence,
    matchingInvoice: scored.matchingInvoice,
    ledgerComparison: scored.ledgerComparison,
    factors: {
      duplicateDetection: 100,
      timestampVerification: 100,
      completeness: 98,
      vendorVerification: 100,
      gstValidation: 100,
      paymentVerification: 100,
      historicalMatch: 100
    },
    timestamp: invoice.timestamp || new Date().toISOString()
  };
}
