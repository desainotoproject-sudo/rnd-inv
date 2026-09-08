/*
# RND Inventory — Tahap 2-4: Transactions, Notifications & History

## Summary
Creates the transaction system (pinjam/titip), in-app notifications, and
supporting infrastructure for approval workflow and history tracking.

## New Tables

### 1. transactions
Records every pinjam/titip request by Guest users.
- id (uuid, PK)
- requester_id (uuid, FK to profiles) — who submitted the request
- type (enum: pinjam | titip) — borrow vs deposit
- item_id (uuid, FK to items, nullable) — for existing items (pinjam always has item_id; titip may or may not)
- item_name (text) — snapshot of item name at time of request (for titip of new items)
- item_type (enum: isi | kosong_box) — snapshot of item type
- unit (text) — snapshot of unit
- location_id (uuid, FK to locations) — source location (pinjam) or destination (titip)
- quantity (integer, > 0)
- status (enum: menunggu_approval | disetujui | ditolak) — transaction lifecycle
- rejection_reason (text, nullable) — required when status = ditolak
- reviewer_id (uuid, FK to profiles, nullable) — RND member who approved/rejected
- reviewed_at (timestamptz, nullable) — when decision was made
- notes (text, nullable) — optional notes from requester
- created_at, updated_at

### 2. notifications
In-app notifications for status changes and new requests.
- id (uuid, PK)
- user_id (uuid, FK to profiles) — recipient
- type (enum: new_request | approved | rejected | request_created)
- title (text)
- message (text)
- transaction_id (uuid, FK to transactions, nullable) — related transaction
- is_read (boolean, default false)
- created_at

## Security (RLS)
- transactions: Guest can SELECT/INSERT own; RND can SELECT all + UPDATE status (approve/reject)
- notifications: users can SELECT/UPDATE (mark read) their own notifications only
- Uses get_current_user_role() helper from previous migration
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('pinjam', 'titip');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('menunggu_approval', 'disetujui', 'ditolak');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('new_request', 'approved', 'rejected', 'request_created');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  item_type item_type NOT NULL DEFAULT 'isi',
  unit text NOT NULL DEFAULT 'pcs',
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  status transaction_status NOT NULL DEFAULT 'menunggu_approval',
  rejection_reason text,
  reviewer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Guest: can see their own transactions
DROP POLICY IF EXISTS "select_own_transactions" ON transactions;
CREATE POLICY "select_own_transactions" ON transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id);

-- RND: can see all transactions
DROP POLICY IF EXISTS "rnd_select_all_transactions" ON transactions;
CREATE POLICY "rnd_select_all_transactions" ON transactions
  FOR SELECT TO authenticated
  USING (get_current_user_role() = 'rnd');

-- Guest: can create transactions for themselves
DROP POLICY IF EXISTS "insert_own_transactions" ON transactions;
CREATE POLICY "insert_own_transactions" ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);

-- RND: can update transaction status (approve/reject)
DROP POLICY IF EXISTS "rnd_update_transactions" ON transactions;
CREATE POLICY "rnd_update_transactions" ON transactions
  FOR UPDATE TO authenticated
  USING (get_current_user_role() = 'rnd')
  WITH CHECK (get_current_user_role() = 'rnd');

-- ============================================================
-- TABLE: notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can see their own notifications
DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can mark their own notifications as read
DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can insert their own notifications (for self-notifications)
DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_transactions_requester_id ON transactions(requester_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================
-- TRIGGER: auto-update updated_at on transactions
-- ============================================================

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
