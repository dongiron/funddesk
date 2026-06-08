# FundDesk Privacy Posture

_Last updated: 2026-06-07. This is a living document — update it before any migration that adds or removes a data field._

## Data we collect

FundDesk collects the minimum personal information required to structure and submit a car deal to a lender. This includes customer name, address, date of birth, Social Security Number, employment information, and income figures — all of which are required fields on a standard credit application. We also collect deal economics (vehicle details, selling price, trade-in values, lender terms, reserve income) and user account information (name, email, dealership affiliation) for the finance managers and staff who operate the platform.

## Data we explicitly do not collect

We do not collect payment card numbers, bank account numbers, or any information not required to complete a credit application or F&I deal. We do not collect behavioral analytics, advertising identifiers, or any data about customers beyond what appears on a standard 1-form or credit application. We do not sell or share customer data with any third party other than the lender the dealer selects for a given deal.

## Who can access what

Data is strictly isolated by dealership. A finance manager at Dealer A cannot see any data belonging to Dealer B — this is enforced at the database level via row-level security policies, not just application logic. Within a dealership, access is role-based: finance managers can only see deals they personally created; managers and owners can see all deals across the dealership. Audit log entries are readable by managers and owners but never editable or deletable by anyone, including administrators.

## Retention policy

Deal records and associated customer data are retained for a minimum of seven years to satisfy standard automotive compliance requirements (FTC Safeguards Rule, state dealer licensing requirements). Audit log entries are retained permanently and are never deleted. If a dealership cancels their account, their data is held for 90 days before permanent deletion to allow for export.

## Right to export

Any dealership administrator can request a full export of their dealership's data at any time. The export will be provided as a structured file (CSV or JSON) within 30 days of request. Customers whose data appears in a deal may request a copy of their information by contacting the dealership directly.

## Right to delete

Customers may request deletion of their personal information. Deletion is implemented as a soft-delete (the record is flagged and excluded from all application views) followed by hard deletion of PII fields after the mandatory retention period expires. Deal economics and lender submission records are retained for compliance purposes with PII fields nulled out. Audit log entries referencing a deleted customer are retained but customer-identifying fields are redacted.
