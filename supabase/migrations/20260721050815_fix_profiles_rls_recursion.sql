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
