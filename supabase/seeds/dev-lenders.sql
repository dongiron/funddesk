-- ============================================================
-- FundDesk — Dev Lender Seed
-- ============================================================
-- Source:        docs/lender-research-2026-06.md (operator research, canonical)
-- Target env:    funddesk-dev ONLY. DO NOT RUN ON PROD.
-- Placeholder:   Replace every <YOUR_DEALERSHIP_ID> with the real
--                dealerships.id UUID before running.
-- How to run:    Replace the placeholder, then paste this entire
--                file into the Supabase SQL editor for funddesk-dev
--                and execute. All 14 inserts run in one transaction.
--
-- DO NOT auto-run. Review before executing.
-- ============================================================
--
-- MAPPING RULES APPLIED (so the seed can be audited against the doc):
--   * Only columns with clear support in the research are set.
--     Unstated fields are OMITTED so the schema default applies.
--   * typical_days_clean = LOW end of the stated normal funding
--     range (e.g. "4-5 days" -> 4; "same/next day" -> 1). The high
--     end and prose are preserved verbatim in operator_notes.
--   * typical_days_blocked_max = a stated max only when a concrete
--     number exists (Hughes "10-12" -> 12). "Can take weeks" is
--     left NULL (= indeterminate, per the column comment).
--   * days_to_bank_after_funding is set whenever the doc states the
--     bank-arrival timing, even when that equals the default of 1
--     (it is operator-confirmed, not assumed).
--   * common_required_stips uses snake_case JSON arrays.
--     commonly_ghosted_stips is OMITTED for every lender — the
--     research never states which stips customers delay returning.
--   * operator_notes contains each lender's research bullets
--     VERBATIM (no rewording), for in-app reference.
--
-- OPEN QUESTIONS / THINGS TO VERIFY (see report for detail):
--   1. [RESOLVED] Credit Acceptance Corp.: the "lender fee increase"
--      bullet in the doc sits under Credit Acceptance but its content
--      references Westlake's Dealercenter. can_increase_lender_fee is
--      TRUE for Westlake; operator confirmed it is ALSO TRUE for
--      Credit Acceptance (fees increase on deal-structure changes).
--   2. accepts_esign defaults TRUE. For the credit unions where the
--      doc is silent on e-sign, this seed leaves the default (true)
--      in place — i.e. "assumed", not "confirmed". Verify per CU.
--   3. [RESOLVED] Credit Union Of Colorado: platform not explicitly
--      named in the doc (uses CUDL-style "Fund delay" wording).
--      Operator confirmed CUDL; communication_platform = 'CUDL'.
--   4. Hughes: "membership documents require wet signature" has no
--      structured column (it is about membership docs, not the
--      retail contract), so requires_physical_contract was NOT set.
--      Captured in operator_notes only.
--   5. United Auto Credit: "Does not accept RouteOne E-sign" ->
--      accepts_esign = FALSE. Physical (FedEx) is an option but
--      FastLane e-sign also exists, so requires_physical_contract
--      was NOT set. Confirm.
-- ============================================================

BEGIN;

-- 1. America First Federal Credit Union
--    set: typical_days_clean, days_to_bank_after_funding,
--         communication_platform, common_required_stips, operator_notes
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   communication_platform, common_required_stips, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'America First Federal Credit Union',
  4,
  1,
  'CUDL',
  '["proof_of_income"]'::jsonb,
  'Can take up to 4-5 days to fund. Sometimes next business day funding.
Funding speed goes in waves. Alternates between slow and fast, average is around 4 days.
Usually clears Proof of Income stip same day it was uploaded.
All funding contact is within CUDL
After 4-5 days reach out to the funding team on CUDL or reach out to area rep.
Sends a “fund delay” on application from CUDL platform. Funder leaves a comment for the reason. Missing signature, incorrect docs, missing docs, etc..
Funds in bank next business day'
);

-- 2. Credit Union Of Colorado
--    set: typical_days_clean, clears_stips_upfront, operator_notes
--    (communication_platform omitted — not explicitly named; see open Q3)
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, clears_stips_upfront, communication_platform, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Credit Union Of Colorado',
  4,
  true,
  'CUDL',
  'If limited term DL, need permanent resident card
