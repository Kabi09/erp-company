# Service and R&D refinement verification

Verified locally on 21 November 2026 on `dev-service-rnd`. The full backend suite passed 148 tests and the frontend suite passed 13. Headless Google Chrome completed both department workflows against the running frontend, API and a separate MongoDB replica-set fixture.

## Issues found and fixed

| Area | Previous behavior | Change |
| --- | --- | --- |
| Service request | Manual equipment and contact fields competed with the delivered-unit selector. Changing the customer could leave values from the previous unit. | Start with customer and delivered product, show known contact, address, serial, model, orders and warranty, and clear dependent values on reselection. A separate checkbox opens manual entry. |
| Delivered equipment | Missing serials could pick up a submitted serial. A missing customer master could block creation from a historical delivery. Missing dates could disappear from the detail view. | An attached delivery supplies its own serial and customer reference. The detail retains labels and marks unavailable historical values as **Not recorded**. Equipment verification narrows choices to identifiable units for the recorded customer. |
| Visits and workshop custody | Initial scheduling could default a workshop request to a site visit. Completion could be offered during an open visit or before a workshop return. | The first assignment carries forward the preferred date and location. The current assignment drives custody and completion fields, including site acknowledgement. The small-screen schedule includes the time. |
| Technician money | Verified company-paid expenses were hard to distinguish from reimbursement-eligible expenses. Settled accounts and previously processed entries could still appear as choices. | Show total verified expenses, technician-paid expenses, advance received, amount settled and both possible balances. Show pending entries eligible for the reviewer. Selecting the technician fills the outstanding settlement direction and amount. |
| Materials | Receipt or usage could be offered with no eligible request line. An R&D BOM could still offer a request when its quantities were already fully requested. | Match the actions and request-line choices to issued, received, used, returned and already-requested quantities. Existing transactional stock and revision checks remain authoritative. |
| R&D forms and navigation | Creating a project exposed type and priority on every entry. Selecting a predefined work stage also displayed an editable duplicate. Some summary-only roles saw links to restricted detail screens. | Collapse optional project settings, fill the existing product and category, separate predefined stages from custom entries, and show detail links according to the viewer's permissions. |
| Shared controls | Every choice required the searchable text control, even for very short lists. | Use native selectors for up to 20 choices, retain searchable suggestions for longer lists, and match native form controls to the current theme. |

## Workflow evidence

| Workflow | Observed result |
| --- | --- |
| Delivered register | A Chrome session opened the same serial in Production and Service and compared the rendered unit details. API tests compared both registers, verified linked order numbers and checked that a partial shipment retained an unknown serial. |
| Service site and workshop | A manager selected a unit, changed customers, reselected the unit and scheduled a technician. The technician opened My Jobs, checked in, added a work highlight and inspection, and checked out. The site job completed with acknowledgement. In a separate workshop job, Chrome verified intake, return and the location-specific completion form. The API suite completed a workshop job and recorded multiple site visits. |
| Expenses and customer payments | Chrome uploaded and downloaded a receipt, verified ₹300, settled ₹300 and checked that the reimbursement due was zero. In the API suite, a ₹2,000 paid advance and ₹1,600 of approved expenses included ₹1,400 paid by the technician. Returning ₹600 closed the balance, and another settlement was rejected. Independent billing tests checked warranty-covered charges, customer receipts, duplicate references and outstanding balances. |
| Service and Supply Chain | From the technician's browser, a request for two fans appeared under its service reference in Supply Chain. Store staff issued both. The technician recorded receipt of two, use of one and return of one. The browser then offered no further movement on those lines. The API suite checked partial issue, duplicate issue and receipt rejection, and the final store balance. |
| R&D and Supply Chain | Chrome created a project, added and removed specification rows, saved a BOM, requested materials, saved predefined and custom work stages, and recorded a highlight. The API suite verified store issue, physical receipt, prototype consumption and prevention of a repeat BOM request. |
| Testing and completion | Chrome saved a failed attempt and a passing retest. The engineer lacked the completion action, the manager completed the project, and its reference appeared in Completed Projects. The API suite checked saved drafts, retained test history, the failed-test completion gate, optional approval and the final state. It compared Production Order count and Product Master records, including BOM, before and after completion. |
| Permissions and downloads | Chrome used Service Manager, Service Technician, R&D Manager and R&D Engineer accounts. The technician's sidebar omitted Service Requests and direct navigation showed the restriction. API tests checked assigned-job scope, explicit team-view Allow, edit Deny and return to inherited access. Chrome downloaded a service PDF and both departmental CSV exports. |

