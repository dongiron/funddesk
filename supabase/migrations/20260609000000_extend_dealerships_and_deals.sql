-- ============================================================
-- Migration: 20260609000000_extend_dealerships_and_deals
-- ============================================================
-- Extends dealerships with signing configuration.
-- Extends deals with pipeline state, vehicle info, financial
-- info, key dates, physical contract tracking, stip tracking,
-- and trade-in fields.
-- RLS: no policy changes — new columns inherit existing policies.
-- ============================================================


-- ============================================================
-- dealerships — signing configuration
-- ============================================================

ALTER TABLE public.dealerships
  ADD COLUMN signing_method  TEXT NOT NULL DEFAULT 'esign'
    CHECK (signing_method IN ('esign', 'paper', 'mixed')),
  ADD COLUMN esign_platform  TEXT
    CHECK (esign_platform IN ('taptosign', 'routeone', 'dealercenter', 'other'));

COMMENT ON COLUMN public.dealerships.signing_method IS
  'Dealership-level signing method. esign = always electronic, paper = always physical contract, mixed = both methods used. Configured at onboarding, not per-deal.';

COMMENT ON COLUMN public.dealerships.esign_platform IS
  'E-sign vendor in use. Only relevant when signing_method is esign or mixed. Nullable for paper-only dealerships.';


-- ============================================================
-- deals — pipeline state
-- ============================================================
-- State transitions are enforced by the application, not the DB.
-- The DB constrains the valid set of values only.
--
-- waiting_for_scan         — paper/mixed deals only: physical docs not yet scanned
-- awaiting_physical_delivery — physical_contract_required deals only: contract in mail
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN pipeline_state TEXT NOT NULL DEFAULT 'signed'
    CHECK (pipeline_state IN (
      'signed',
      'waiting_for_scan',
      'gathering_paperwork',
      'gathering_stips',
      'ready_to_send',
      'submitted',
      'awaiting_physical_delivery',
      'waiting_to_fund',
      'funds_in_transit',
      'funded',
      'unwound'
    ));

COMMENT ON COLUMN public.deals.pipeline_state IS
  'Current stage of the deal in the funding pipeline. waiting_for_scan applies to paper/mixed deals only. awaiting_physical_delivery applies when physical_contract_required is true. Application enforces valid transitions; DB enforces valid values.';


-- ============================================================
-- deals — vehicle info
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN vehicle_year   INTEGER,
  ADD COLUMN vehicle_make   TEXT,
  ADD COLUMN vehicle_model  TEXT,
  ADD COLUMN vehicle_vin    TEXT,
  ADD COLUMN stock_number   TEXT;


-- ============================================================
-- deals — financial info
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN amount_financed  NUMERIC(12,2),
  ADD COLUMN term_months      INTEGER,
  ADD COLUMN apr              NUMERIC(7,4),
  ADD COLUMN monthly_payment  NUMERIC(12,2),
  ADD COLUMN front_gross      NUMERIC(12,2),
  ADD COLUMN back_gross       NUMERIC(12,2),
  ADD COLUMN pack             NUMERIC(12,2),
  ADD COLUMN reserve          NUMERIC(12,2);

COMMENT ON COLUMN public.deals.apr IS
  'Annual percentage rate stored as decimal. e.g. 7.99% stored as 7.9900.';

COMMENT ON COLUMN public.deals.front_gross IS
  'Gross profit on the vehicle sale before F&I products.';

COMMENT ON COLUMN public.deals.back_gross IS
  'Gross profit from F&I products (warranty, GAP, etc.).';

COMMENT ON COLUMN public.deals.pack IS
  'Dealer pack amount deducted from front gross.';

COMMENT ON COLUMN public.deals.reserve IS
  'Finance reserve earned from the lender on the rate spread.';


-- ============================================================
-- deals — key dates
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN sold_date                     DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN submitted_to_lender_date      DATE,
  ADD COLUMN funded_date                   DATE,
  ADD COLUMN physical_contract_mailed_date DATE,
  ADD CONSTRAINT funded_after_sold CHECK (funded_date IS NULL OR funded_date >= sold_date),
  ADD CONSTRAINT submitted_after_sold CHECK (submitted_to_lender_date IS NULL OR submitted_to_lender_date >= sold_date);

COMMENT ON COLUMN public.deals.sold_date IS
  'Date the customer signed the deal. Defaults to today; adjust if backdating.';

COMMENT ON COLUMN public.deals.physical_contract_mailed_date IS
  'Date physical contract package was mailed to the lender. Null until mailed.';


-- ============================================================
-- deals — physical contract tracking
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN physical_contract_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.deals.physical_contract_required IS
  'True when this lender requires a wet-ink contract mailed in. When true, the application can advance the deal into the awaiting_physical_delivery pipeline state after submission.';


-- ============================================================
-- deals — stip tracking (lightweight JSONB, normalized later)
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN stips_required JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN stips_received JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT stips_required_is_array CHECK (jsonb_typeof(stips_required) = 'array'),
  ADD CONSTRAINT stips_received_is_array CHECK (jsonb_typeof(stips_received) = 'array');

COMMENT ON COLUMN public.deals.stips_required IS
  'Array of stip type strings required by the lender. e.g. ["paystub","proof_of_residence","insurance"]. Normalized to a proper table in a future migration once stip workflows are fully designed.';

COMMENT ON COLUMN public.deals.stips_received IS
  'Array of stip type strings received from the customer. Subset of stips_required when complete.';


-- ============================================================
-- deals — trade-in fields
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN has_trade               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN trade_year              INTEGER,
  ADD COLUMN trade_make              TEXT,
  ADD COLUMN trade_model             TEXT,
  ADD COLUMN trade_vin               TEXT,
  ADD COLUMN trade_acv               NUMERIC(12,2),
  ADD COLUMN trade_allowance         NUMERIC(12,2),
  ADD COLUMN trade_payoff_quoted     NUMERIC(12,2),
  ADD COLUMN trade_payoff_lender     TEXT,
  ADD COLUMN trade_payoff_sent_date  DATE,
  ADD COLUMN trade_payoff_received_date DATE,
  ADD COLUMN trade_title_received_date  DATE;

COMMENT ON COLUMN public.deals.has_trade IS
  'True when the customer is trading in a vehicle. Trade columns are null when false.';

COMMENT ON COLUMN public.deals.trade_acv IS
  'Actual cash value — what the trade is worth in the market.';

COMMENT ON COLUMN public.deals.trade_allowance IS
  'Amount given to the customer for the trade. May differ from ACV.';

COMMENT ON COLUMN public.deals.trade_payoff_quoted IS
  'Payoff amount quoted by the customer''s lender at time of deal.';

COMMENT ON COLUMN public.deals.trade_payoff_lender IS
  'Name of the institution holding the lien on the trade-in.';


-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX ON public.deals (pipeline_state);
CREATE INDEX ON public.deals (submitted_to_lender_date);
CREATE INDEX ON public.deals (funded_date);
CREATE INDEX ON public.deals (physical_contract_mailed_date);
