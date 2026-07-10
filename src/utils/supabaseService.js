import { supabase } from "../supabase";

// ============================================================================
// ENVIRONMENT & AUTHENTICATION VERIFICATION
// ============================================================================

export function verifyEnvironmentVariables() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error("[Supabase] Missing environment variables:", { hasUrl: !!url, hasAnonKey: !!anonKey });
    throw new Error("Supabase environment variables are not configured. Please check .env file.");
  }

  console.log("[Supabase] Environment verified:", { url: url.substring(0, 20) + "..." });
  return { url, anonKey };
}

/**
 * Get the current authenticated user, or sign in anonymously if no user exists.
 */
export async function ensureUserAuthenticated() {
  try {
    const { data: { user }, error: getUserError } = await supabase.auth.getUser();

    if (getUserError) {
      console.error("[Supabase] Failed to get user:", getUserError);
      throw new Error(getUserError.message);
    }

    // User already authenticated
    if (user && user.id) {
      console.log("[Supabase] User already authenticated:", { userId: user.id, email: user.email || "anonymous" });
      return user;
    }

    // No user session — attempt anonymous sign-in
    console.log("[Supabase] No authenticated user found. Attempting anonymous sign-in...");
    const { data: { user: anonUser }, error: anonError } = await supabase.auth.signInAnonymously();

    if (anonError) {
      console.error("[Supabase] Anonymous sign-in failed:", anonError);
      throw new Error(`Anonymous sign-in failed: ${anonError.message}`);
    }

    if (!anonUser || !anonUser.id) {
      console.error("[Supabase] Anonymous sign-in succeeded but no user ID returned");
      throw new Error("Anonymous sign-in succeeded but no user ID was returned.");
    }

    console.log("[Supabase] Anonymous sign-in successful:", { userId: anonUser.id });
    return anonUser;
  } catch (error) {
    console.error("[Supabase] ensureUserAuthenticated error:", error);
    throw error;
  }
}

// ============================================================================
// DATA NORMALIZATION & PAYLOAD BUILDING
// ============================================================================

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

function buildInvoicePayload(invoice, userId) {
  // Priority order for amount: grand total > total amount > subtotal > amount
  const grandTotal = toNumber(invoice.grandTotal ?? invoice.grand_total ?? invoice.total_amount ?? invoice.totalAmount ?? invoice.amount ?? 0);
  
  // Build payload with only required fields to minimize RLS issues
  const payload = {
    invoice_id: invoice.invoice_id || invoice.invoiceId || invoice.invoiceNumber || null,
    vendor_name: invoice.vendor_name || invoice.vendorName || null,
    amount: grandTotal > 0 ? grandTotal : toNumber(invoice.amount ?? invoice.total_amount ?? invoice.totalAmount ?? 0),
    invoice_date: invoice.invoice_date || invoice.invoiceDate || null,
    uploaded_by: userId || null,  // Use authenticated user ID
    pdf_url: invoice.pdf_url || invoice.pdfUrl || invoice.filePath || invoice.file_path || null,
    status: invoice.status || "Pending",
    created_at: new Date().toISOString()
  };

  // Remove any undefined or null values to avoid RLS issues
  return Object.fromEntries(
    Object.entries(payload).filter(([_, value]) => value !== undefined && value !== null)
  );
}

export function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

export async function uploadInvoiceFile(file, storagePath) {
  console.log("[Supabase] Uploading file to storage:", { storagePath, fileSize: file.size });
  
  const sanitizedPath = storagePath.replace(/\/+/g, "/");
  
  try {
    const { data, error } = await supabase.storage
      .from("invoice-files")
      .upload(sanitizedPath, file, { cacheControl: "3600", upsert: false });

    if (error) {
      console.error("[Supabase] Storage upload error:", error);
      throw new Error(`Failed to upload file to storage: ${error.message}`);
    }

    console.log("[Supabase] File uploaded successfully:", { path: data.path });
    return data;
  } catch (error) {
    console.error("[Supabase] uploadInvoiceFile error:", error);
    throw error;
  }
}

// ============================================================================
// INVOICE RETRIEVAL OPERATIONS
// ============================================================================

export async function fetchHistoricalInvoices() {
  console.log("[Supabase] Fetching historical invoices");
  
  try {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_id, vendor_name, amount, invoice_date, uploaded_by, pdf_url, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Supabase] Fetch historical invoices error:", error);
      throw new Error(`Failed to fetch historical invoices: ${error.message}`);
    }

    console.log("[Supabase] Fetched historical invoices:", { count: data?.length || 0 });
    return (data || []).map(normalizeRow);
  } catch (error) {
    console.error("[Supabase] fetchHistoricalInvoices error:", error);
    throw error;
  }
}

export async function getInvoice(identifier) {
  console.log("[Supabase] Getting invoice by identifier:", { identifier });
  
  if (!identifier) {
    console.warn("[Supabase] No identifier provided to getInvoice");
    return null;
  }

  try {
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
      console.error("[Supabase] Get invoice error:", error);
      throw new Error(`Failed to retrieve invoice: ${error.message}`);
    }

    console.log("[Supabase] Retrieved invoice:", { id: data?.id, invoice_id: data?.invoice_id });
    return normalizeRow(data);
  } catch (error) {
    console.error("[Supabase] getInvoice error:", error);
    throw error;
  }
}

export async function fetchInvoiceById(identifier) {
  return getInvoice(identifier);
}

