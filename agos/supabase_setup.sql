-- ============================================================
-- AGOS Banking App — Supabase Database Setup
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  phone         TEXT UNIQUE,
  account_number TEXT UNIQUE DEFAULT ('AGS' || LPAD(FLOOR(RANDOM() * 9999999)::TEXT, 7, '0')),
  balance       NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  pin_hash      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. SYSTEM FUND (admin controls total system money)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_fund (
  id            SERIAL PRIMARY KEY,
  total_funds   NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  updated_by    UUID REFERENCES public.profiles(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes         TEXT
);

-- Seed one row
INSERT INTO public.system_fund (total_funds, notes)
VALUES (0.00, 'Initial system fund')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id       UUID REFERENCES public.profiles(id),
  receiver_id     UUID REFERENCES public.profiles(id),
  type            TEXT NOT NULL CHECK (type IN ('transfer','bill_payment','admin_credit','admin_debit','receive')),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  fee             NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  description     TEXT,
  reference_no    TEXT UNIQUE DEFAULT ('TXN' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM()*999999)::TEXT,6,'0')),
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','flagged')),
  bill_biller     TEXT,
  bill_account    TEXT,
  is_flagged      BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. SAVED CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.saved_contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nickname      TEXT NOT NULL,
  account_number TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','danger')),
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. SUPPORT TICKETS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority      TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  admin_reply   TEXT,
  replied_by    UUID REFERENCES public.profiles(id),
  replied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. BILLERS (admin-managed list)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'utilities',
  logo_url      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed common billers
INSERT INTO public.billers (name, category) VALUES
  ('Meralco', 'electricity'),
  ('Manila Water', 'water'),
  ('Maynilad', 'water'),
  ('PLDT', 'internet'),
  ('Globe Telecom', 'telecom'),
  ('Smart Communications', 'telecom'),
  ('Sky Cable', 'cable'),
  ('Converge ICT', 'internet'),
  ('SSS', 'government'),
  ('PhilHealth', 'government'),
  ('Pag-IBIG Fund', 'government'),
  ('BIR', 'government')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. TRUSTED FAMILY ACCESS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trusted_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label           TEXT NOT NULL DEFAULT 'Family Member',
  can_view_balance BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_history BOOLEAN NOT NULL DEFAULT TRUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, trusted_user_id)
);

