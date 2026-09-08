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
