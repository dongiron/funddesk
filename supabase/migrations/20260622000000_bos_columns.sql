-- Bill of Sale extraction (Slice 3.8.2) adds two nullable text columns.
--   customer_business_name — set when the buyer is a company (e.g. Exponent);
--     the individual name fields still carry the contact person as a proxy.
--   outside_lender_name — a customer-side lien holder named on a CASH bill of
--     sale (e.g. Navy Federal on a dealer-cash deal). Title-work tracking only;
--     does NOT affect payment_method or lender_id.
ALTER TABLE public.deals
  ADD COLUMN customer_business_name TEXT,
  ADD COLUMN outside_lender_name    TEXT;

COMMENT ON COLUMN public.deals.customer_business_name IS
  'Business/company buyer name from the Bill of Sale; null for individual buyers.';
COMMENT ON COLUMN public.deals.outside_lender_name IS
  'Customer-side lien holder named on a cash Bill of Sale (title-work tracking); does not affect payment_method.';