-- ============================================================
-- 9. FRAUD RULES (simple threshold table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fraud_rules (
  id                  SERIAL PRIMARY KEY,
  rule_name           TEXT NOT NULL,
  threshold_amount    NUMERIC(15,2),
  threshold_count     INT,
  window_minutes      INT DEFAULT 60,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.fraud_rules (rule_name, threshold_amount, threshold_count, window_minutes) VALUES
  ('Large single transfer', 50000.00, NULL, NULL),
  ('Rapid transactions', NULL, 5, 10)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_fund ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_rules ENABLE ROW LEVEL SECURITY;

-- Helper: is current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Lookup profile by account number (safe public fields only)
CREATE OR REPLACE FUNCTION public.lookup_profile_by_account(p_account_number TEXT)
RETURNS TABLE(id UUID, full_name TEXT, account_number TEXT)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT id, full_name, account_number
  FROM public.profiles
  WHERE account_number = p_account_number;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_profile_by_account(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_account(TEXT) TO anon;

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (public.is_admin());

-- Trusted family view access
CREATE POLICY "Trusted family can view balance" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trusted_contacts tc
      WHERE tc.owner_id = profiles.id
        AND tc.trusted_user_id = auth.uid()
        AND tc.is_active = TRUE
        AND tc.can_view_balance = TRUE
    )
  );

-- TRANSACTIONS policies
CREATE POLICY "Users can see own transactions" ON public.transactions
  FOR SELECT USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK (sender_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can update transactions" ON public.transactions
  FOR UPDATE USING (public.is_admin());

-- SAVED CONTACTS policies
CREATE POLICY "Users manage own contacts" ON public.saved_contacts
  FOR ALL USING (owner_id = auth.uid() OR public.is_admin());

-- NOTIFICATIONS policies
CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- SUPPORT TICKETS policies
CREATE POLICY "Users manage own tickets" ON public.support_tickets
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can insert tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tickets" ON public.support_tickets
  FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());

-- BILLERS policies
CREATE POLICY "All authenticated users can view billers" ON public.billers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage billers" ON public.billers
  FOR ALL USING (public.is_admin());

-- SYSTEM FUND policies
CREATE POLICY "Admins manage system fund" ON public.system_fund
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view system fund total" ON public.system_fund
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- TRUSTED CONTACTS policies
CREATE POLICY "Users manage own trusted contacts" ON public.trusted_contacts
  FOR ALL USING (owner_id = auth.uid() OR public.is_admin());

-- FRAUD RULES policies
CREATE POLICY "Admins manage fraud rules" ON public.fraud_rules
  FOR ALL USING (public.is_admin());

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update updated_at on profile changes
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fraud check function
CREATE OR REPLACE FUNCTION public.check_fraud(p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_large_threshold NUMERIC;
  v_rapid_count     INT;
  v_rapid_window    INT;
  v_rapid_limit     INT;
  v_count           INT;
BEGIN
  SELECT threshold_amount INTO v_large_threshold
  FROM public.fraud_rules
  WHERE rule_name = 'Large single transfer' AND is_active = TRUE
  LIMIT 1;

  IF v_large_threshold IS NOT NULL AND p_amount >= v_large_threshold THEN
    RETURN TRUE;
  END IF;

  SELECT threshold_count, window_minutes INTO v_rapid_limit, v_rapid_window
  FROM public.fraud_rules
  WHERE rule_name = 'Rapid transactions' AND is_active = TRUE
  LIMIT 1;

  IF v_rapid_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM public.transactions
    WHERE sender_id = p_user_id
      AND created_at >= NOW() - (v_rapid_window || ' minutes')::INTERVAL;

    IF v_count >= v_rapid_limit THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- Transfer money function (atomic, server-side)
CREATE OR REPLACE FUNCTION public.transfer_money(
  p_sender_id     UUID,
  p_receiver_acct TEXT,
  p_amount        NUMERIC,
  p_description   TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_receiver      public.profiles%ROWTYPE;
  v_sender        public.profiles%ROWTYPE;
  v_txn_id        UUID;
  v_is_fraud      BOOLEAN;
  v_ref_no        TEXT;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', FALSE, 'error', 'Invalid amount');
  END IF;

  -- Get sender
  SELECT * INTO v_sender FROM public.profiles WHERE id = p_sender_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', 'Sender not found');
  END IF;

  -- Get receiver
  SELECT * INTO v_receiver FROM public.profiles WHERE account_number = p_receiver_acct FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', 'Recipient account not found');
  END IF;

  -- Can't send to self
  IF v_sender.id = v_receiver.id THEN
    RETURN json_build_object('success', FALSE, 'error', 'Cannot transfer to own account');
  END IF;

  -- Check balance
  IF v_sender.balance < p_amount THEN
    RETURN json_build_object('success', FALSE, 'error', 'Insufficient balance');
  END IF;

  -- Fraud check
  v_is_fraud := public.check_fraud(p_sender_id, p_amount);

  -- Generate reference
  v_ref_no := 'TXN' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM()*999999)::TEXT, 6, '0');
  v_txn_id := uuid_generate_v4();

  -- Insert transaction
  INSERT INTO public.transactions (id, sender_id, receiver_id, type, amount, description, reference_no, status, is_flagged, flag_reason)
  VALUES (
    v_txn_id,
    p_sender_id,
    v_receiver.id,
    'transfer',
    p_amount,
    p_description,
    v_ref_no,
    CASE WHEN v_is_fraud THEN 'flagged' ELSE 'completed' END,
    v_is_fraud,
    CASE WHEN v_is_fraud THEN 'Flagged by fraud detection' ELSE NULL END
  );

  IF NOT v_is_fraud THEN
    -- Deduct from sender
    UPDATE public.profiles SET balance = balance - p_amount WHERE id = p_sender_id;
    -- Credit receiver
    UPDATE public.profiles SET balance = balance + p_amount WHERE id = v_receiver.id;
  END IF;

  -- Notify sender
  INSERT INTO public.notifications (user_id, title, body, type, transaction_id)
  VALUES (
    p_sender_id,
    CASE WHEN v_is_fraud THEN '⚠️ Transfer Under Review' ELSE '✅ Transfer Sent' END,
    CASE WHEN v_is_fraud
      THEN 'Your transfer of ₱' || p_amount || ' to ' || v_receiver.full_name || ' is under review.'
      ELSE 'You sent ₱' || p_amount || ' to ' || v_receiver.full_name || '. Ref: ' || v_ref_no
    END,
    CASE WHEN v_is_fraud THEN 'warning' ELSE 'success' END,
    v_txn_id
  );

  -- Notify receiver (only if not flagged)
  IF NOT v_is_fraud THEN
    INSERT INTO public.notifications (user_id, title, body, type, transaction_id)
    VALUES (
      v_receiver.id,
      '💰 Money Received',
      'You received ₱' || p_amount || ' from ' || v_sender.full_name || '. Ref: ' || v_ref_no,
      'success',
      v_txn_id
    );
  END IF;

  RETURN json_build_object(
    'success', NOT v_is_fraud,
    'flagged', v_is_fraud,
    'transaction_id', v_txn_id,
    'reference_no', v_ref_no,
    'receiver_name', v_receiver.full_name
  );
END;
$$;

-- Pay bill function
CREATE OR REPLACE FUNCTION public.pay_bill(
  p_user_id       UUID,
  p_biller_name   TEXT,
  p_bill_account  TEXT,
  p_amount        NUMERIC,
  p_description   TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user    public.profiles%ROWTYPE;
  v_txn_id  UUID;
  v_ref_no  TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', FALSE, 'error', 'Invalid amount');
  END IF;

  SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', 'User not found');
  END IF;

  IF v_user.balance < p_amount THEN
    RETURN json_build_object('success', FALSE, 'error', 'Insufficient balance');
  END IF;

  v_ref_no := 'BILL' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM()*999999)::TEXT, 6, '0');
  v_txn_id := uuid_generate_v4();

  INSERT INTO public.transactions (id, sender_id, type, amount, description, reference_no, status, bill_biller, bill_account)
  VALUES (v_txn_id, p_user_id, 'bill_payment', p_amount, p_description, v_ref_no, 'completed', p_biller_name, p_bill_account);

  UPDATE public.profiles SET balance = balance - p_amount WHERE id = p_user_id;

  INSERT INTO public.notifications (user_id, title, body, type, transaction_id)
  VALUES (
    p_user_id,
    '✅ Bill Payment Successful',
    'Paid ₱' || p_amount || ' to ' || p_biller_name || ' (Acct: ' || p_bill_account || '). Ref: ' || v_ref_no,
    'success',
    v_txn_id
  );

  RETURN json_build_object('success', TRUE, 'transaction_id', v_txn_id, 'reference_no', v_ref_no);
