/*
# Loan requests: multiple items per request

A single public submission can now contain several items, sharing ONE audit
code. Header stays in `loan_requests`; items move to `loan_request_items`.

Changes:
1) new table loan_request_items (+RLS: rnd can read)
2) header item columns become optional (kept for backward compatibility)
3) public_create_loan_request(borrower, return_date, notes, items jsonb)
4) public_loan_request_status -> item summary text
5) notifications are created inside the RPC (all items known) instead of a trigger
*/

-- ============================================================
-- 1) CHILD TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS loan_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id uuid NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  item_sku text,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_request_items_request ON loan_request_items (loan_request_id);

ALTER TABLE loan_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_select_loan_request_items" ON loan_request_items;
CREATE POLICY "rnd_select_loan_request_items" ON loan_request_items
  FOR SELECT TO authenticated USING (get_current_user_role() = 'rnd');

-- ============================================================
-- 2) HEADER COLUMNS BECOME OPTIONAL
-- ============================================================
ALTER TABLE loan_requests ALTER COLUMN item_name DROP NOT NULL;
ALTER TABLE loan_requests ALTER COLUMN quantity DROP NOT NULL;

-- ============================================================
-- 3) CREATE RPC (multi-item). Returns the audit code.
-- ============================================================
DROP FUNCTION IF EXISTS public_create_loan_request(uuid, text, date, integer, text);

CREATE OR REPLACE FUNCTION public_create_loan_request(
  p_borrower_name text,
  p_return_date date,
  p_notes text,
  p_items jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text;
  v_id uuid;
  v_elem jsonb;
  v_item_id uuid;
  v_qty integer;
  v_item items%ROWTYPE;
  v_loc uuid;
  v_summary text;
BEGIN
  IF p_borrower_name IS NULL OR length(trim(p_borrower_name)) = 0 THEN
    RAISE EXCEPTION 'Nama peminjam wajib diisi.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Pilih minimal satu barang.';
  END IF;

  INSERT INTO loan_requests (borrower_name, return_date, notes)
  VALUES (trim(p_borrower_name), p_return_date, nullif(trim(coalesce(p_notes, '')), ''))
  RETURNING id, code INTO v_id, v_code;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_elem->>'item_id')::uuid;
    v_qty := greatest(coalesce((v_elem->>'quantity')::int, 1), 1);

    SELECT * INTO v_item FROM items WHERE id = v_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang tidak ditemukan.';
    END IF;

    SELECT s.location_id INTO v_loc
    FROM stock_entries s
    WHERE s.item_id = v_item_id AND s.quantity > 0
    ORDER BY s.quantity DESC
    LIMIT 1;

    INSERT INTO loan_request_items (loan_request_id, item_id, item_name, item_sku, location_id, quantity)
    VALUES (v_id, v_item_id, v_item.name, v_item.sku, v_loc, v_qty);
  END LOOP;

  SELECT string_agg(li.quantity || 'x ' || li.item_name, ', ')
  INTO v_summary
  FROM loan_request_items li
  WHERE li.loan_request_id = v_id;

  -- Notify all active RND users (items are known now).
  INSERT INTO notifications (user_id, type, title, message, transaction_id)
  SELECT p.id, 'new_request', 'Pengajuan pinjam baru',
         'Pengajuan ' || v_code || ' oleh ' || trim(p_borrower_name) || ' — ' || coalesce(v_summary, ''),
         NULL
  FROM profiles p
  WHERE p.role = 'rnd' AND p.is_active;

  RETURN v_code;
END $$;

GRANT EXECUTE ON FUNCTION public_create_loan_request(text, date, text, jsonb) TO anon, authenticated;

-- ============================================================
-- 4) STATUS RPC -> returns an item summary in `item_name`
-- ============================================================
CREATE OR REPLACE FUNCTION public_loan_request_status(p_code text)
RETURNS TABLE (
  code text, item_name text, status text, prepared boolean,
  borrower_name text, return_date date, created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.code,
         coalesce(
           (SELECT string_agg(li.quantity || 'x ' || li.item_name, ', ')
              FROM loan_request_items li WHERE li.loan_request_id = r.id),
           r.item_name
         ) AS item_name,
         r.status, r.prepared, r.borrower_name, r.return_date, r.created_at
  FROM loan_requests r
  WHERE r.code = upper(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public_loan_request_status(text) TO anon, authenticated;

-- ============================================================
-- 5) DROP the old trigger (notifications now handled in the RPC)
-- ============================================================
DROP TRIGGER IF EXISTS trg_notify_rnd_new_loan_request ON loan_requests;
DROP FUNCTION IF EXISTS notify_rnd_new_loan_request();

NOTIFY pgrst, 'reload schema';
