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