export async function fetchDuplicateInvoices(identifier) {
  console.log("[Supabase] Fetching duplicate invoices for:", { identifier });
  
  try {
    const currentInvoice = await getInvoice(identifier);
    
    if (!currentInvoice || !currentInvoice.invoice_id) {
      console.log("[Supabase] No current invoice found or no invoice_id to match");
      return [];
    }

    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_id, vendor_name, amount, invoice_date, uploaded_by, pdf_url, status, created_at")
      .eq("invoice_id", currentInvoice.invoice_id);

    if (error) {
      console.error("[Supabase] Fetch duplicate invoices error:", error);
      throw new Error(`Failed to fetch duplicate invoices: ${error.message}`);
    }

    const duplicates = (data || []).map(normalizeRow).filter((entry) => entry && entry.id !== currentInvoice.id);
    console.log("[Supabase] Found duplicate invoices:", { count: duplicates.length });
    return duplicates;
  } catch (error) {
    console.error("[Supabase] fetchDuplicateInvoices error:", error);
    throw error;
  }
}

// ============================================================================
// INVOICE PERSISTENCE OPERATIONS
// ============================================================================

/**
 * Save an invoice record to Supabase with proper authentication and error handling.
 * @param {Object} invoice - The invoice data to save
 * @returns {Object|null} - The saved invoice normalized row, or null on error
 */
export async function saveInvoiceRecord(invoice) {
  console.log("[Supabase] saveInvoiceRecord called with invoice:", { invoiceNumber: invoice.invoiceNumber });
  
  try {
    // Ensure user is authenticated
    const user = await ensureUserAuthenticated();
    console.log("[Supabase] User authenticated for insert:", { userId: user.id });

    // Build payload with authenticated user ID
    const payload = buildInvoicePayload(invoice, user.id);
    console.log("[Supabase] Insert payload built:", { 
      invoiceId: payload.invoice_id, 
      vendor: payload.vendor_name,
      uploadedBy: payload.uploaded_by,
      amount: payload.amount
    });

    // Insert the record
    const { data, error } = await supabase
      .from("invoices")
      .insert([payload])
      .select("id, invoice_id, vendor_name, amount, invoice_date, uploaded_by, pdf_url, status, created_at")
      .single();

    if (error) {
      console.error("[Supabase] Insert error (full details):", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      // Provide user-friendly error messages
      let userFriendlyMessage = error.message;
      if (error.message?.includes("row-level security")) {
        userFriendlyMessage = "Unable to save invoice due to security policy. Please ensure you are authenticated.";
      } else if (error.message?.includes("permission denied")) {
        userFriendlyMessage = "You do not have permission to save invoices. Please contact support.";
      } else if (error.message?.includes("column")) {
        userFriendlyMessage = "Invalid invoice data. Please check all required fields are filled.";
      }

      throw new Error(userFriendlyMessage);
    }

    if (!data) {
      console.error("[Supabase] Insert succeeded but no data returned");
      throw new Error("Invoice was saved but no confirmation was received.");
    }

    console.log("[Supabase] Invoice inserted successfully:", { id: data.id, invoice_id: data.invoice_id });
    return normalizeRow(data);
  } catch (error) {
    console.error("[Supabase] saveInvoiceRecord error:", error);
    throw error;
  }
}

/**
 * Save fraud analysis results for an invoice.
 */
export async function saveFraudResult(invoiceId, invoice) {
  console.log("[Supabase] Saving fraud result for invoice:", { invoiceId });
  
  try {
    const fraudPayload = {
      invoice_id: invoiceId,
      fraud_score: invoice.fraudScore ?? null,
      risk_level: invoice.riskLevel ?? null,
      remarks: invoice.aiExplanation ?? "",
      fraud_category: invoice.fraudCategory || invoice.fraudType || null,
      confidence_score: invoice.confidenceScore || invoice.aiConfidence || null,
      suggested_action: invoice.suggestedAction || null,
      created_at: new Date().toISOString()
    };

    // Remove undefined values
    const cleanPayload = Object.fromEntries(
      Object.entries(fraudPayload).filter(([_, value]) => value !== undefined)
    );

    console.log("[Supabase] Fraud result payload:", cleanPayload);

    const { data, error } = await supabase
      .from("fraud_results")
      .insert([cleanPayload]);

    if (error) {
      console.error("[Supabase] Fraud result insert error:", error);
      // Non-critical error — log but don't throw
      return null;
    }

    console.log("[Supabase] Fraud result saved successfully");
    return data;
  } catch (error) {
    console.error("[Supabase] saveFraudResult error:", error);
    // Non-critical — don't throw
    return null;
  }
}

/**
 * Delete an invoice record (if RLS allows).
 */
export async function deleteInvoice(identifier) {
  console.log("[Supabase] Deleting invoice:", { identifier });
  
  try {
    if (!identifier) {
      throw new Error("No invoice identifier supplied.");
    }

    const query = isUuid(identifier)
      ? supabase.from("invoices").delete().eq("id", identifier)
      : supabase.from("invoices").delete().eq("invoice_id", identifier);

    const { error } = await query;

    if (error) {
      console.error("[Supabase] Delete error:", error);
      throw new Error(`Failed to delete invoice: ${error.message}`);
    }

    console.log("[Supabase] Invoice deleted successfully");
    return true;
  } catch (error) {
    console.error("[Supabase] deleteInvoice error:", error);
    throw error;
  }
}

/**
 * Get the current authenticated user without modifications.
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error("[Supabase] getCurrentUser error:", error);
    return null;
  }
}