Funding time around 4-5 days. If no message from Funding rep after 3 days ok to send message for updates on funding
Clears stips upfront
Sends “Fund delay” if there is any issue'
);

-- 3. Hughes Federal Credit Union
--    set: typical_days_clean, typical_days_blocked_max,
--         days_to_bank_after_funding, communication_platform, operator_notes
--    (membership-doc wet-signature note kept in operator_notes only; see open Q4)
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, typical_days_blocked_max,
   days_to_bank_after_funding, communication_platform, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Hughes Federal Credit Union',
  3,
  12,
  2,
  'CUDL',
  'Funding review is 3-5 business days from when the funding packet is uploaded.
Only credit union that requires membership documents to be wet signature.
Funding goes in waves, sometimes they can fund in 2-3 days other times they will fund in 10-12 business days. Funding rep will leave message on approximate funding time regardless of short or long time frame.
Fund Delays through CUDL
Funds in bank within 2 business days'
);

-- 4. Mountain America Credit Union
--    set: typical_days_clean, days_to_bank_after_funding,
--         communication_platform, operator_notes
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   communication_platform, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Mountain America Credit Union',
  1,
  1,
  'CUDL',
  'Can fund within same day, usually next day funding.
Easy to clear fund delays, allow for cross out and hand write in ink on any corrections on paperwork.
Good communication
Fund delays through CUDL
Funds in bank next business day'
);

-- 5. Sunwest Credit Union
--    set: typical_days_clean, days_to_bank_after_funding,
--         communication_platform, operator_notes
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   communication_platform, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Sunwest Credit Union',
  3,
  1,
  'CUDL',
  'Funding within 3-4 days.
Quick to respond
Funds in bank next business day
Fund Delays through CUDL'
);

-- 6. Vantage West Credit Union
--    set: typical_days_clean, days_to_bank_after_funding,
--         communication_platform, operator_notes
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   communication_platform, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Vantage West Credit Union',
  5,
  1,
  'CUDL',
  'Funding within 5 days
If no message from Funder in CUDL, OK to reach out after 3rd day to follow up.
Fund Delays through CUDL
Funds in bank next business day'
);

-- 7. Westlake Financial Services
--    set: typical_days_clean, days_to_bank_after_funding, does_welcome_calls,
--         does_employment_verification, can_increase_lender_fee,
--         floating_title_limit, accepts_esign, communication_platform,
--         common_required_stips, operator_notes
--    (typical_days_blocked_max left NULL = indeterminate, doc says "can take weeks")
--    (can_increase_lender_fee TRUE here — the fee bullet under Credit Acceptance
--     actually describes Westlake's Dealercenter flow; see open Q1)
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   does_welcome_calls, does_employment_verification, can_increase_lender_fee,
   floating_title_limit, accepts_esign, communication_platform,
   common_required_stips, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Westlake Financial Services',
  1,
  1,
  true,
  true,
  true,
  8,
  true,
  'DealerCenter (via RouteOne)',
  '["proof_of_income"]'::jsonb,
  'Can fund same day if stips are in order and everything is given
Can also take weeks to fund if there are issues with stips or welcome call and employment verification is needed.
Communication within Dealer Center, accessed through Route One.
Heavily invested in AI. If you leave a message in the deal portal in dealercenter, AI responds. Tough to get a live agent on there unless there is a bigger issue. Such as days trying to get welcome call done or proof of income is not good.
Needs daily reach out for updates as the messages on DealerCenter can sometimes be unclear. There is a phone number that routes to the funding department but need to go through AI agent first.
Funding portal shows line item stips to show finance when a stip is cleared and when it is awaiting clearance. Same for welcome call and employment verification.
Can E-sign within Dealercenter or Route One. Allows for fast funding, if not need to TaptoSign then mail out originals.
Funds loan in bank account next business day.
Does have floating title limit of 8 at a time. So if we have 8 titles that have not been perfected, meaning they have funded and we have taken paperwork to DMV for registration and adding Westlake as lienholder. Westlake will fund but put our funds on hold until we clear titles.'
);

