import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import {
  serviceCreate,
  projectCreate,
  warrantyFields,
  type Workspace,
  type Values,
} from '../../../shared/departmentForms';
import { departmentModules } from '../../../shared/types/departmentModules';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { withTransaction } from '../config/database';
import {
  EmployeeModel,
  CustomerModel,
  ProductModel,
  MaterialModel,
  MaterialRequestModel,
  CompanySettingsModel,
  ApprovalWorkflowModel,
  ApprovalRequestModel,
  AttachmentModel,
} from '../models';
import { ServiceJob, UnitWarranty, type WorkEntry } from '../models/department.model';
import { mongoERPRepository as repo } from '../repositories/MongoERPRepository';
import { modelFor, opsFor, can, scope, viewRecord } from '../services/departmentAccess';
import { clean, ensure, researchTransition, serviceTransition } from '../services/departmentLogic';
import { materialLines, applyMaterials } from '../services/departmentMaterials';
import { deliveredProducts, findUnit } from '../services/deliveredProducts';
import { pdfService } from '../services/pdf.service';
import { sendError } from '../utils/routeUtils';

export const departmentsRouter = Router();
type Handler = (req: AuthenticatedRequest, res: Response) => Promise<void>;
const handle =
  (fn: Handler): Handler =>
  async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 11000) {
        res.status(409).json({ error: 'This request or receipt reference has already been recorded.' });
      } else {
        sendError(res, e);
      }
    }
  };
const validateId = (id: unknown): string => {
  ensure(
    typeof id === 'string' && /^[a-zA-Z0-9-]{12,80}$/.test(id),
    'A valid request identifier is required.',
  );
  return id;
};
async function employee(id: string, department: Workspace) {
  const emp = await EmployeeModel.findOne({ id, department, status: 'Active' }).select('id name').lean();
  ensure(emp, 'Select an active department employee.');
  return emp;
}
async function attachment(id: string | undefined, module: string, recordId: string) {
  if (id)
    ensure(await AttachmentModel.exists({ id, module, recordId }), 'Choose a file uploaded for this record.');
}

for (const [path, module] of [
  ['/service/delivered-products', 'service_assets'],
  ['/production/delivered-products', 'production_delivered'],
]) {
  departmentsRouter.get(
    path,
    requireAuth,
    requirePerm(module, 'view'),
    handle(async (req, res) => {
      const units = await deliveredProducts();
      const history = await ServiceJob.find({
        assetId: { $in: units.flatMap((u) => [u.id, u.deliveryId + '~lot']) },
        ...(module === 'production_delivered' ? {} : scope(req.user!, 'service')),
      })
        .select('id assetId docNo status name')
        .lean();
      res.json(
        units.map((u) => ({
          ...u,
          history: history
            .filter((r) => r.assetId === u.id || r.assetId === u.deliveryId + '~lot')
            .map((r) => ({ id: r.id, docNo: r.docNo, status: r.status, shipmentOnly: r.assetId !== u.id })),
        })),
      );
    }),
  );
}
departmentsRouter.post(
  '/service/warranty',
  requireAuth,
  requirePerm('service_warranty', 'verify'),
  handle(async (req, res) => {
    const u = await findUnit(String(req.body.assetId));
    ensure(u?.identifiable, 'Select an identifiable delivered unit.');
    const terms = clean(warrantyFields, req.body);
    ensure(
      Number.isInteger(terms.duration) && terms.duration * (terms.unit === 'Years' ? 12 : 1) <= 1200,
      'Invalid warranty duration.',
    );
    ensure(
      terms.basis === 'Delivery Date' ? u.deliveryDate : terms.start,
      'Enter a confirmed warranty start date.',
    );
    await UnitWarranty.updateOne(
      { assetId: u.id },
      { $set: { ...terms, reviewedBy: req.user!.id } },
      { upsert: true },
    );
    await repo.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'service',
      action: 'Confirmed warranty terms',
      entityType: 'UnitWarranty',
      entityId: u.id,
      entityDocNo: u.deliveryOrder,
      details: [terms.duration, terms.unit, terms.basis, terms.start || u.deliveryDate, terms.notes]
        .filter(Boolean)
        .join(' ? '),
    });
    res.json({ ok: true });
  }),
);

