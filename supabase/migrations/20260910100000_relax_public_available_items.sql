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