-- 8. Credit Acceptance Corp.
--    set: clears_stips_upfront, days_to_bank_after_funding,
--         can_increase_lender_fee, communication_platform, operator_notes
--    (does_welcome_calls left default false: doc says "Does not do welcome calls")
--    (does_employment_verification left default false: doc says "rarely")
--    (can_increase_lender_fee TRUE — operator confirms CA increases fees on
--     deal-structure changes; see Q1 resolution.)
INSERT INTO public.lenders
  (dealership_id, name, clears_stips_upfront, days_to_bank_after_funding,
   can_increase_lender_fee, communication_platform, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Credit Acceptance Corp.',
  true,
  1,
  true,
  'Own portal (Credit Acceptance website)',
  'Clears stips upfront
Need to reach out to Bank Rep for funding
Quick and easy funding once stips are cleared.
Has their own website for working deals and funding.
Funding side shows what stips are needed and removes them once they have been cleared so you can see only what is needed.
Funds loan in bank account next business day.
Does not do welcome calls and rarely does employment verification.
Can have lender fee increase if income comes back short, Westlake only clears income during funding. Can also increase fee if extra steps are needed for EV clearance. Within Dealercenter funding portal, there will be a message to OK fee. Can OK within portal or call Westlake.'
);

-- 9. Capital One Auto Finance
--    set: typical_days_clean, days_to_bank_after_funding, clears_stips_upfront,
--         accepts_esign, communication_platform, common_required_stips, operator_notes
--    (welcome calls / EV left default false: doc says "very rarely")
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   clears_stips_upfront, accepts_esign, communication_platform,
   common_required_stips, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Capital One Auto Finance',
  1,
  2,
  true,
  true,
  'Dealer Navigator (via RouteOne)',
  '["proof_of_income", "identity_verification"]'::jsonb,
  'Clears stips upfront for income and identity verification
Same day funding if all stips are accounted for. If the funding packet is submitted before 2pm MST. If not usually next day funding.
Sometimes, deals can sit in buyer review. Capital One uses their Dealer Navigator platform for funding but that platform connects with RouteOne and leaves messages in RouteOne when a message is left in DealerNavigator. If a deal is in buyer review and shows stips clear, rarely will a buyer go in and clear themselves. Finance has to call either the buyer or funding department and ask them to complete the review. Will fund minutes after the phone call.
Funds in bank within 2 business days.
Very rarely does welcome call and employment verification.
Can contract through TaptoSign and send docs in DealerNavigator.'
);

-- 10. Global Lending Services LLC
--    set: typical_days_clean, days_to_bank_after_funding, does_welcome_calls,
--         does_employment_verification, can_increase_lender_fee, accepts_esign,
--         communication_platform, common_required_stips, operator_notes
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   does_welcome_calls, does_employment_verification, can_increase_lender_fee,
   accepts_esign, communication_platform, common_required_stips, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Global Lending Services LLC',
  2,
  2,
  true,
  true,
  true,
  true,
  'Global platform (via RouteOne)',
  '["proof_of_income"]'::jsonb,
  'Funding stips are uploaded in Global’s platform, accessible through RouteOne. Funding department will also call finance and give updates and leave notes that transfer into RouteOne.
Welcome calls and employment verification done on each deal. Regardless if proof of income is waived as a stip.
Can e-contract through Route One. Will received funding packet right away.
Receive funding notices through email when a day is funded.
If needs help during funding such as waive of stips, income change, etc.. lender fee may increase. Need to ok with rep
Funding can take 2 business days or weeks depending on stips and welcome call or EV.
Funds in bank within 2 business days.'
);

-- 11. United Auto Credit
--    set: typical_days_clean, days_to_bank_after_funding, does_welcome_calls,
--         does_employment_verification, can_increase_lender_fee, accepts_esign,
--         communication_platform, common_required_stips, operator_notes
--    (accepts_esign FALSE — "Does not accept RouteOne E-sign"; see open Q5)
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   does_welcome_calls, does_employment_verification, can_increase_lender_fee,
   accepts_esign, communication_platform, common_required_stips, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'United Auto Credit',
  2,
  2,
  true,
  true,
  true,
  false,
  'FastLane (via RouteOne)',
  '["drivers_license", "proof_of_income", "insurance"]'::jsonb,
  'Can speak on the phone with buyer to make sure stips are good. Cannot pre clear stips in portal before funding packet is sent.
