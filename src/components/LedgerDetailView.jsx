import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { fetchDuplicateInvoices, fetchInvoiceById } from "../utils/supabaseService";

function getValue(invoice, keys, fallback = "Not available") {
  if (!invoice) return fallback;
  for (const key of keys) {
    const value = invoice[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function formatAmount(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? `₹${numberValue.toLocaleString()}` : "Not available";
}

export default function LedgerDetailView({ invoiceId, onClose }) {
  const [invoice, setInvoice] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const loadInvoice = async () => {
      setLoading(true);
      setError("");

      try {
        const currentInvoice = await fetchInvoiceById(invoiceId);
        if (isCancelled) return;
        setInvoice(currentInvoice);

        const matchingInvoices = await fetchDuplicateInvoices(invoiceId);
        if (isCancelled) return;
        setDuplicates(matchingInvoices.filter((entry) => entry && entry.id !== currentInvoice?.id));
      } catch (err) {
        if (!isCancelled) {
          console.error("[LedgerDetail] Failed to load invoice", err);
          setError(err?.message || "Unable to load the invoice from Supabase.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    if (invoiceId) {
      loadInvoice();
    } else {
      setLoading(false);
      setError("No invoice was selected.");
    }

    return () => {
      isCancelled = true;
    };
  }, [invoiceId]);

  const comparisonRows = useMemo(() => {
    if (!invoice || duplicates.length === 0) return [];
    const previousInvoice = duplicates[0];

    return [
      {
        label: "Invoice ID",
        current: getValue(invoice, ["invoice_id", "invoiceId", "invoiceNumber"], "Not available"),
        previous: getValue(previousInvoice, ["invoice_id", "invoiceId", "invoiceNumber"], "Not available"),
        same: getValue(invoice, ["invoice_id", "invoiceId", "invoiceNumber"], "") === getValue(previousInvoice, ["invoice_id", "invoiceId", "invoiceNumber"], "")
      },
      {
        label: "Vendor",
        current: getValue(invoice, ["vendor_name", "vendorName"], "Not available"),
        previous: getValue(previousInvoice, ["vendor_name", "vendorName"], "Not available"),
        same: getValue(invoice, ["vendor_name", "vendorName"], "") === getValue(previousInvoice, ["vendor_name", "vendorName"], "")
      },
      {
        label: "GST",
        current: getValue(invoice, ["gst_number", "gstNumber"], "Not available"),
        previous: getValue(previousInvoice, ["gst_number", "gstNumber"], "Not available"),
        same: getValue(invoice, ["gst_number", "gstNumber"], "") === getValue(previousInvoice, ["gst_number", "gstNumber"], "")
      },
      {
        label: "Amount",
        current: formatAmount(getValue(invoice, ["total_amount", "totalAmount", "amount", "grand_total", "grandTotal"], 0)),
        previous: formatAmount(getValue(previousInvoice, ["total_amount", "totalAmount", "amount", "grand_total", "grandTotal"], 0)),
        same: Number(getValue(invoice, ["total_amount", "totalAmount", "amount", "grand_total", "grandTotal"], 0)) === Number(getValue(previousInvoice, ["total_amount", "totalAmount", "amount", "grand_total", "grandTotal"], 0))
      },
      {
        label: "Date",
        current: getValue(invoice, ["invoice_date", "invoiceDate"], "Not available"),
        previous: getValue(previousInvoice, ["invoice_date", "invoiceDate"], "Not available"),
        same: getValue(invoice, ["invoice_date", "invoiceDate"], "") === getValue(previousInvoice, ["invoice_date", "invoiceDate"], "")
      }
    ];
  }, [invoice, duplicates]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="glass-panel relative w-full max-w-6xl overflow-hidden border border-white/10 shadow-[0_0_70px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-white/5 bg-slate-950/60 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Ledger Details</p>
            <h2 className="text-lg font-black text-white">Invoice Investigation View</h2>
          </div>
          <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 p-2 text-gray-400 transition hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-5">
          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center gap-3 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading invoice details from Supabase...</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4" />
                Unable to load invoice
              </div>
              <p>{error}</p>
            </div>
          ) : !invoice ? (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
              No invoice matching the selected ID was found. Please try again or upload the document again.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Current Invoice</h3>
                  <div className="space-y-2 text-sm text-gray-300">
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Invoice ID</span> <span className="font-semibold text-white">{getValue(invoice, ["invoice_id", "invoiceId", "invoiceNumber"], "Not available")}</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Vendor Name</span> <span className="font-semibold text-white">{getValue(invoice, ["vendor_name", "vendorName"], "Not available")}</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">GST Number</span> <span className="font-semibold text-white">{getValue(invoice, ["gst_number", "gstNumber"], "Not available")}</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Invoice Date</span> <span className="font-semibold text-white">{getValue(invoice, ["invoice_date", "invoiceDate"], "Not available")}</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Total Amount</span> <span className="font-semibold text-white">{formatAmount(getValue(invoice, ["total_amount", "totalAmount", "amount", "grand_total", "grandTotal"], 0))}</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Subtotal</span> <span className="font-semibold text-white">{formatAmount(getValue(invoice, ["subtotal"], 0))}</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">GST</span> <span className="font-semibold text-white">{formatAmount(getValue(invoice, ["gst", "tax_amount", "taxAmount", "gst_amount", "gstAmount"], 0))}</span></div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Fraud Analysis</h3>
                  <div className="space-y-2 text-sm text-gray-300">
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Fraud Score</span> <span className="font-semibold text-white">{getValue(invoice, ["fraud_score", "fraudScore"], 0)}%</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Risk Level</span> <span className="font-semibold text-white">{getValue(invoice, ["risk_level", "riskLevel"], "SAFE")}</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Confidence Score</span> <span className="font-semibold text-white">{getValue(invoice, ["confidence_score", "confidenceScore", "aiConfidence"], 0)}%</span></div>
                    <div className="flex justify-between gap-3"> <span className="text-gray-500">Fraud Reasons</span> <span className="font-semibold text-white">{Array.isArray(invoice.fraud_reasons) ? invoice.fraud_reasons.join(", ") : getValue(invoice, ["fraud_reasons", "fraudReasons", "aiExplanation"], "No reasons recorded")}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Items</h3>
                  <div className="rounded-lg border border-white/5 bg-slate-900/50 p-3 text-sm text-gray-300">
                    {invoice.items || invoice.products || invoice.line_items ? (
                      <pre className="whitespace-pre-wrap text-xs text-gray-400">{JSON.stringify(invoice.items || invoice.products || invoice.line_items, null, 2)}</pre>
                    ) : (
                      <span className="text-gray-500">No item details were stored for this invoice.</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">OCR Extracted Text</h3>
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-white/5 bg-slate-900/50 p-3 text-xs leading-relaxed text-gray-300 whitespace-pre-wrap">
                    {getValue(invoice, ["ocr_text", "ocrText", "extractedText"], "No OCR text available")}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Duplicate Comparison</h3>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${duplicates.length > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {duplicates.length > 0 ? "Duplicate Invoice Found" : "No Matching Invoice Found"}
                  </span>
                </div>

                {duplicates.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-white/5">
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="bg-slate-900/80 text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="p-3">Field</th>
                          <th className="p-3">Current Invoice</th>
                          <th className="p-3">Existing Invoice</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonRows.map((row) => (
                          <tr key={row.label} className="border-t border-white/5">
                            <td className="p-3 font-semibold text-white">{row.label}</td>
                            <td className="p-3">{row.current}</td>
                            <td className="p-3">{row.previous}</td>
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${row.same ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                                {row.same ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                                {row.same ? "Same" : "Different"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 bg-slate-900/30 p-4 text-sm text-gray-400">
                    No duplicate invoice matching this ID was found in Supabase.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
