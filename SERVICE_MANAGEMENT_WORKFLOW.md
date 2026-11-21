# Service Management

Open Service Management in the ERP department selector. Administrators assign the Service Manager, Service Coordinator or Service Technician role in Employees. The backend installs these defaults on startup using insert-only upserts. Managers can customize role actions and employee overrides in Administration.

## Working a service request

1. Open **Delivered Products** to find equipment by customer, product, serial, Sales Order, Production Order or delivery reference. The same register is available in Production. Open a unit to see its specifications, delivery, customer, warranty and previous Service references.
2. Open **Service Requests** and select **New service request**. Select a customer to narrow the delivered-product list, or select the unit directly. Review the populated contact, address, model, serial, order references and warranty. Changing the customer clears the previous unit. Enter the problem and choose a priority, location, optional preferred date and attachment. For equipment missing from the register, select **Equipment is missing from the delivered register** and enter the equipment and customer details. The request receives an `SRV` number. The resulting job keeps that number through completion.
3. On **Overview**, verify unverified equipment using a matching delivered unit. Review the claim separately from the date calculation. Assign an active Service employee, date, time and location. The first assignment uses the requested location and preferred date if recorded. Rescheduling keeps the previous assignment in history. **My Jobs / Schedule** lists active scheduled jobs within the employee's scope.
4. Under **Work Updates**, the assigned technician checks in, adds inspection rows, highlights, work and photos, then checks out with a summary. Each visit has server timestamps, the technician identity and elapsed minutes. A follow-up visit uses the same job. At a customer site, record the customer's acknowledgement at completion. At the workshop, record receipt condition, receiving employee, serial verification and return to the recipient. Check out of any open visit before completing the job.
5. Use **Spare Parts** when materials are needed. Add Material Master rows, quantities, coverage and remarks. Supply Chain sees the job reference on the normal material request, issues available stock and purchases shortages through its existing PO, GRN and verification screens. Service records physical receipt against the issue vouchers, then usage or unused return. A usable return credits the store ledger once.
6. Use **Expenses** and **Billing** for technician and customer transactions respectively. On **Overview**, complete the service with a work summary, condition, final inspection and site acknowledgement or workshop return. The completion entry flags open material reconciliation. Settlement may continue after completion. **Completed Services** includes the service report PDF. **Reports** includes status totals, visit and update counts, and CSV export.

## Delivered equipment and warranty

The register reads confirmed delivery quantities and joins the existing Production Order, Sales Order, Product, Customer, accepted QC and quotation. A serial becomes a unit key within its delivery. Quantities without a confirmed serial appear together. A single-unit shipment can identify equipment without a serial. Partial confirmations that do not identify handed-over serials show the delivered quantity with an unknown serial. Missing historical values stay blank. For a split delivery with no serial-to-date mapping, the register leaves the individual delivery date unknown.

Linked quotation terms take priority over default Product Master warranty text. The register recognizes explicit month/year durations and delivery, installation/commissioning or contract bases. A reviewer can confirm structured terms for an identifiable unit. Calendar-month calculation clamps the end date to the last day of the target month and includes the displayed expiry day. Unknown terms or a missing start produce **Not Configured**. Date validity and claim decisions are independent. Approving a claim requires an identifiable unit and an active warranty. Rejecting requires a reason. Chargeable repairs are available outside warranty.

## Technician and customer money

An advance affects the balance when its payment is recorded. Verification of an expense or advance payment requires a separately authorized employee. Approved technician-paid expenses are eligible for reimbursement. **Total verified expenses** includes approved expenses paid by either the company or the technician. The summary separately shows technician-paid expenses, advances received, amounts already settled, reimbursement due and advances to return. Selecting the technician on a settlement fills its direction and remaining balance. Reduce the amount to record a partial settlement.

For each technician on a job, the advance balance equals **advances paid + reimbursements already paid − advances already returned − eligible expenses**. A positive balance is due back to CRYO. A negative balance is due to the technician. Settlements are capped at the applicable balance. An advance of ₹2,000 and approved technician-paid expenses of ₹1,400 leave ₹600 to return.

Customer billing sums chargeable parts, labour, visit and other charges, subtracts the discount, then applies the tax percentage. Used store parts marked warranty-covered contribute zero. Customer payments reduce the outstanding amount. The backend checks overpayment, duplicate receipt references and stale forms. Job history preserves changes to charges, verification decisions and payments.

## Permissions, persistence and API

The module catalog includes `service_dashboard`, `service_assets`, `service_requests`, `service_jobs`, `service_team`, `service_schedule`, `service_parts`, `service_warranty`, `service_expenses`, `service_verification`, `service_billing` and `service_reports`. Production uses `production_delivered`. Team-wide visibility and money-related actions are separate grants. Technicians see assigned jobs and their own expenses. The server resolves grants on every authenticated request.

| Method | API path | Purpose |
| --- | --- | --- |
| GET | `/api/service/delivered-products`, `/api/production/delivered-products` | Shared register with service references |
| POST | `/api/service/warranty` | Confirm unit warranty terms |
| GET | `/api/service/options` | Scoped employee, customer, unit and material choices |
| GET, POST | `/api/service/jobs` | List jobs or create a request with a client-generated unique ID |
| GET | `/api/service/jobs/:id` | Scoped detail, history, balances and material requests |
| POST | `/api/service/jobs/:id/:action` | Apply an action with the current revision |
| GET | `/api/service/jobs/:id/report/pdf` | Completed technical service report |
| GET | `/api/service/reports.csv` | Authorized operational export |

Actions are `link`, `claim`, `assign`, `checkIn`, `update`, `checkOut`, `receiveUnit`, `returnUnit`, `parts`, `receive`, `use`, `return`, `advance`, `payAdvance`, `expense`, `verify`, `settle`, `charges`, `payment` and `complete`. Action payloads and allowed choices are defined in [departmentForms.ts](shared/departmentForms.ts). Reads can pass the screen's permission module as a query parameter.

Mongoose persists jobs and action history in `ServiceJob`, unit terms in `UnitWarranty`, files in the existing private attachment service and all part movements in existing Material Request, Material Issue, Material and Stock Transaction collections. Department stock operations require MongoDB replica-set transactions. The Supply Chain issue form submits the material request version for retry protection. A stale form must be reloaded before resubmission.

See the [Service and R&D verification report](SERVICE_RD_UI_VERIFICATION.md) for browser, API and build results.