Has Fastlane website linked through RouteOne to work on call and fund the deal.
Does not accept RouteOne E-sign. Signing needs to be through FastLane or sent via Fedex. They provide the shipping label.
Once they receive the funding packet, they send an email with another email after on the stips needed to fund.
Will give time frame as to when stips are needed to avoid contract return
Sends emails updates daily sometimes twice.
Has contact info for funder working on the deal.
Can email funder or upload stips into FastLane.
Can fund within 2 days or weeks depending on the stips and how well finance and sales collect stips and information.
Usually does not begin on customer call and employment verification until stips are cleared. Such as DL, income, insurance, etc..
Funds in bank within 2 business days.
Can also increase lender fees if anything changes in funding .
Sells their own backend product.'
);

-- 12. Veros Credit LLC
--    set: typical_days_clean, days_to_bank_after_funding, does_welcome_calls,
--         does_employment_verification, can_increase_lender_fee,
--         communication_platform, common_required_stips, operator_notes
--    (GPS stip is "sometimes / can be waived" — kept in operator_notes, not in common_required_stips)
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   does_welcome_calls, does_employment_verification, can_increase_lender_fee,
   communication_platform, common_required_stips, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Veros Credit LLC',
  3,
  2,
  true,
  true,
  true,
  'DealLane (via RouteOne)',
  '["proof_of_income", "proof_of_residence"]'::jsonb,
  'Uses their own platform same as other subprime lenders, their name is Deal Lane.
Notices / messages also go into RouteOne.
Updates on funding are sent via email from funding department. Daily notices are sent from funding department
Lenders fees can increase during funding for any discrepancy
Majority of the time, stips for income and residence.
Sometimes stips for GPS in car, can potentially be waived before funding.
Funding can take 3-4 business day, sometimes it can take weeks. Again depending on how clean stips are how soon bank can clear welcome call and employment verification.
Will not start welcome call and EV until stips are cleared.
Stips are uploaded into DealLane
Sells their own Gap insurance, Veros sends Gap contract with the callback via email.
Needs daily call if stips are uploaded and have not gotten a call or received an email update.
Email can sometimes show stips that have been sent. Email is asking for the same stip. Good to call and clear stips.
Funds in bank can take 2 business days'
);

-- 13. Consumer Portfolio Services
--    set: typical_days_clean, days_to_bank_after_funding, does_welcome_calls,
--         does_employment_verification, can_increase_lender_fee, accepts_esign,
--         communication_platform, common_required_stips, operator_notes
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   does_welcome_calls, does_employment_verification, can_increase_lender_fee,
   accepts_esign, communication_platform, common_required_stips, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Consumer Portfolio Services',
  1,
  3,
  true,
  true,
  true,
  true,
  'Consumer portal (via RouteOne)',
  '["proof_of_income", "proof_of_residence", "insurance"]'::jsonb,
  'Can be E-signed in RouteOne or paper contract mailed Fedex.
Sends emails with contract received and funding update hours or next day after contract received, regardless of delivery.
Gives 1-2 days to send stips in such as income, proof of residence before they send the contract back.
Cannot clear income / stips before funding.
Once stips are cleared then bank starts reviewing other stips and rest of contract.
Can increase fee if any discrepancy in income or job type.
Funding can be next day or take weeks if stips are not all collected or cleared by finance beforehand.
Does welcome calls and employment verifications.
Always asks for declaration page for insurance
Funder calls for finance as well after a day or two of not receiving stips.
Daily updates via email on funding status.
Stips are uploaded into Consumer’s portal inside RouteOne
Funds can take up to 3 business days to enter bank after funding
Income and residence can be cleared if they get match using their system however Consumer will still complete EV.'
);

-- 14. Alhambra Credit Union
--    set: typical_days_clean, days_to_bank_after_funding,
--         communication_platform, common_required_stips, operator_notes
INSERT INTO public.lenders
  (dealership_id, name, typical_days_clean, days_to_bank_after_funding,
   communication_platform, common_required_stips, operator_notes)
VALUES (
  '<YOUR_DEALERSHIP_ID>',
  'Alhambra Credit Union',
  4,
  1,
  'CUDL',
  '["proof_of_income"]'::jsonb,
  'Funding can take 4-7 business days
“Fund delays” are sent after a day or so, if any
Messages are sent via CUDL
Funding shows next day in bank, if business day.
Verifies income before contracting customer.
Will more than likely stip for income, even for prime customers with strong credit'
);

COMMIT;
