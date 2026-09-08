/*
# Create admin loans tables for direct RND pinjam/titip transactions

1. New Tables
- `admin_loans` — header record for a direct RND-created borrow/deposit transaction
  - id (uuid PK)
  - borrower_name (text, not null) — name of the person borrowing/depositing (free text, not a user account)
  - type (enum: pinjam | titip)
  - return_date (date, nullable) — expected return date for pinjam
  - notes (text, nullable)
  - status (enum: selesai | aktif) — aktif means item is still out, selesai means returned/retrieved
  - created_by (uuid FK to auth.users) — the RND admin who created it
  - created_at, updated_at (timestamptz)
- `admin_loan_items` — line items for each admin_loan
  - id (uuid PK)
  - admin_loan_id (uuid FK to admin_loans, ON DELETE CASCADE)
  - item_id (uuid FK to items)
  - item_name (text) — snapshot of item name at time of transaction
  - item_type (enum: isi | kosong_box) — snapshot
  - unit (text) — snapshot
  - location_id (uuid FK to locations)
  - quantity (integer, not null)
  - created_at (timestamptz)

2. Security
- Enable RLS on both tables.
- Only RND role can SELECT, INSERT, UPDATE, DELETE (checked via get_current_user_role() SECURITY DEFINER function).
- Guest role has no access to these tables.

3. Important Notes
- On pinjam creation, the frontend will deduct stock from stock_entries.
- On titip creation, the frontend will add/increase stock in stock_entries.
- When a pinjam is marked "selesai" (returned), the frontend will add stock back.
- These stock adjustments happen in the frontend because RND has write access to stock_entries.
*/

CREATE TABLE IF NOT EXISTS admin_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_name text NOT NULL,
  type transaction_type NOT NULL DEFAULT 'pinjam',
  return_date date,
  notes text,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'selesai')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_select_admin_loans" ON admin_loans;
CREATE POLICY "rnd_select_admin_loans" ON admin_loans FOR SELECT
  TO authenticated USING (get_current_user_role() = 'rnd');

DROP POLICY IF EXISTS "rnd_insert_admin_loans" ON admin_loans;
CREATE POLICY "rnd_insert_admin_loans" ON admin_loans FOR INSERT
  TO authenticated WITH CHECK (get_current_user_role() = 'rnd');

DROP POLICY IF EXISTS "rnd_update_admin_loans" ON admin_loans;
CREATE POLICY "rnd_update_admin_loans" ON admin_loans FOR UPDATE
  TO authenticated USING (get_current_user_role() = 'rnd') WITH CHECK (get_current_user_role() = 'rnd');

DROP POLICY IF EXISTS "rnd_delete_admin_loans" ON admin_loans;
CREATE POLICY "rnd_delete_admin_loans" ON admin_loans FOR DELETE
  TO authenticated USING (get_current_user_role() = 'rnd');

CREATE TABLE IF NOT EXISTS admin_loan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_loan_id uuid NOT NULL REFERENCES admin_loans(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  item_name text NOT NULL,
  item_type item_type NOT NULL DEFAULT 'isi',
  unit text NOT NULL DEFAULT 'pcs',
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_loan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_select_admin_loan_items" ON admin_loan_items;
CREATE POLICY "rnd_select_admin_loan_items" ON admin_loan_items FOR SELECT
  TO authenticated USING (get_current_user_role() = 'rnd');

DROP POLICY IF EXISTS "rnd_insert_admin_loan_items" ON admin_loan_items;
CREATE POLICY "rnd_insert_admin_loan_items" ON admin_loan_items FOR INSERT
  TO authenticated WITH CHECK (get_current_user_role() = 'rnd');

DROP POLICY IF EXISTS "rnd_update_admin_loan_items" ON admin_loan_items;
CREATE POLICY "rnd_update_admin_loan_items" ON admin_loan_items FOR UPDATE
  TO authenticated USING (get_current_user_role() = 'rnd') WITH CHECK (get_current_user_role() = 'rnd');

DROP POLICY IF EXISTS "rnd_delete_admin_loan_items" ON admin_loan_items;
CREATE POLICY "rnd_delete_admin_loan_items" ON admin_loan_items FOR DELETE
  TO authenticated USING (get_current_user_role() = 'rnd');

CREATE INDEX IF NOT EXISTS idx_admin_loan_items_loan_id ON admin_loan_items(admin_loan_id);
CREATE INDEX IF NOT EXISTS idx_admin_loans_created_by ON admin_loans(created_by);
