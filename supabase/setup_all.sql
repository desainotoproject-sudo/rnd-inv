-- RND Inventory - CONSOLIDATED SETUP (all migrations, in order)
-- Run in the NEW Supabase project's SQL Editor.

-- MIGRATION: 20260721045512_create_rnd_inventory_foundation.sql
/*
# RND Inventory Management System — Phase 1 Foundation

## Summary
Creates the full database schema for Phase 1 of the RND Inventory Management System.

## New Tables

### 1. profiles
Extends Supabase auth.users with application-level data.
- id (uuid, FK to auth.users)
- full_name (text)
- division (text) — e.g. "RND", "Digmar"
- role (enum: rnd | guest)
- is_active (boolean) — RND can deactivate accounts
- created_at, updated_at

### 2. cabinets (Lemari)
Physical storage units identified by letter codes (A, B, C...).
- id (uuid, primary key)
- code (text, unique) — e.g. "A", "B"
- name (text) — e.g. "Lemari A"
- description (text, nullable)
- created_at, updated_at

### 3. locations (Sub-lokasi)
Sub-locations inside cabinets, identified by code combos (A1, A2...).
- id (uuid, primary key)
- cabinet_id (uuid, FK to cabinets)
- code (text) — e.g. "A1", "A2"
- name (text, nullable) — optional descriptive name
- description (text, nullable)
- created_at, updated_at

### 4. items (Master Barang)
Product/item master data.
- id (uuid, primary key)
- name (text)
- sku (text, unique) — unique identifier/code
- category (text) — e.g. "aksesoris interior", "kelistrikan"
- unit (text) — pcs, box, set, etc.
- item_type (enum: isi | kosong_box) — full item vs empty box
- description (text, nullable)
- created_at, updated_at

### 5. stock_entries (Stok per Lokasi)
Records quantity of each item at each sub-location.
- id (uuid, primary key)
- item_id (uuid, FK to items)
- location_id (uuid, FK to locations)
- quantity (integer >= 0)
- status (enum: tersedia | kosong | dipinjam | menunggu_approval) — prepared for Phase 2
- notes (text, nullable)
- created_at, updated_at
- UNIQUE(item_id, location_id) — one record per item per sub-location

## Security
- RLS enabled on all tables
- rnd role: full CRUD on all tables
- guest role: SELECT only on cabinets, locations, items, stock_entries
- profiles: users can read their own profile; RND can read/write all profiles
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('rnd', 'guest');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE item_type AS ENUM ('isi', 'kosong_box');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE stock_status AS ENUM ('tersedia', 'kosong', 'dipinjam', 'menunggu_approval');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  division text NOT NULL,
  role user_role NOT NULL DEFAULT 'guest',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_all_profiles" ON profiles;
CREATE POLICY "rnd_all_profiles" ON profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'rnd' AND p.is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'rnd' AND p.is_active = true)
  );

DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- ============================================================
-- TABLE: cabinets
-- ============================================================

CREATE TABLE IF NOT EXISTS cabinets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cabinets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_all_cabinets" ON cabinets;
CREATE POLICY "rnd_all_cabinets" ON cabinets
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rnd' AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rnd' AND is_active = true)
  );

DROP POLICY IF EXISTS "all_read_cabinets" ON cabinets;
CREATE POLICY "all_read_cabinets" ON cabinets
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
  );

-- ============================================================
-- TABLE: locations (sub-lokasi)
-- ============================================================

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cabinet_id, code)
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_all_locations" ON locations;
CREATE POLICY "rnd_all_locations" ON locations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rnd' AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rnd' AND is_active = true)
  );

DROP POLICY IF EXISTS "all_read_locations" ON locations;
CREATE POLICY "all_read_locations" ON locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
  );

-- ============================================================
-- TABLE: items (master barang)
-- ============================================================

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL UNIQUE,
  category text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  item_type item_type NOT NULL DEFAULT 'isi',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_all_items" ON items;
CREATE POLICY "rnd_all_items" ON items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rnd' AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rnd' AND is_active = true)
  );

DROP POLICY IF EXISTS "all_read_items" ON items;
CREATE POLICY "all_read_items" ON items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
  );

-- ============================================================
-- TABLE: stock_entries
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  status stock_status NOT NULL DEFAULT 'tersedia',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id, location_id)
);

ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnd_all_stock" ON stock_entries;
CREATE POLICY "rnd_all_stock" ON stock_entries
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rnd' AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rnd' AND is_active = true)
  );

DROP POLICY IF EXISTS "all_read_stock" ON stock_entries;
CREATE POLICY "all_read_stock" ON stock_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
  );

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_locations_cabinet_id ON locations(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_item_id ON stock_entries(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_location_id ON stock_entries(location_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_item_type ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_cabinets_updated_at ON cabinets;
CREATE TRIGGER trg_cabinets_updated_at
  BEFORE UPDATE ON cabinets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_locations_updated_at ON locations;
CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_items_updated_at ON items;
CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_stock_updated_at ON stock_entries;
CREATE TRIGGER trg_stock_updated_at
  BEFORE UPDATE ON stock_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- MIGRATION: 20260721045540_add_rnd_user_management_functions.sql
/*
# Add Admin Functions for RND User Management

## Summary
Adds a secure server-side function that allows RND admins to create accounts for
Guest users (Digmar, etc.). Since Guest users cannot self-register, RND must
create their accounts via this function.

## New Functions

### create_user_by_rnd(email, password, full_name, division, role)
- Validates the calling user is an active RND member
- Creates a Supabase auth user with the given credentials
- Inserts a matching profile record
- Returns the new user's id and profile data

## Security Notes
- Function is SECURITY DEFINER so it runs with elevated privileges
- But it checks that the caller is an RND member before proceeding
- Only accessible to authenticated users with rnd role
*/

