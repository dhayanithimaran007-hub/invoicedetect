import { supabase } from "../supabase";

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: row.id ?? null,
    invoice_id: row.invoice_id ?? row.invoiceId ?? row.invoice_number ?? row.invoiceNumber ?? null,
    vendor_name: row.vendor_name ?? row.vendorName ?? null,
    amount: Number(row.amount ?? row.total_amount ?? row.totalAmount ?? row.grand_total ?? row.grandTotal ?? 0),
    invoice_date: row.invoice_date ?? row.invoiceDate ?? null,
    uploaded_by: row.uploaded_by ?? row.uploadedBy ?? null,
    pdf_url: row.pdf_url ?? row.pdfUrl ?? row.file_path ?? row.filePath ?? null,
    status: row.status ?? "Pending",
    created_at: row.created_at ?? row.createdAt ?? null,
    fraud_score: row.fraud_score ?? row.fraudScore ?? null,
    risk_level: row.risk_level ?? row.riskLevel ?? null,
    ocr_text: row.ocr_text ?? row.ocrText ?? row.extractedText ?? null,
    fraud_reasons: row.fraud_reasons ?? row.fraudReasons ?? row.aiExplanation ?? null
  };
}

function toNumber(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildInvoicePayload(invoice) {
  const grandTotal = toNumber(invoice.grandTotal ?? invoice.grand_total ?? invoice.total_amount ?? invoice.totalAmount ?? invoice.amount ?? 0);
  return {
    invoice_id: invoice.invoice_id || invoice.invoiceId || invoice.invoiceNumber || null,
    vendor_name: invoice.vendor_name || invoice.vendorName || null,
    amount: grandTotal || toNumber(invoice.amount ?? invoice.total_amount ?? invoice.totalAmount ?? 0),
    invoice_date: invoice.invoice_date || invoice.invoiceDate || null,
    uploaded_by: invoice.uploaded_by || invoice.uploadedBy || "system",
    pdf_url: invoice.pdf_url || invoice.pdfUrl || invoice.filePath || invoice.file_path || null,
    status: invoice.status || "Pending",
    created_at: new Date().toISOString()
  };
}

export function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

export async function fetchHistoricalInvoices() {
  console.log("[Supabase] Fetch response", { scope: "historical-invoices" });
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_id, vendor_name, amount, invoice_date, uploaded_by, pdf_url, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase] Fetch error", error);
    throw new Error(error.message);
  }

  console.log("[Supabase] Fetch response", data);
  return (data || []).map(normalizeRow);
}

export async function getInvoice(identifier) {
  console.log("[Supabase] Ledger query", { identifier });
  if (!identifier) {
    return null;
  }

  let query = supabase
    .from("invoices")
    .select("id, invoice_id, vendor_name, amount, invoice_date, uploaded_by, pdf_url, status, created_at")
    .limit(1);

  if (isUuid(identifier)) {
    query = query.eq("id", identifier);
  } else {
    query = query.eq("invoice_id", identifier);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[Supabase] Ledger query error", error);
    throw new Error(error.message);
  }

  console.log("[Supabase] Ledger response", data);
  return normalizeRow(data);
}

export async function fetchInvoiceById(identifier) {
  return getInvoice(identifier);
}

export async function fetchDuplicateInvoices(identifier) {
  console.log("[Supabase] Duplicate lookup", { identifier });
  const currentInvoice = await getInvoice(identifier);
  if (!currentInvoice || !currentInvoice.invoice_id) {
    return [];
  }

  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_id, vendor_name, amount, invoice_date, uploaded_by, pdf_url, status, created_at")
    .eq("invoice_id", currentInvoice.invoice_id);

  if (error) {
    console.error("[Supabase] Duplicate lookup error", error);
    throw new Error(error.message);
  }

  console.log("[Supabase] Duplicate response", data);
  return (data || []).map(normalizeRow).filter((entry) => entry && entry.id !== currentInvoice.id);
}

export async function saveInvoiceRecord(invoice) {
  const payload = buildInvoicePayload(invoice);
  console.log("[Supabase] Insert payload", payload);

  const { data, error } = await supabase
    .from("invoices")
    .insert([payload])
    .select("id, invoice_id, vendor_name, amount, invoice_date, uploaded_by, pdf_url, status, created_at")
    .single();

  if (error) {
    console.error("[Supabase] Insert invoice error", error);
    throw new Error(error.message || "Supabase insert failed.");
  }

  console.log("[Supabase] Insert response", data);
  return normalizeRow(data);
}

export async function saveFraudResult(invoiceId, invoice) {
  const fraudPayload = {
    invoice_id: invoiceId,
    fraud_score: invoice.fraudScore,
    risk_level: invoice.riskLevel,
    remarks: invoice.aiExplanation || "",
    fraud_category: invoice.fraudCategory || invoice.fraudType || null,
    confidence_score: invoice.confidenceScore || invoice.aiConfidence || null,
    suggested_action: invoice.suggestedAction || null,
    created_at: new Date().toISOString()
  };

  console.log("[Supabase] Fraud result payload", fraudPayload);
  const { data, error } = await supabase.from("fraud_results").insert([fraudPayload]);
  if (error) {
    console.error("[Supabase] Insert fraud result error", error);
    return null;
  }
  console.log("[Supabase] Fraud result response", data);
  return data;
}
