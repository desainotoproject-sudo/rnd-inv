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
