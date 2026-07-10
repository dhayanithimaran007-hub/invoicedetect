# Quick Start Guide — Fixing Supabase Upload Failures

## Problem
```
Error: new row violates row-level security policy
```

## Root Cause
Invoices are being inserted without a valid `uploaded_by` user ID. RLS policies require this field to contain an authenticated Supabase user's UUID.

---

## Solution (3 Steps)

### Step 1: Enable Anonymous Authentication (Supabase Dashboard)
1. Go to: **Authentication → Providers**
2. Find **Anonymous**
3. Toggle to **ON**
4. Confirm

### Step 2: Run SQL Setup (Supabase SQL Editor)
1. Copy entire contents of **`SUPABASE_SETUP.sql`**
2. Open: **SQL Editor** in Supabase Dashboard
3. Paste and **Execute**
4. You should see: `Query executed successfully`

### Step 3: Deploy Updated Code
The code is already fixed. Just deploy these files:
- ✅ `src/utils/supabaseService.js` (updated)
- ✅ `src/components/InvoicesView.jsx` (updated)

---

## What Changed?

### Before (Broken)
```javascript
// ❌ No authentication check
// ❌ uploaded_by set to "system" (invalid user ID)
const payload = {
  invoice_id: "...",
  uploaded_by: "system",  // ← WRONG: not a valid user ID
  ...
};
await supabase.from("invoices").insert([payload]);
```

### After (Fixed)
```javascript
// ✅ Ensure user is authenticated
const user = await ensureUserAuthenticated();  // Creates anonymous user if needed

// ✅ Pass authenticated user ID to payload
const payload = buildInvoicePayload(invoice, user.id);  // user.id = valid UUID

// ✅ Insert with proper error handling
const { data, error } = await supabase
  .from("invoices")
  .insert([payload])
  .select(...)
  .single();

if (error) {
  // ✅ Show user-friendly error message
  console.error("[Supabase] Insert error:", error);
  throw new Error("Unable to save invoice due to security policy.");
}
```

---

## Key Functions Added

### `ensureUserAuthenticated()`
**What it does:** Gets current authenticated user, or signs in anonymously if needed.

**Returns:** User object with valid `id` field

```javascript
const user = await ensureUserAuthenticated();
// Returns: { id: "550e8400-e29b-41d4-a716-446655440000", email: null, ... }
```

### `verifyEnvironmentVariables()`
**What it does:** Checks that Supabase credentials are loaded.

```javascript
verifyEnvironmentVariables();
// Throws error if VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing
```

### `buildInvoicePayload(invoice, userId)`
**What it does:** Creates insert payload with only required fields, including authenticated user ID.

```javascript
const payload = buildInvoicePayload(invoice, user.id);
// Returns: { invoice_id, vendor_name, amount, uploaded_by: user.id, ... }
```

---

## Upload Flow (Updated)

```
1. User uploads invoice PDF
   ↓
2. Extract text via OCR (existing)
   ↓
3. Analyze for fraud (existing)
   ↓
4. [NEW] Ensure user is authenticated
   ├─ If authenticated: use user.id
   └─ If not authenticated: sign in anonymously, then use user.id
   ↓
5. Upload PDF to storage bucket
   ├─ If success: store file path
   └─ If fails: show warning, continue anyway
   ↓
6. [NEW] Save invoice with authenticated user ID
   ├─ If success: show green success message
   └─ If fails: show red error message with details
   ↓
7. [NEW] Refresh invoice history table
   ↓
8. Done! Invoice appears in history
```

---

## Error Messages (New)

### ❌ RLS Error (Red Card)
```
Upload Failed

Unable to save invoice due to security policy. Please ensure you are authenticated.

Error Details:
new row violates row-level security policy
```

**Fix:** Run `SUPABASE_SETUP.sql` to create RLS policies

### ❌ Auth Error (Red Card)
```
Upload Failed

Unable to authenticate. Please try again.

Error Details:
Anonymous sign-in failed: ...
```