## Responsive browser checks

Chrome opened all nine Service navigation screens and all eight R&D navigation screens. **My Jobs / Schedule** is a single route and was also exercised as the technician. Each matrix cell below covers seven rendered cases: schedule, assigned technician job, expense detail, service request form, R&D project form, testing history, and an editable two-row inspection form.

| Viewport width | Light | Dark |
| --- | --- | --- |
| 360 px | 7 passed | 7 passed |
| 390 px | 7 passed | 7 passed |
| 768 px | 7 passed | 7 passed |
| 1024 px | 7 passed | 7 passed |
| 1366 px | 7 passed | 7 passed |
| 1440 px | 7 passed | 7 passed |

All 84 checks passed the document and open-form horizontal overflow assertions. Chrome also exercised the mobile Work menu, tablet drawer and desktop navigation. Representative phone and desktop screenshots were inspected for field layout, dark controls and access to the inspection form's save button.

## API and automated checks

The existing Service options endpoint includes customer email and shipping/billing addresses. Job details expose the current service location to job viewers and add `verifiedExpenses` and `alreadySettled` to each authorized technician account. The existing eligible amount continues to count technician-paid expenses. Creating an R&D project accepts omitted type and priority, defaulting to **New Development** and **Normal**. Existing URLs, collections and approval flows are reused.

| Check | Result |
| --- | --- |
| Full backend regression, `npm test` | 148 passed, 0 failed, 0 skipped, across the 13 existing test files |
| Targeted department suite | 15 passed, including API and transaction scenarios |
| Frontend, `npm test --workspace frontend` | 13 passed, including three new rendered-form regressions |
| Workspace lint, `npm run lint` | Frontend and backend TypeScript checks passed |
| Workspace build, `npm run build` | Frontend TypeScript and Vite production build passed. The backend build script passed its TypeScript check. |

The regression fixture used a fresh database on a local single-node replica set. It imported the repository's demo JSON, initialized the standard approval workflows and reconciled the fixture's stock cache to its ledger. Browser transactions used a separate database on that replica set.

## Modified files

| Files | Purpose |
| --- | --- |
| [WorkForm.tsx](frontend/src/pages/departments/WorkForm.tsx), [DepartmentPage.tsx](frontend/src/pages/departments/DepartmentPage.tsx) | Forms, actions, conditional fields, financial summary and delivered register |
| [departments.routes.ts](backend/server/routes/departments.routes.ts), [departmentAccess.ts](backend/server/services/departmentAccess.ts), [departmentLogic.ts](backend/server/services/departmentLogic.ts) | Scoped detail, options, snapshots, defaults and balances |
| [departments.test.ts](backend/server/tests/departments.test.ts) | Historical deliveries, permissions, account totals and material movements |
| [WorkForm.test.mjs](frontend/src/pages/departments/WorkForm.test.mjs), [frontend/package.json](frontend/package.json) | Rendered form regressions included in the frontend test command |
| [Service workflow](SERVICE_MANAGEMENT_WORKFLOW.md), [R&D workflow](RD_MANAGEMENT_WORKFLOW.md), [project record](project.md), [this verification report](SERVICE_RD_UI_VERIFICATION.md) | Updated operating steps and verification evidence |

## Remaining limits

Browser coverage used desktop Chrome with resized viewports. Physical-device touch interaction, native mobile keyboards, Safari and Firefox remain unverified. Historical deliveries still depend on the original records for serials, dates and warranty terms.

