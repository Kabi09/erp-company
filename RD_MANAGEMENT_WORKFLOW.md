# Research & Development

R&D projects run independently of customer Sales Orders and manufacturing Production Orders. An administrator assigns an active employee to Research & Development and gives them the R&D Engineer, R&D Manager or a custom role.

## Project workflow

1. From **R&D Projects**, select **New R&D project**. Enter the project name and assigned employee, and confirm the start date. Select an existing product to fill the product name and category, or enter details for a new product. Target date and description are optional. Open **Project type and priority** to change the defaults of **New Development** and **Normal**. The system assigns an `RND` reference.
2. Use **Specifications** to add, edit or remove name/value rows with optional units and remarks. Drawings and documents use the ERP attachment store.
3. Use **BOM / Materials** to select materials and quantities from Material Master. Units come from the selected material. Saving the BOM keeps a revision in history. **Request materials** sends only the balance above quantities already requested. Existing requests establish the lower bound for subsequent BOM edits.
4. Supply Chain handles partial issues, shortage purchases, GRNs and verification. Each request and issue references its R&D project. Record physical receipt and prototype usage in the project. The shared store ledger records the issue once. Consuming received material does not decrement store inventory again.
5. Use **Daily Work Updates** for dated progress notes. Select the applicable stages, use **Add custom stage** for another stage, and use **Add Highlight** for each separate highlight. Issues are optional. Planning and research updates can start before receipt of materials.
6. In **Testing & Inspection**, add test rows, expected and actual results, required flags, outcomes and remarks. Save a draft while working and submit a test attempt when ready. Each submission preserves earlier results and attachments. After a failed test, add work updates and submit a retest with the same test name.
7. Select **Mark Successfully Completed** on Overview. Record the completion date, summary and optional attachment. Mandatory named tests must have a passing latest outcome and a draft must be finalized. A project without applicable tests can finish directly. If Administration has enabled an R&D completion workflow with the Submit trigger, completion goes to the existing approval inbox. Rejection, withdrawal and changes requested return the project to work.

**Successfully Completed** is the final project state. Completed projects remain in R&D history. Completion updates the project and its audit history, with no Production Order creation or Product Master/BOM write. The dashboard shows status counts. Reports show test attempts and work updates with an authorized CSV download.

## Permissions and data

The catalog modules are `rnd_dashboard`, `rnd_projects`, `rnd_specs`, `rnd_materials`, `rnd_updates`, `rnd_testing`, `rnd_completion` and `rnd_reports`. The default engineer can work on projects. The default manager can also confirm completion. Existing role actions and employee overrides control access.

The `ResearchProject` Mongoose collection stores project details, assignment, revision and chronological entries. Specifications and BOM revisions, daily updates, draft tests, test attempts and completion details remain with the project. Materials, employees, products, attachments, document numbers, approvals and audit logs use existing ERP infrastructure.

| Method | API path | Purpose |
| --- | --- | --- |
| GET | `/api/rnd/options` | Employee, product and material selectors |
| GET, POST | `/api/rnd/projects` | List or create projects |
| GET | `/api/rnd/projects/:id` | Project details, permitted history and materials |
| POST | `/api/rnd/projects/:id/:action` | Apply a revision-checked change |
| GET | `/api/rnd/reports.csv` | Project status, owner, tests and updates |

Action names are `specs`, `bom`, `request`, `receive`, `use`, `update`, `draft`, `test` and `complete`. Create accepts a unique client-generated ID. Later actions require the current project revision. Material requests, receipts, usage and configured approval transitions require a transaction-capable MongoDB connection.

The automated integration suite checks retesting and compares Production Order count and Product Master state before and after completion. See the [Service and R&D verification report](SERVICE_RD_UI_VERIFICATION.md) for test results and browser coverage.