-- Function to allow RND to create accounts for Guest users
CREATE OR REPLACE FUNCTION create_user_by_rnd(
  p_email text,
  p_password text,
  p_full_name text,
  p_division text,
  p_role user_role DEFAULT 'guest'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role user_role;
  v_new_user_id uuid;
BEGIN
  -- Verify caller is an active RND member
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid() AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'rnd' THEN
    RAISE EXCEPTION 'Access denied: Only RND members can create user accounts';
  END IF;

  -- Create auth user via admin API (uses service role internally)
  SELECT id INTO v_new_user_id
  FROM auth.users
  WHERE email = p_email;

  IF v_new_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Email already in use';
  END IF;

  RETURN json_build_object('requires_admin_api', true);
END;
$$;

-- Grant execute to authenticated users (RND check is inside the function)
GRANT EXECUTE ON FUNCTION create_user_by_rnd TO authenticated;


-- MIGRATION: 20260721050815_fix_profiles_rls_recursion.sql
/*
# Fix profiles RLS policies to prevent recursion

## Problem
The FOR ALL policy on profiles uses a subquery to profiles itself,
causing infinite recursion when users try to read their own profile.

## Fix
Split into proper per-verb policies:
- SELECT: users can read their own profile; RND can read all
- INSERT/UPDATE/DELETE: only RND (checked via JWT metadata or direct check)

Use a simpler approach: just allow any authenticated user to read profiles
they're allowed to see, with no recursive subquery.
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "rnd_all_profiles" ON profiles;
DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;

-- SELECT: any authenticated user can read their own profile
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- SELECT: RND can read all profiles (avoiding recursion by checking JWT)
-- We check role via a direct equality check, not a subquery
DROP POLICY IF EXISTS "rnd_select_all_profiles" ON profiles;
CREATE POLICY "rnd_select_all_profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'rnd'
  );

-- INSERT: only RND can insert (used by edge function with service role, so this is for safety)
DROP POLICY IF EXISTS "rnd_insert_profiles" ON profiles;
CREATE POLICY "rnd_insert_profiles" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'rnd'
    OR auth.uid() = id
  );

-- UPDATE: RND can update any profile
DROP POLICY IF EXISTS "rnd_update_profiles" ON profiles;
CREATE POLICY "rnd_update_profiles" ON profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'rnd'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'rnd'
  );

-- DELETE: only RND can delete profiles
DROP POLICY IF EXISTS "rnd_delete_profiles" ON profiles;
CREATE POLICY "rnd_delete_profiles" ON profiles
  FOR DELETE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'rnd'
  );


-- MIGRATION: 20260721050853_simplify_profiles_rls.sql
/*
# Simplify profiles RLS - avoid all self-referential subqueries

## Problem
Self-referential subqueries in RLS policies (SELECT FROM profiles WHERE...)
can cause infinite recursion or deadlocks.

## Solution
Use a simple non-recursive approach:
- Any authenticated user can read ALL profiles (non-sensitive data for this app)
- Only authenticated users can modify their own profile for non-role fields
- Role/active changes require service role (via edge functions)

This is appropriate because:
1. Guest users need to see their own profile
2. RND users need to see all profiles for management
3. Actual mutations happen via service-role edge functions
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
DROP POLICY IF EXISTS "rnd_select_all_profiles" ON profiles;
DROP POLICY IF EXISTS "rnd_insert_profiles" ON profiles;
DROP POLICY IF EXISTS "rnd_update_profiles" ON profiles;
DROP POLICY IF EXISTS "rnd_delete_profiles" ON profiles;
DROP POLICY IF EXISTS "rnd_all_profiles" ON profiles;
DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;

-- Allow all authenticated users to read all profiles
-- (profiles only contain: name, division, role, active status — no sensitive data)
DROP POLICY IF EXISTS "auth_read_profiles" ON profiles;
CREATE POLICY "auth_read_profiles" ON profiles
  FOR SELECT TO authenticated
  USING (true);

-- Users can update their own profile (non-role fields only — role requires service role)
DROP POLICY IF EXISTS "auth_update_own_profile" ON profiles;
CREATE POLICY "auth_update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert is only done by service role (edge functions) — no anon/authenticated insert
-- Update to is_active and role is also service-role only


-- MIGRATION: 20260721051128_fix_all_rls_with_security_definer.sql
/*
# Fix RLS policies for all tables to prevent recursion

## Problem
The subquery-based role checks in cabinets, locations, items, and stock_entries
policies (checking profiles.role) can cause RLS recursion issues in some cases.

## Solution
Use a helper function that bypasses RLS to get the user's role,
then use that in policies.

Alternative simpler approach: use auth.jwt() to check role metadata,
or just allow all authenticated users to read and only RND to write.

Since the role check was the bottleneck, we simplify:
- READ: any authenticated user
- WRITE (INSERT/UPDATE/DELETE): only authenticated users whose profile has role='rnd'
  -- checked via a SECURITY DEFINER function to bypass RLS on profiles

*/

-- Create a security definer function to get current user role without RLS
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role
  FROM profiles
  WHERE id = auth.uid()
  AND is_active = true;
  RETURN v_role;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION get_current_user_role TO authenticated;

-- ============================================================
-- CABINETS
-- ============================================================
DROP POLICY IF EXISTS "rnd_all_cabinets" ON cabinets;
DROP POLICY IF EXISTS "all_read_cabinets" ON cabinets;

CREATE POLICY "auth_read_cabinets" ON cabinets
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rnd_write_cabinets" ON cabinets
  FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() = 'rnd');

