export async function computeSHA256Hash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeInvoiceNumber(value) {
  if (!value) return "";
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^inv/, "");
}

export function invoiceNumberSimilarity(a, b) {
  const normA = normalizeInvoiceNumber(a);
  const normB = normalizeInvoiceNumber(b);
  if (!normA || !normB) return 0;
  const len = Math.max(normA.length, normB.length);
  const dist = levenshteinDistance(normA, normB);
  return Math.max(0, (len - dist) / len) * 100;
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}
