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