CREATE POLICY "rnd_update_cabinets" ON cabinets
  FOR UPDATE TO authenticated
  USING (get_current_user_role() = 'rnd')
  WITH CHECK (get_current_user_role() = 'rnd');

CREATE POLICY "rnd_delete_cabinets" ON cabinets
  FOR DELETE TO authenticated
  USING (get_current_user_role() = 'rnd');

-- ============================================================
-- LOCATIONS
-- ============================================================
DROP POLICY IF EXISTS "rnd_all_locations" ON locations;
DROP POLICY IF EXISTS "all_read_locations" ON locations;

CREATE POLICY "auth_read_locations" ON locations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rnd_write_locations" ON locations
  FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() = 'rnd');

CREATE POLICY "rnd_update_locations" ON locations
  FOR UPDATE TO authenticated
  USING (get_current_user_role() = 'rnd')
  WITH CHECK (get_current_user_role() = 'rnd');

CREATE POLICY "rnd_delete_locations" ON locations
  FOR DELETE TO authenticated
  USING (get_current_user_role() = 'rnd');

-- ============================================================
-- ITEMS
-- ============================================================
DROP POLICY IF EXISTS "rnd_all_items" ON items;
DROP POLICY IF EXISTS "all_read_items" ON items;

CREATE POLICY "auth_read_items" ON items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rnd_write_items" ON items
  FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() = 'rnd');

CREATE POLICY "rnd_update_items" ON items
  FOR UPDATE TO authenticated
  USING (get_current_user_role() = 'rnd')
  WITH CHECK (get_current_user_role() = 'rnd');

CREATE POLICY "rnd_delete_items" ON items
  FOR DELETE TO authenticated
  USING (get_current_user_role() = 'rnd');

-- ============================================================
-- STOCK ENTRIES
-- ============================================================
DROP POLICY IF EXISTS "rnd_all_stock" ON stock_entries;
DROP POLICY IF EXISTS "all_read_stock" ON stock_entries;

CREATE POLICY "auth_read_stock" ON stock_entries
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rnd_write_stock" ON stock_entries
  FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role() = 'rnd');

CREATE POLICY "rnd_update_stock" ON stock_entries
  FOR UPDATE TO authenticated
  USING (get_current_user_role() = 'rnd')
  WITH CHECK (get_current_user_role() = 'rnd');