**Fix:** Enable Anonymous provider in Supabase Dashboard

### ✅ Success (Green Card)
```
Upload Successful

✓ Invoice uploaded successfully! Invoice ID: INV-2026-12345

[Close]
```

---

## Verification Checklist

After deploying, verify these:

- [ ] App opens without errors
- [ ] Upload invoice PDF
- [ ] Check browser DevTools → Console
  - Should see: `[Supabase] Anonymous sign-in successful` (first time)
  - Should see: `[Supabase] Invoice inserted successfully`
  - Should NOT see: errors about "null" or "undefined"
- [ ] Green success card appears
- [ ] Invoice appears in history table
- [ ] In Supabase Dashboard: Check `invoices` table
  - New row should exist
  - `uploaded_by` column should have a UUID (not "system" or null)

---

## Database Queries (For Testing)

### Check if RLS is enabled
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'invoices' AND schemaname = 'public';
```

Expected result: `invoices | true`

### Check if RLS policies exist
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'invoices';
```

Expected results:
- `authenticated_users_can_insert`
- `all_users_can_select`
- `authenticated_users_can_update`
- `authenticated_users_can_delete`

### Check uploaded invoices
```sql
SELECT id, invoice_id, vendor_name, amount, uploaded_by, created_at 
FROM invoices 
ORDER BY created_at DESC 
LIMIT 10;
```

Expected: `uploaded_by` is a UUID, not "system" or null

---

## If Still Failing

### Issue: "row-level security policy"
**Solution:**
```bash
1. Open Supabase SQL Editor
2. Paste: SUPABASE_SETUP.sql
3. Execute all statements
4. Try upload again
```

### Issue: "Anonymous sign-in failed"
**Solution:**
```bash
1. Go to Supabase Dashboard
2. Authentication → Providers
3. Toggle "Anonymous" ON
4. Wait 30 seconds
5. Try upload again
```

### Issue: "VITE_SUPABASE_URL not found"
**Solution:**
```bash
1. Check .env file exists
2. Verify: VITE_SUPABASE_URL=https://...
3. Verify: VITE_SUPABASE_ANON_KEY=eyJ...
4. Restart dev server (npm run dev)
```

### Issue: "uploaded_by is null in database"
**Solution:**
```bash
1. This means ensureUserAuthenticated() isn't being called
2. Check browser console for errors
3. Verify Anonymous provider is enabled
4. Clear browser cache and cookies
5. Try incognito window
```

---

## Files Modified

| File | Changes | Purpose |
|------|---------|---------|
| `src/utils/supabaseService.js` | +250 lines | Auth verification, RLS-safe payloads, logging |
| `src/components/InvoicesView.jsx` | +80 lines | Multi-step upload flow, UI feedback states |
| `SUPABASE_SETUP.sql` | 200+ lines | RLS policies, schema setup |

---

## Support

If uploads still fail after following these steps:

1. **Collect debug info:**
   - Browser console logs (screenshot)
   - Exact error message from UI
   - Database state (`SELECT * FROM invoices;`)

2. **Check these files:**
   - `.env` — has SUPABASE_URL and ANON_KEY
   - Supabase Dashboard → Authentication → Anonymous provider is ON
   - Supabase Dashboard → SQL Editor → RLS policies exist

3. **Test with cURL** (manual test):
   ```bash
   curl -X POST https://rrexhxegegpzbyrkdfjw.supabase.co/rest/v1/invoices \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"invoice_id":"TEST","vendor_name":"Test","amount":100,"uploaded_by":"USER_UUID","status":"Pending","created_at":"2026-07-10T00:00:00Z"}'
   ```

---

## Success Criteria

✅ **Upload successful when:**
1. Green success card appears
2. Invoice ID shown in message
3. Invoice appears in history table
4. Database shows valid `uploaded_by` UUID
5. No errors in browser console

**Time to implement:** ~5 minutes (SQL setup) + deployment

