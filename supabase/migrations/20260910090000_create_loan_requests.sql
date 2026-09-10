/*
# Public Loan Requests (guest, tanpa login)

## Summary
Adds a public flow where anyone (no login) can see available items and submit a
borrow (pinjam) request. Each request gets a human-readable audit code, an admin
is notified, and admins can mark it as prepared / approved / rejected.

## New
- sequence loan_request_seq (for the audit code)
- table loan_requests
- RLS: no direct anon access to the table; access only via SECURITY DEFINER RPCs
- rpc public_available_items()          -> list of available items (aggregated)
- rpc public_create_loan_request(...)   -> create request, returns audit code
- rpc public_loan_request_status(code)  -> lookup a request by code (status/prepared)
- trigger: notify all RND users on new request
*/

-- ============================================================
-- SEQUENCE (for readable audit codes, e.g. LN-20260910-0007)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS loan_request_seq;

-- ============================================================
-- TABLE: loan_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS loan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT (
    'LN-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('loan_request_seq')::text, 4, '0')
  ),
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  item_sku text,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  borrower_name text NOT NULL,
  return_date date,
  status text NOT NULL DEFAULT 'menunggu_approval', -- menunggu_approval | disetujui | ditolak | selesai
  prepared boolean NOT NULL DEFAULT false,           -- indikator: barang sudah disiapkan atau belum
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_requests_code ON loan_requests (code);
CREATE INDEX IF NOT EXISTS idx_loan_requests_status ON loan_requests (status);
CREATE INDEX IF NOT EXISTS idx_loan_requests_created ON loan_requests (created_at DESC);

-- ============================================================
-- RLS: no direct anon access — everything goes through RPCs
-- ============================================================
ALTER TABLE loan_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_select_loan_requests" ON loan_requests;
CREATE POLICY "rnd_select_loan_requests" ON loan_requests
  FOR SELECT TO authenticated USING (get_current_user_role() = 'rnd');

DROP POLICY IF EXISTS "rnd_update_loan_requests" ON loan_requests;
CREATE POLICY "rnd_update_loan_requests" ON loan_requests
  FOR UPDATE TO authenticated
  USING (get_current_user_role() = 'rnd')
  WITH CHECK (get_current_user_role() = 'rnd');

DROP POLICY IF EXISTS "rnd_delete_loan_requests" ON loan_requests;
CREATE POLICY "rnd_delete_loan_requests" ON loan_requests
  FOR DELETE TO authenticated USING (get_current_user_role() = 'rnd');

-- ============================================================
-- updated_at maintenance
-- ============================================================
CREATE OR REPLACE FUNCTION set_loan_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_loan_requests_updated_at ON loan_requests;
CREATE TRIGGER trg_loan_requests_updated_at
  BEFORE UPDATE ON loan_requests
  FOR EACH ROW EXECUTE FUNCTION set_loan_requests_updated_at();

-- ============================================================
-- RPC: list available items (public)
-- ============================================================
CREATE OR REPLACE FUNCTION public_available_items()
RETURNS TABLE (
  item_id uuid, name text, sku text, category text, unit text,
  item_type item_type, available integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.name, i.sku, i.category, i.unit, i.item_type, sum(s.quantity)::int AS available
  FROM items i
  JOIN stock_entries s ON s.item_id = i.id
  WHERE s.status = 'tersedia' AND s.quantity > 0
  GROUP BY i.id, i.name, i.sku, i.category, i.unit, i.item_type
  HAVING sum(s.quantity) > 0
  ORDER BY i.name;
$$;

-- ============================================================
-- RPC: create a loan request (public). Returns the audit code.
-- ============================================================
CREATE OR REPLACE FUNCTION public_create_loan_request(
  p_item_id uuid,
  p_borrower_name text,
  p_return_date date,
  p_quantity integer,
  p_notes text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item items%ROWTYPE;
  v_loc uuid;
  v_code text;
BEGIN
  IF p_borrower_name IS NULL OR length(trim(p_borrower_name)) = 0 THEN
    RAISE EXCEPTION 'Nama peminjam wajib diisi.';
  END IF;

  SELECT * INTO v_item FROM items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang tidak ditemukan.';
  END IF;

  -- Pick the location with the most available stock as the default source.
  SELECT s.location_id INTO v_loc
  FROM stock_entries s
  WHERE s.item_id = p_item_id AND s.status = 'tersedia' AND s.quantity > 0
  ORDER BY s.quantity DESC
  LIMIT 1;

  INSERT INTO loan_requests (item_id, item_name, item_sku, location_id, quantity, borrower_name, return_date, notes)
  VALUES (
    p_item_id, v_item.name, v_item.sku, v_loc,
    greatest(coalesce(p_quantity, 1), 1),
    trim(p_borrower_name), p_return_date,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  RETURNING code INTO v_code;

  RETURN v_code;
END $$;

-- ============================================================
-- RPC: look up a request by its audit code (public)
-- ============================================================
CREATE OR REPLACE FUNCTION public_loan_request_status(p_code text)
RETURNS TABLE (
  code text, item_name text, status text, prepared boolean,
  borrower_name text, return_date date, created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.code, r.item_name, r.status, r.prepared, r.borrower_name, r.return_date, r.created_at
  FROM loan_requests r
  WHERE r.code = upper(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public_available_items() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_create_loan_request(uuid, text, date, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_loan_request_status(text) TO anon, authenticated;

-- ============================================================
-- TRIGGER: notify all active RND users when a request arrives
-- ============================================================
CREATE OR REPLACE FUNCTION notify_rnd_new_loan_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, transaction_id)
  SELECT p.id, 'new_request', 'Pengajuan pinjam baru',
         'Pengajuan ' || NEW.code || ' oleh ' || NEW.borrower_name || ' — ' || NEW.item_name
         || ' (' || NEW.quantity || ' item)',
         NULL
  FROM profiles p
  WHERE p.role = 'rnd' AND p.is_active;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_rnd_new_loan_request ON loan_requests;
CREATE TRIGGER trg_notify_rnd_new_loan_request
  AFTER INSERT ON loan_requests
  FOR EACH ROW EXECUTE FUNCTION notify_rnd_new_loan_request();
