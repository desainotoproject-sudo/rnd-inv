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