for (const dept of ['service', 'rnd'] as const) {
  const service = dept === 'service';
  const base = service ? '/service/jobs' : '/rnd/projects';
  const main = service ? 'service_requests' : 'rnd_projects';
  const model = modelFor(dept);
  const ops = opsFor(dept);
  const checkView = (req: AuthenticatedRequest) => {
    const mod = String(req.query.module || (service ? 'service_jobs' : 'rnd_projects'));
    ensure(
      departmentModules.some((m) => m.department === dept && m.id === mod) && can(req.user!, mod),
      'FORBIDDEN: Workspace permission required.',
    );
  };
  departmentsRouter.get(
    '/' + dept + '/options',
    requireAuth,
    handle(async (req, res) => {
      checkView(req);
      const user = req.user!;
      const [people, materials, customers, products, assets] = await Promise.all([
        EmployeeModel.find({ department: dept, status: 'Active' }).select('id name').lean(),
        can(user, service ? 'service_parts' : 'rnd_materials')
          ? MaterialModel.find({ active: true }).select('id name code unit').lean()
          : [],
        service && can(user, main, 'create')
          ? CustomerModel.find()
              .select('id name contactPerson phone email shippingAddress billingAddress')
              .lean()
          : [],
        !service && can(user, main, 'create')
          ? ProductModel.find({ status: 'Active' }).select('id name category').lean()
          : [],
        service && (can(user, main, 'create') || can(user, main, 'edit')) ? deliveredProducts() : [],
      ]);
      res.json({
        technicians: service ? people : [],
        engineers: service ? [] : people,
        materials,
        customers,
        products,
        assets,
      });
    }),
  );
  departmentsRouter.get(
    '/' + dept + '/reports.csv',
    requireAuth,
    requirePerm(dept + '_reports', 'export'),
    handle(async (req, res) => {
      const records = await model
        .find(scope(req.user!, dept))
        .select('docNo name status employeeId entries.action entries.data.minutes')
        .sort({ docNo: 1 })
        .lean();
      const people = await EmployeeModel.find({ id: { $in: records.map((r) => r.employeeId) } })
        .select('id name')
        .lean();
      const quote = (value: unknown) => {
        const str = String(value ?? '');
        return '"' + (/^[=+@-]/.test(str) ? "'" : '') + str.replaceAll('"', '""') + '"';
      };
      const header = [
        'Reference',
        'Name',
        'Status',
        'Employee',
        service ? 'Visits' : 'Test attempts',
        service ? 'Visit minutes' : 'Work updates',
      ];
      const lines = records.map((r) => [
        r.docNo,
        r.name,
        r.status,
        people.find((p) => p.id === r.employeeId)?.name,
        r.entries.filter((e) => e.action === (service ? 'checkOut' : 'test')).length,
        service
          ? r.entries.reduce((s, e) => s + (e.action === 'checkOut' ? Number(e.data?.minutes) || 0 : 0), 0)
          : r.entries.filter((e) => e.action === 'update').length,
      ]);
      res
        .type('text/csv')
        .attachment(dept + '-report.csv')
        .send([header, ...lines].map((row) => row.map(quote).join(',')).join('\r\n'));
    }),
  );
  departmentsRouter.get(
    base,
    requireAuth,
    handle(async (req, res) => {
      checkView(req);
      const records = await model
        .find(scope(req.user!, dept))
        .select(
          'id docNo name status employeeId details.priority details.start details.target details.preferred entries.action entries.data.date entries.data.time entries.data.minutes',
        )
        .sort({ createdAt: -1 })
        .lean();
      res.json(
        records.map(({ entries, ...r }) => ({
          ...r,
          visits: entries.filter((e) => e.action === 'checkOut').length,
          workUpdates: entries.filter((e) => e.action === 'update').length,
          testAttempts: entries.filter((e) => e.action === 'test').length,
          schedule: [...entries].reverse().find((e) => e.action === 'assign')?.data,
        })),
      );
    }),
  );
  departmentsRouter.get(
    base + '/:id',
    requireAuth,
    handle(async (req, res) => {
      checkView(req);
      const r = await model.findOne({ id: String(req.params.id), ...scope(req.user!, dept) }).lean();
      ensure(r, 'NOT_FOUND: Record unavailable.');
      const requests =
        can(req.user!, service ? 'service_parts' : 'rnd_materials') ||
        (service && can(req.user!, 'service_billing', 'edit'))
          ? await MaterialRequestModel.find({ sourceId: r.id, sourceType: dept }).lean()
          : [];
      res.json({ ...viewRecord(req.user!, dept, r), requests });
    }),
  );
  departmentsRouter.post(
    base,
    requireAuth,
    requirePerm(main, 'create'),
    handle(async (req, res) => {
      const id = validateId(req.body.id),
        user = req.user!;
      ensure(!(await model.exists({ id })), 'CONCURRENCY_CONFLICT: Request already recorded.');
      const d = clean(
        service ? serviceCreate : projectCreate,
        service ? req.body : { type: 'New Development', priority: 'Normal', ...req.body },
      );
      if (service) {
        const unit = d.assetId ? await findUnit(d.assetId) : undefined;
        ensure(
          !d.assetId || (unit && (!d.customerId || unit.customerId === d.customerId)),
          'Delivered product does not match the selected customer.',
        );
        const c = d.customerId ? await CustomerModel.findOne({ id: d.customerId }).lean() : undefined;
        ensure(!d.customerId || c || unit?.customerId === d.customerId, 'Customer missing.');
        Object.assign(d, {
          customerName: unit?.customerName || c?.name || d.customerName,
          productName: unit?.productName || d.productName,
          serial: unit ? unit.serial : d.serial,
          model: unit?.model,
          email: unit?.email || c?.email,
          phone: d.phone || unit?.phone || c?.phone,
          contact: d.contact || unit?.contact || c?.contactPerson,
          customerId: unit?.customerId || d.customerId,
          deliveryOrder: unit?.deliveryOrder,
          salesOrder: unit?.salesOrder,
          productionOrder: unit?.productionOrder,
          address: unit?.address || c?.shippingAddress || c?.billingAddress,
          warranty: unit?.warranty,
          identifiable: unit?.identifiable,
        });
        ensure(
          d.customerName && d.productName,
          'Provide customer and product details for an unverified request.',
        );
      } else {
        await employee(d.employeeId, dept);
        ensure(!d.target || d.target >= d.start, 'Target date precedes start date.');
        if (d.productId) {
          const p = await ProductModel.findOne({ id: d.productId }).lean();
          ensure(p, 'Product not found.');
          d.productName = p.name;
          d.category ||= p.category;
        }
      }
      await attachment(d.attachment, main, id);
      const docNo = await repo.getNextDocNo(service ? 'SRV' : 'RND');
      const record = await model.create({
        id,
        docNo,
        createdBy: user.id,
        name: service ? d.customerName + ' / ' + d.productName : d.name,
        status: service ? 'Requested' : 'In Progress',
        employeeId: d.employeeId || '',
        assetId: d.assetId || '',
        details: d,
      });
      await repo.addActivity({
        actorId: user.id,
        actorName: user.name,
        department: dept,
        action: service ? 'Created service request' : 'Created project',
        entityType: service ? 'ServiceJob' : 'ResearchProject',
        entityId: id,
        entityDocNo: docNo,
        details: docNo + ' created',
      });
      res.status(201).json({ id: record.id, docNo });
    }),
  );
  departmentsRouter.post(
    base + '/:id/:action',
    requireAuth,
    handle(async (req, res) => {
      const action = String(req.params.action),
        op = Object.hasOwn(ops, action) ? ops[action] : undefined,
        user = req.user!;
      ensure(op && can(user, op.module, op.permission), 'FORBIDDEN: Action permission required.');
      const input = clean(op.fields, req.body),
        id = String(req.params.id);
      await attachment(input.attachment, op.module, id);
      const movement = ['request', 'parts', 'receive', 'use', 'return'].includes(action);
      const workflow =
        !service && action === 'complete'
          ? await ApprovalWorkflowModel.findOne({
              module: 'rnd_completion',
              triggerAction: 'submit',
              enabled: true,
            }).lean()
          : null;
      const result = await withTransaction(
        async (session) => {
          const r = await model
            .findOne({ id, ...scope(user, dept) })
            .session(session)
            .lean();
          ensure(r, 'NOT_FOUND: Record unavailable.');
          ensure(
            req.body.revision === r.revision,
            'CONCURRENCY_CONFLICT: Record changed. Reload before retrying.',
          );
          const d = { ...input };
          const entry: WorkEntry = {
            id: randomUUID(),
            action,
            actor: user.id,
            actorName: user.name,
            employeeId: r.employeeId,
            at: new Date().toISOString(),
            data: d,
          };
          let assigned = r.employeeId,
            assetId = r.assetId,
            details = r.details;
          if (action === 'assign') {
            const emp = await employee(d.employeeId, 'service');
            d.employeeName = emp.name;
            assigned = emp.id;
            entry.employeeId = emp.id;
            if (
              r.entries.filter((e) => e.action === 'receiveUnit').length >
              r.entries.filter((e) => e.action === 'returnUnit').length
            )
              ensure(d.location === 'CRYO Workshop', 'Return equipment before changing location.');
          }
          if (action === 'link') {
            const u = await findUnit(d.assetId);
            ensure(
              u?.identifiable && (!r.details.customerId || r.details.customerId === u.customerId),
              'Choose a verified unit for this customer.',
            );
            ensure(!r.assetId || !r.details.identifiable, 'Equipment is already verified.');
            assetId = u.id;
            details = {
              ...details,
              customerId: u.customerId,
              customerName: u.customerName,
              productName: u.productName,
              serial: u.serial,
              model: u.model,
              email: u.email || details.email,
              contact: u.contact || details.contact,
              phone: u.phone || details.phone,
              identifiable: true,
              assetId,
              address: u.address || details.address,
              deliveryOrder: u.deliveryOrder,
              salesOrder: u.salesOrder,
              productionOrder: u.productionOrder,
              warranty: u.warranty,
            };
          }
          const warranty = action === 'claim' && r.assetId ? await findUnit(r.assetId) : undefined;
          if (action === 'charges') {
            const requests = await MaterialRequestModel.find({ sourceId: id, sourceType: 'service' })
              .session(session)
              .lean();
            const lines = requests.flatMap((m) =>
              m.items
                .filter((i) => i.usedQty > 0)
                .map((i) => ({ key: m.id + '/' + i.materialId, coverage: i.coverage })),
            );
            for (const line of d.items.filter((i) => i.type === 'Spare Parts')) {
              if (!lines.length && !line.part) continue;
              const used = lines.find((i) => i.key === line.part);
              ensure(used, 'Select the used spare part for this charge.');
              if (used.coverage === 'Warranty-covered') line.coverage = used.coverage;
            }
          }
          let status = service
            ? serviceTransition(r, entry, warranty?.identifiable ? warranty.warranty.status : undefined)
            : researchTransition(r, action, d);
          if (action === 'bom') {
            const requested = await MaterialRequestModel.find({ sourceId: id, status: { $ne: 'Cancelled' } })
              .session(session)
              .lean();
            const totals = new Map<string, number>();
            for (const mr of requested)
              for (const line of mr.items)
                totals.set(line.materialId, (totals.get(line.materialId) || 0) + line.requiredQty);
            for (const [materialId, total] of totals)
              ensure(
                d.items.some((i) => i.materialId === materialId && i.quantity >= total),
                'BOM cannot fall below quantities already requested.',
              );
          }
          if (action === 'bom') d.items = await materialLines(d.items, session);
          if (movement) await applyMaterials(dept, r, entry, session!);
          if (action === 'complete' && service) {
            const requests = await MaterialRequestModel.find({ sourceId: r.id }).session(session).lean();
            d.pendingMaterials = requests.some((m) =>
              m.items.some(
                (i) =>
                  i.requiredQty !== i.issuedQty ||
                  i.issuedQty !== i.receivedQty ||
                  i.receivedQty !== (i.usedQty || 0) + (i.returnedQty || 0),
              ),
            );
          }
          if (workflow) {
            const requestId = randomUUID();
            const pending = await ApprovalRequestModel.exists({
              documentId: id,
              module: 'rnd_completion',
              status: 'pending',
            }).session(session);
            ensure(!pending, 'Completion is awaiting approval.');
            await ApprovalRequestModel.create(
              [
                {
                  id: requestId,
                  workflowId: workflow.id,
                  workflowName: workflow.name,
                  department: dept,
                  module: 'rnd_completion',
                  documentId: id,
                  documentDocNo: r.docNo,
                  documentVersion: String(r.revision + 1),
                  submittedBy: user,
                  submittedAt: entry.at,
                  documentSnapshot: d,
                  currentLevel: 1,
                  totalLevels: workflow.approvalLevels.length,
                  status: 'pending',
                  decisions: [],
                },
              ],
              { session },
            );
            status = 'Pending Completion Approval';
            d.approvalId = requestId;
          }
          ensure(r.status !== 'Pending Completion Approval', 'Completion is awaiting approval.');
          const saved = await model.updateOne(
            { id, revision: r.revision },
            {
              $inc: { revision: 1 },
              $set: {
                status,
                employeeId: assigned,
                assetId,
                details,
                ...(action === 'link' ? { name: details.customerName + ' / ' + details.productName } : {}),
              },
              $push: { entries: entry },
              ...(action === 'payment'
                ? { $addToSet: { paymentReferences: String(d.reference).trim().toUpperCase() } }
                : {}),
            },
            { session },
          );
          ensure(saved.modifiedCount, 'CONCURRENCY_CONFLICT: Record changed. Reload before retrying.');
          if (action === 'assign')
            await repo.addNotification(
              {
                department: 'service',
                recipientEmployeeId: assigned,
                title: 'Service visit scheduled',
                message: 'Your schedule has been updated.',
                severity: 'info',
                link: '/service/jobs/' + id,
              },
              session || undefined,
            );
          await repo.addActivity(
            {
              actorId: user.id,
              actorName: user.name,
              department: dept,
              action: op.label,
              entityType: service ? 'ServiceJob' : 'ResearchProject',
              entityId: id,
              entityDocNo: r.docNo,
              details: op.label,
            },
            session || undefined,
          );
          return { id, status, revision: r.revision + 1 };
        },
        { requireReplicaSet: movement || !!workflow },
      );
      res.json(result);
    }),
  );
}
departmentsRouter.get(
  '/service/jobs/:id/report/pdf',
  requireAuth,
  requirePerm('service_jobs', 'view'),
  handle(async (req, res) => {
    const r = await ServiceJob.findOne({ id: String(req.params.id), ...scope(req.user!, 'service') }).lean();
    ensure(r?.status === 'Completed', 'Completed service required.');
    const end = r.entries.find((e) => e.action === 'complete')!.data;
    const company = await CompanySettingsModel.findOne({ id: 'company' }).lean();
    ensure(company, 'Company settings missing.');
    const buffer = await pdfService.generatePDF(
      {
        title: 'Service Report',
        docNo: r.docNo,
        date: r.entries.find((e) => e.action === 'complete')!.at.slice(0, 10),
        status: r.status,
        referenceNo: r.details.serial || r.details.deliveryOrder,
        partyType: 'Customer',
        partyName: r.details.customerName,
        partyAddress: r.details.address,
        items: r.entries
          .filter((e) => e.action === 'update')
          .map((e) => ({ name: e.data.work, description: e.data.problem, quantity: 1 })),
        notes: [
          end.summary,
          end.condition,
          end.inspection,
          end.acknowledgement,
          end.pendingMaterials ? 'Material reconciliation pending' : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      company,
    );
    res
      .type('application/pdf')
      .attachment(r.docNo + '.pdf')
      .send(buffer);
  }),
);