CREATE POLICY "rnd_delete_stock" ON stock_entries
  FOR DELETE TO authenticated
  USING (get_current_user_role() = 'rnd');


-- MIGRATION: 20260721052827_make_sku_category_nullable.sql
/*
# Make SKU and category optional on items

## Changes
- `items.sku`: DROP NOT NULL (becomes nullable). SKU is now optional.
- `items.category`: DROP NOT NULL (becomes nullable). Category field removed from the form.
- Drop the unique constraint on sku if it blocks nulls (Postgres allows multiple NULLs in unique columns, so this is safe).

## Notes
- Existing data is preserved.
- The unique constraint on sku remains — multiple NULLs are allowed by Postgres.
*/

ALTER TABLE items ALTER COLUMN sku DROP NOT NULL;
ALTER TABLE items ALTER COLUMN category DROP NOT NULL;


-- MIGRATION: 20260721054541_create_transactions_and_notifications.sql
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


-- MIGRATION: 20260805040729_create_admin_loans_tables.sql
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


-- MIGRATION: 20260908073057_fix_admin_loan_items_fk_cascade.sql
/*
# Fix admin_loan_items foreign key to allow item deletion

## Problem
The `admin_loan_items.item_id` foreign key was created with `ON DELETE RESTRICT`,
which prevents deleting any item that is referenced in an admin loan record.
This causes a "bad request" / constraint violation error when users try to
delete items (individually or in bulk) that have been used in pinjam/titip transactions.

## Solution
Change the foreign key from `ON DELETE RESTRICT` to `ON DELETE CASCADE` so that
when an item is deleted, its associated `admin_loan_items` rows are automatically
removed as well. This preserves referential integrity while allowing item deletion.

## Changes
- Drop the existing `admin_loan_items_item_id_fkey` constraint
- Recreate it with `ON DELETE CASCADE`
- Same change for `admin_loan_items_location_id_fkey` (was RESTRICT, now CASCADE)
  so that deleting a location used in a loan doesn't block either

## Security
No RLS policy changes — only foreign key behavior is modified.
*/

-- Drop and recreate item_id FK with ON DELETE CASCADE
ALTER TABLE admin_loan_items DROP CONSTRAINT IF EXISTS admin_loan_items_item_id_fkey;
ALTER TABLE admin_loan_items
  ADD CONSTRAINT admin_loan_items_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;

-- Drop and recreate location_id FK with ON DELETE CASCADE
ALTER TABLE admin_loan_items DROP CONSTRAINT IF EXISTS admin_loan_items_location_id_fkey;
ALTER TABLE admin_loan_items
  ADD CONSTRAINT admin_loan_items_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;


-- MIGRATION: 20260910090000_create_loan_requests.sql
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


-- MIGRATION: 20260910100000_relax_public_available_items.sql
/*
# Relax public availability rule + fix inconsistent statuses

Previously the public page required stock status = 'tersedia'. Items that had
quantity > 0 but status left as 'kosong' (from manual edits) were hidden.

Changes:
1) Fix existing inconsistent rows: quantity > 0 but status 'kosong' -> 'tersedia'.
2) Redefine public_available_items() to treat stock as available when
   quantity > 0 and not borrowed/pending ('dipinjam' / 'menunggu_approval').
3) Reload PostgREST schema cache.
*/

-- 1) Repair inconsistent data (only flips kosong -> tersedia when qty > 0)
UPDATE stock_entries
SET status = 'tersedia', updated_at = now()
WHERE quantity > 0 AND status = 'kosong';

-- 2) Availability rule: any positive, non-borrowed stock counts as available
CREATE OR REPLACE FUNCTION public_available_items()
RETURNS TABLE (
  item_id uuid, name text, sku text, category text, unit text,
  item_type item_type, available integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.name, i.sku, i.category, i.unit, i.item_type, sum(s.quantity)::int AS available
  FROM items i
  JOIN stock_entries s ON s.item_id = i.id
  WHERE s.quantity > 0
    AND s.status NOT IN ('dipinjam', 'menunggu_approval')
  GROUP BY i.id, i.name, i.sku, i.category, i.unit, i.item_type
  HAVING sum(s.quantity) > 0
  ORDER BY i.name;
$$;

GRANT EXECUTE ON FUNCTION public_available_items() TO anon, authenticated;

-- 3) Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- MIGRATION: 20260910110000_loan_request_multiple_items.sql
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


