import { supabase } from "../supabase";

export async function uploadInvoiceFile(file, storagePath) {
  const sanitizedPath = storagePath.replace(/\/+/g, "/");
  const { data, error } = await supabase.storage
    .from("invoice-files")
    .upload(sanitizedPath, file, { cacheControl: "3600", upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function saveInvoiceRecord(invoice) {
  const fields = {
    invoice_number: invoice.invoiceNumber,
    vendor_name: invoice.vendorName,
    vendor_id: invoice.vendorId,
    buyer_name: invoice.buyerName,
    invoice_date: invoice.invoiceDate,
    due_date: invoice.dueDate,
    po_number: invoice.poNumber,
    amount: invoice.amount,
    tax_amount: invoice.taxAmount,
    subtotal: invoice.amount,
    grand_total: invoice.grandTotal,
    gst_number: invoice.gstNumber,
    bank_account: invoice.bankAccount,
    ifsc_code: invoice.ifscCode,
    currency: invoice.currency,
    payment_terms: invoice.paymentTerms,
    vendor_address: invoice.vendorAddress,
    customer_address: invoice.buyerAddress,
    email: invoice.email,
    phone: invoice.phoneNumber,
    status: invoice.status || "Pending",
    badge_text: invoice.badgeText,
    risk_level: invoice.riskLevel,
    fraud_score: invoice.fraudScore,
    ai_confidence: invoice.aiConfidence,
    ai_explanation: invoice.aiExplanation,
    ai_recommendations: invoice.aiRecommendations,
    file_path: invoice.filePath || null,
    file_hash: invoice.fileHash || null,
    filename: invoice.filename || null,
    source: invoice.source || "web",
    detected_issues: invoice.detectedIssues || [],
    duplicate_invoice: invoice.duplicateInvoice || false,
    duplicate_vendor: invoice.duplicateVendor || false,
    duplicate_gst: invoice.duplicateGST || false,
    duplicate_pdf: invoice.duplicatePDF || false,
    duplicate_po: invoice.duplicatePO || false,
    duplicate_bank: invoice.duplicateBank || false,
    similar_invoice: invoice.similarInvoice || false,
    vendor_blacklisted: invoice.vendorBlacklisted || false,
    weekend_invoice: invoice.weekendInvoice || false,
    future_invoice: invoice.futureInvoice || false,
    amount_spike: invoice.amountSpike || false,
    edited_invoice: invoice.editedInvoice || false,
    missing_fields: invoice.missingFields || 0,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("invoices").insert([fields]).select().single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function saveFraudResult(invoiceId, invoice) {
  const fraudPayload = {
    invoice_id: invoiceId,
    fraud_score: invoice.fraudScore,
    risk_level: invoice.riskLevel,
    duplicate_invoice: invoice.duplicateInvoice || false,
    duplicate_vendor: invoice.duplicateVendor || false,
    duplicate_po: invoice.duplicatePO || false,
    duplicate_pdf: invoice.duplicatePDF || false,
    duplicate_bank: invoice.duplicateBank || false,
    duplicate_gst: invoice.duplicateGST || false,
    similar_invoice: invoice.similarInvoice || false,
    vendor_blacklisted: invoice.vendorBlacklisted || false,
    weekend_invoice: invoice.weekendInvoice || false,
    future_invoice: invoice.futureInvoice || false,
    amount_spike: invoice.amountSpike || false,
    edited_invoice: invoice.editedInvoice || false,
    remarks: invoice.aiExplanation || "",
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("fraud_results").insert([fraudPayload]);
  if (error) {
    throw new Error(error.message);
  }
  return data;
}