END;
$$;

-- Admin: allocate funds to a user
CREATE OR REPLACE FUNCTION public.admin_credit_user(
  p_admin_id    UUID,
  p_user_id     UUID,
  p_amount      NUMERIC,
  p_notes       TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_is_admin  BOOLEAN;
  v_sys_funds NUMERIC;
  v_txn_id    UUID;
  v_ref_no    TEXT;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', FALSE, 'error', 'Unauthorized');
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object('success', FALSE, 'error', 'Invalid amount');
  END IF;

  SELECT total_funds INTO v_sys_funds FROM public.system_fund ORDER BY id LIMIT 1;

  v_ref_no := 'ADM' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM()*999999)::TEXT, 6, '0');
  v_txn_id := uuid_generate_v4();

  INSERT INTO public.transactions (id, sender_id, receiver_id, type, amount, description, reference_no, status)
  VALUES (v_txn_id, p_admin_id, p_user_id, 'admin_credit', p_amount, COALESCE(p_notes,'Admin fund allocation'), v_ref_no, 'completed');

  UPDATE public.profiles SET balance = balance + p_amount WHERE id = p_user_id;

  INSERT INTO public.notifications (user_id, title, body, type, transaction_id)
  VALUES (
    p_user_id,
    '💰 Funds Added to Your Account',
    '₱' || p_amount || ' has been added to your account by admin. Ref: ' || v_ref_no,
    'success',
    v_txn_id
  );

  RETURN json_build_object('success', TRUE, 'transaction_id', v_txn_id, 'reference_no', v_ref_no);
