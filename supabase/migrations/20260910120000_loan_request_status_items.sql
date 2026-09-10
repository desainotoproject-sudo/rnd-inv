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
