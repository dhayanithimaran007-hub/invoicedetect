-- ============================================================================
-- SUPABASE DATABASE SETUP FOR INVOICE FRAUD DETECTION SYSTEM
-- ============================================================================
-- Run these SQL commands in your Supabase SQL Editor to configure RLS,
-- create policies, and ensure proper authentication flow.
-- ============================================================================

-- 1. CREATE INVOICES TABLE (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id TEXT,
  vendor_name TEXT,
  amount NUMERIC,
  invoice_date DATE,
  uploaded_by UUID NOT NULL,  -- ← CRITICAL: stores authenticated user ID
  pdf_url TEXT,
  status TEXT DEFAULT 'Pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fraud_score NUMERIC,
  risk_level TEXT,
  ocr_text TEXT,
  fraud_reasons TEXT,
  
  -- Create index on uploaded_by for faster queries
  CONSTRAINT fk_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS invoices_uploaded_by_idx ON invoices(uploaded_by);
CREATE INDEX IF NOT EXISTS invoices_invoice_id_idx ON invoices(invoice_id);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx ON invoices(created_at DESC);

-- 2. CREATE FRAUD_RESULTS TABLE (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fraud_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  fraud_score NUMERIC,
  risk_level TEXT,
  remarks TEXT,
  fraud_category TEXT,
  confidence_score NUMERIC,
  suggested_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fraud_results_invoice_id_idx ON fraud_results(invoice_id);

-- 3. ENABLE ROW-LEVEL SECURITY (RLS) ON INVOICES TABLE
-- ============================================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- 4. DROP EXISTING POLICIES (if any) TO AVOID CONFLICTS
-- ============================================================================
DROP POLICY IF EXISTS "authenticated_users_can_insert" ON invoices;
DROP POLICY IF EXISTS "authenticated_users_can_select" ON invoices;
DROP POLICY IF EXISTS "authenticated_users_can_update" ON invoices;
DROP POLICY IF EXISTS "authenticated_users_can_delete" ON invoices;
DROP POLICY IF EXISTS "anonymous_users_can_select" ON invoices;

-- 5. CREATE RLS POLICIES FOR AUTHENTICATED USERS
-- ============================================================================

-- Policy 1: Allow authenticated users to INSERT their own invoices
CREATE POLICY "authenticated_users_can_insert"
  ON invoices
  FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by 
    AND auth.role() = 'authenticated'
  );

-- Policy 2: Allow authenticated AND anonymous users to SELECT all invoices
CREATE POLICY "all_users_can_select"
  ON invoices
  FOR SELECT
  USING (
    auth.role() = 'authenticated' 
    OR auth.role() = 'anon'
  );

-- Policy 3: Allow authenticated users to UPDATE their own invoices
CREATE POLICY "authenticated_users_can_update"
  ON invoices
  FOR UPDATE
  USING (
    auth.uid() = uploaded_by 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    auth.uid() = uploaded_by
  );

-- Policy 4: Allow authenticated users to DELETE their own invoices
CREATE POLICY "authenticated_users_can_delete"
  ON invoices
  FOR DELETE
  USING (
    auth.uid() = uploaded_by 
    AND auth.role() = 'authenticated'
  );

-- 6. ENABLE RLS ON FRAUD_RESULTS TABLE
-- ============================================================================
ALTER TABLE fraud_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies on fraud_results
DROP POLICY IF EXISTS "fraud_results_select_policy" ON fraud_results;
DROP POLICY IF EXISTS "fraud_results_insert_policy" ON fraud_results;

-- Create RLS policies for fraud_results
CREATE POLICY "all_users_can_select_fraud_results"
  ON fraud_results
  FOR SELECT
  USING (
    auth.role() = 'authenticated' 
    OR auth.role() = 'anon'
  );

CREATE POLICY "authenticated_users_can_insert_fraud_results"
  ON fraud_results
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
  );

-- 7. VERIFY AUTHENTICATION SETTINGS
-- ============================================================================
-- Run these SELECT statements to verify configuration:

-- Check RLS status on invoices table
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('invoices', 'fraud_results') 
AND schemaname = 'public';

-- Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('invoices', 'fraud_results')
ORDER BY tablename, policyname;

-- 8. ENABLE ANONYMOUS AUTHENTICATION (via Supabase Dashboard)
-- ============================================================================
-- In Supabase Dashboard:
-- 1. Go to "Authentication" → "Providers"
-- 2. Find "Anonymous" provider
-- 3. Click toggle to enable
-- 4. Confirm "Confirm" if prompted

-- 9. VERIFY STORAGE BUCKET FOR INVOICES
-- ============================================================================
-- Create storage bucket if not exists and set RLS policies:
-- 
-- In Supabase Dashboard:
-- 1. Go to "Storage" → "Buckets"
-- 2. Create bucket named: invoice-files
-- 3. Set visibility to "Private"
-- 4. Go to "Storage" → "Policies" 
-- 5. Add policy for authenticated users to upload

-- 10. TEST ANONYMOUS USER CREATION
-- ============================================================================
-- This SQL creates a test anonymous user (normally done via signInAnonymously())
-- 
-- SELECT auth.users.*;  -- View all users
-- 
-- In your app, anonymous users are created automatically via:
-- const { data: { user } } = await supabase.auth.signInAnonymously();

-- 11. AUDIT LOGS (Optional - for tracking)
-- ============================================================================
-- Add an audit_logs table to track all invoice operations:
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT,
  table_name TEXT,
  record_id UUID,
  user_id UUID,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. BACKUP: ORIGINAL WORKING CONFIGURATION
-- ============================================================================
-- If the above policies don't work, try this simpler alternative:
--
-- DROP POLICY IF EXISTS "authenticated_users_can_insert" ON invoices;
-- CREATE POLICY "authenticated_users_can_insert"
--   ON invoices FOR INSERT
--   TO authenticated
--   WITH CHECK (auth.uid() = uploaded_by);
--
-- DROP POLICY IF EXISTS "all_users_can_select" ON invoices;
-- CREATE POLICY "all_users_can_select"
--   ON invoices FOR SELECT
--   USING (true);  -- Allow all to read

-- 13. FINAL VERIFICATION
-- ============================================================================
-- After running these scripts, verify:
-- 1. invoices table exists with uploaded_by column
-- 2. RLS is enabled on invoices table
-- 3. At least 4 policies exist (INSERT, SELECT, UPDATE, DELETE)
-- 4. Anonymous authentication is enabled in Auth settings
-- 5. invoice-files bucket exists in Storage

-- ============================================================================
-- END OF SETUP SCRIPT
-- ============================================================================
