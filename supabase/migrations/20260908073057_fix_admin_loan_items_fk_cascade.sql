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