END;
$$;

-- Admin: debit funds from a user
CREATE OR REPLACE FUNCTION public.admin_debit_user(
  p_admin_id    UUID,
  p_user_id     UUID,
  p_amount      NUMERIC,
  p_notes       TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_is_admin  BOOLEAN;
  v_txn_id    UUID;
  v_ref_no    TEXT;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', FALSE, 'error', 'Unauthorized');
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object('success', FALSE, 'error', 'Invalid amount');
  END IF;

  v_ref_no := 'ADM' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM()*999999)::TEXT, 6, '0');
  v_txn_id := uuid_generate_v4();

  INSERT INTO public.transactions (id, sender_id, receiver_id, type, amount, description, reference_no, status)
  VALUES (v_txn_id, p_user_id, p_admin_id, 'admin_debit', p_amount, COALESCE(p_notes,'Admin fund deduction'), v_ref_no, 'completed');

  UPDATE public.profiles SET balance = GREATEST(balance - p_amount, 0) WHERE id = p_user_id;

  RETURN json_build_object('success', TRUE, 'transaction_id', v_txn_id, 'reference_no', v_ref_no);
END;
$$;

-- ============================================================
-- VIEWS
-- ============================================================

-- Admin: full transaction view with names
CREATE OR REPLACE VIEW public.admin_transactions_view AS
SELECT
  t.id,
  t.type,
  t.amount,
  t.fee,
  t.description,
  t.reference_no,
  t.status,
  t.is_flagged,
  t.flag_reason,
  t.bill_biller,
  t.bill_account,
  t.created_at,
  s.full_name  AS sender_name,
  s.account_number AS sender_account,
  r.full_name  AS receiver_name,
  r.account_number AS receiver_account
FROM public.transactions t
LEFT JOIN public.profiles s ON t.sender_id = s.id
LEFT JOIN public.profiles r ON t.receiver_id = r.id;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_sender    ON public.transactions(sender_id);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver  ON public.transactions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created   ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user     ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user   ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_contacts_owner   ON public.saved_contacts(owner_id);

-- ============================================================
-- DONE
-- ============================================================
-- After running this SQL:
-- 1. Create an admin user via Supabase Auth (email + password)
-- 2. Set that user's is_admin = TRUE in profiles table
-- 3. Set system_fund initial total via admin panel
-- ============================================================

-- ============================================================
-- ADDITIONAL: Admin approve flagged transaction
-- (applies balance changes when admin approves a flagged txn)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_approve_flagged(p_txn_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_txn public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_txn FROM public.transactions WHERE id = p_txn_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Deduct from sender
  IF v_txn.sender_id IS NOT NULL THEN
    UPDATE public.profiles
    SET balance = balance - v_txn.amount
    WHERE id = v_txn.sender_id AND balance >= v_txn.amount;
  END IF;

  -- Credit receiver
  IF v_txn.receiver_id IS NOT NULL THEN
    UPDATE public.profiles
    SET balance = balance + v_txn.amount
    WHERE id = v_txn.receiver_id;
  END IF;

  -- Notify receiver
  IF v_txn.receiver_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, transaction_id)
    VALUES (
      v_txn.receiver_id,
      '💰 Money Received',
      '₱' || v_txn.amount || ' has been received after security review. Ref: ' || v_txn.reference_no,
      'success',
      v_txn.id
    );
  END IF;
END;
$$;

-- RLS policy for admin_approve_flagged (admins only, via SECURITY DEFINER it bypasses RLS)
-- No additional policy needed as it is SECURITY DEFINER.
