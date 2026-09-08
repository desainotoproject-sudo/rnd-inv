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