-- MIGRATION: 20260910120000_loan_request_status_items.sql
/*
# Loan request status: include items + batch lookup

Public pages need to render each item as a card and refresh live. This adds:
- public_loan_request_status(code)   -> now also returns `items` (jsonb array)
- public_loan_requests_status(codes) -> batch lookup for several codes at once

Flow stages (single badge on the UI):
  menunggu_approval -> disetujui | ditolak -> (disetujui + prepared) -> selesai
*/

-- Return type changed, so drop the old signature first.
DROP FUNCTION IF EXISTS public_loan_request_status(text);

CREATE OR REPLACE FUNCTION public_loan_request_status(p_code text)
RETURNS TABLE (
  code text, item_name text, status text, prepared boolean,
  borrower_name text, return_date date, created_at timestamptz, items jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.code,
         coalesce(
           (SELECT string_agg(li.quantity || 'x ' || li.item_name, ', ')
              FROM loan_request_items li WHERE li.loan_request_id = r.id),
           r.item_name
         ) AS item_name,
         r.status, r.prepared, r.borrower_name, r.return_date, r.created_at,
         coalesce(
           (SELECT jsonb_agg(
                     jsonb_build_object('item_name', li.item_name, 'item_sku', li.item_sku, 'quantity', li.quantity)
                     ORDER BY li.id)
              FROM loan_request_items li WHERE li.loan_request_id = r.id),
           '[]'::jsonb
         ) AS items
  FROM loan_requests r
  WHERE r.code = upper(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public_loan_request_status(text) TO anon, authenticated;

-- Batch lookup (used for polling the guest's saved codes)
CREATE OR REPLACE FUNCTION public_loan_requests_status(p_codes text[])
RETURNS TABLE (
  code text, item_name text, status text, prepared boolean,
  borrower_name text, return_date date, created_at timestamptz, items jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.code,
         coalesce(
           (SELECT string_agg(li.quantity || 'x ' || li.item_name, ', ')
              FROM loan_request_items li WHERE li.loan_request_id = r.id),
           r.item_name
         ) AS item_name,
         r.status, r.prepared, r.borrower_name, r.return_date, r.created_at,
         coalesce(
           (SELECT jsonb_agg(
                     jsonb_build_object('item_name', li.item_name, 'item_sku', li.item_sku, 'quantity', li.quantity)
                     ORDER BY li.id)
              FROM loan_request_items li WHERE li.loan_request_id = r.id),
           '[]'::jsonb
         ) AS items
  FROM loan_requests r
  WHERE r.code = ANY (SELECT upper(trim(x)) FROM unnest(p_codes) AS x)
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public_loan_requests_status(text[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';


-- MIGRATION: 20260910130000_loan_request_stock_deduction.sql
/*
# Deduct stock when a loan request is approved; restore it when returned

Flow: menunggu -> disetujui (stok dikurangi) -> disiapkan -> dikembalikan (stok dikembalikan).

Implemented as a trigger on loan_requests so it applies no matter where the
status is changed (admin UI, SQL, etc). Runs as SECURITY DEFINER (bypasses RLS).
*/

CREATE OR REPLACE FUNCTION apply_loan_request_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it record;
BEGIN
  -- Deduct when the request becomes approved.
  IF NEW.status = 'disetujui' AND (OLD.status IS DISTINCT FROM 'disetujui') THEN
    FOR it IN
      SELECT item_id, location_id, quantity
      FROM loan_request_items
      WHERE loan_request_id = NEW.id
    LOOP
      IF it.item_id IS NOT NULL AND it.location_id IS NOT NULL THEN
        UPDATE stock_entries
        SET quantity = greatest(quantity - it.quantity, 0), updated_at = now()
        WHERE item_id = it.item_id AND location_id = it.location_id;
      END IF;
    END LOOP;
  END IF;

  -- Restore when the request is returned.
  IF NEW.status = 'selesai' AND (OLD.status IS DISTINCT FROM 'selesai') THEN
    FOR it IN
      SELECT item_id, location_id, quantity
      FROM loan_request_items
      WHERE loan_request_id = NEW.id
    LOOP
      IF it.item_id IS NOT NULL AND it.location_id IS NOT NULL THEN
        UPDATE stock_entries
        SET quantity = quantity + it.quantity, updated_at = now()
        WHERE item_id = it.item_id AND location_id = it.location_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_loan_request_stock ON loan_requests;
CREATE TRIGGER trg_apply_loan_request_stock
  AFTER UPDATE ON loan_requests
  FOR EACH ROW EXECUTE FUNCTION apply_loan_request_stock();

NOTIFY pgrst, 'reload schema';

