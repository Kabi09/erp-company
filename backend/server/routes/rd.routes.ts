import { Router } from 'express';
import {
  MaterialRequestModel,
  RDBOMModel,
  RDProjectModel,
  RDSpecificationModel,
  RDTestRecordModel,
  RDWorkUpdateModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError } from '../utils/routeUtils';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';

export const rdRouter = Router();

// ==========================================
// R&D PROJECTS (RND-xxxx)
// ==========================================

rdRouter.get('/rd/projects', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, projectType, leadEngineerId } = req.query;
    const filter: Record<string, any> = {};

    if (status) filter.status = status;
    if (projectType) filter.projectType = projectType;
    if (leadEngineerId) filter.leadEngineerId = leadEngineerId;

    const items = await RDProjectModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.get('/rd/projects/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const project = await RDProjectModel.findOne({
      $or: [{ id }, { projectCode: id }],
    }).lean();
    if (!project) throw new Error(`NOT_FOUND: R&D project '${id}' not found.`);

    const [specifications, bom, workUpdates, testRecords] = await Promise.all([
      RDSpecificationModel.find({ rdProjectId: project.id }).sort({ createdAt: -1 }).lean(),
      RDBOMModel.findOne({ rdProjectId: project.id }).lean(),
      RDWorkUpdateModel.find({ rdProjectId: project.id }).sort({ date: -1, createdAt: -1 }).lean(),
      RDTestRecordModel.find({ rdProjectId: project.id }).sort({ iteration: -1, createdAt: -1 }).lean(),
    ]);

    res.json({
      project,
      specifications: specifications[0] || null,
      bom,
      workUpdates,
      testRecords,
    });
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.post('/rd/projects', requireAuth, requirePerm('rd', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.title || !body.objective) {
      throw new Error('title and objective are required.');
    }

    const projectCode = await mongoERPRepository.getNextDocNo('RND');
    const doc = await RDProjectModel.create({
      id: generateId('RND'),
      projectCode,
      title: body.title.trim(),
      objective: body.objective.trim(),
      projectType: body.projectType || 'New Product Development',
      leadEngineerId: body.leadEngineerId || req.user!.id,
      leadEngineerName: body.leadEngineerName || req.user!.name,
      teamMembers: Array.isArray(body.teamMembers) ? body.teamMembers : [{ id: req.user!.id, name: req.user!.name, role: 'Lead Engineer' }],
      targetCompletionDate: body.targetCompletionDate || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      budgetEstimated: Number(body.budgetEstimated) || 500000,
      budgetUtilized: 0,
      status: 'Initiated',
      currentStage: body.currentStage || 'Concept & Requirements',
    });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'rd',
      action: 'Created R&D Project',
      entityType: 'RDProject',
      entityId: doc.id,
      entityDocNo: doc.projectCode,
      details: `Created R&D Project ${doc.projectCode}: "${doc.title}"`,
    });

    res.status(201).json(doc);
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.put('/rd/projects/:id', requireAuth, requirePerm('rd', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const project = await RDProjectModel.findOne({ id });
    if (!project) throw new Error(`NOT_FOUND: R&D project '${id}' not found.`);

    Object.assign(project, body);
    await project.save();

    res.json(project);
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * R&D Project Completion Gate:
 * ARCHITECTURAL MANDATE:
 * R&D is strictly independent from Production.
 * DO NOT create Production Orders from R&D completion.
 * DO NOT modify Product Master BOM from R&D.
 * DO NOT introduce a design-release-to-production gate.
 * 'Successfully Completed' is the final R&D status.
 */
rdRouter.post('/rd/projects/:id/complete', requireAuth, requirePerm('rd', 'confirm'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { finalConclusion } = req.body;

    const project = await RDProjectModel.findOne({ id });
    if (!project) throw new Error(`NOT_FOUND: R&D project '${id}' not found.`);

    project.status = 'Successfully Completed';
    project.currentStage = 'Validation Finalized';
    project.finalConclusion = finalConclusion || 'R&D experimental objectives and prototyping successfully achieved.';
    project.completedAt = new Date().toISOString();
    await project.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'rd',
      action: 'Completed R&D Project',
      entityType: 'RDProject',
      entityId: project.id,
      entityDocNo: project.projectCode,
      details: `Marked R&D Project ${project.projectCode} as Successfully Completed`,
    });

    res.json({ ok: true, project });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// PRODUCT SPECIFICATIONS
// ==========================================

rdRouter.get('/rd/projects/:id/specifications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const spec = await RDSpecificationModel.findOne({ rdProjectId: id }).lean();
    res.json(spec || { rdProjectId: id, parameters: [] });
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.post('/rd/projects/:id/specifications', requireAuth, requirePerm('rd', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { parameters, version, notes } = req.body;

    const project = await RDProjectModel.findOne({ id });
    if (!project) throw new Error(`NOT_FOUND: R&D project '${id}' not found.`);

    const specParameters = Array.isArray(parameters)
      ? parameters.map((p: any) => ({
          id: p.id || generateId('SPAR'),
          category: p.category || 'General',
          parameterName: p.parameterName,
          targetValue: p.targetValue,
          tolerance: p.tolerance || '',
          unit: p.unit || '',
          isCritical: Boolean(p.isCritical),
          notes: p.notes || '',
        }))
      : [];

    let spec = await RDSpecificationModel.findOne({ rdProjectId: project.id });
    if (!spec) {
      spec = await RDSpecificationModel.create({
        id: generateId('SPEC'),
        rdProjectId: project.id,
        version: version || '1.0',
        parameters: specParameters,
        approvedBy: req.user!.name,
        approvedAt: new Date().toISOString(),
        notes: notes || '',
      });
    } else {
      spec.parameters = specParameters;
      if (version) spec.version = version;
      if (notes !== undefined) spec.notes = notes;
      spec.approvedBy = req.user!.name;
      spec.approvedAt = new Date().toISOString();
      await spec.save();
    }

    if (project.status === 'Initiated') {
      project.status = 'Specification Done';
      project.currentStage = 'Specification Baseline Established';
      await project.save();
    }

    res.json(spec);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// PROTOTYPE BOM & MATERIALS
// ==========================================

rdRouter.get('/rd/projects/:id/bom', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const bom = await RDBOMModel.findOne({ rdProjectId: id }).lean();
    res.json(bom || { rdProjectId: id, items: [], totalEstimatedCost: 0 });
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.post('/rd/projects/:id/bom', requireAuth, requirePerm('rd', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { items, version } = req.body;

    const project = await RDProjectModel.findOne({ id });
    if (!project) throw new Error(`NOT_FOUND: R&D project '${id}' not found.`);

    const bomItems = Array.isArray(items)
      ? items.map((i: any) => ({
          id: i.id || generateId('BOMI'),
          materialId: i.materialId,
          name: i.name,
          partNumber: i.partNumber || '',
          category: i.category || 'Mechanical',
          quantityRequired: Number(i.quantityRequired) || 1,
          unit: i.unit || 'Nos',
          source: i.source || 'Stock',
          estimatedUnitCost: Number(i.estimatedUnitCost) || 0,
          totalCost: (Number(i.quantityRequired) || 1) * (Number(i.estimatedUnitCost) || 0),
          quantityRequested: Number(i.quantityRequested) || 0,
          quantityIssued: Number(i.quantityIssued) || 0,
          quantityConsumed: Number(i.quantityConsumed) || 0,
          notes: i.notes || '',
        }))
      : [];

    const totalEstimatedCost = bomItems.reduce((acc, curr) => acc + curr.totalCost, 0);

    let bom = await RDBOMModel.findOne({ rdProjectId: project.id });
    if (!bom) {
      bom = await RDBOMModel.create({
        id: generateId('RDBOM'),
        rdProjectId: project.id,
        version: version || '1.0',
        items: bomItems,
        totalEstimatedCost,
      });
    } else {
      bom.items = bomItems;
      bom.totalEstimatedCost = totalEstimatedCost;
      if (version) bom.version = version;
      await bom.save();
    }

    if (project.status === 'Initiated' || project.status === 'Specification Done') {
      project.status = 'Prototyping';
      project.currentStage = 'BOM Defined & Prototype Sourcing';
      await project.save();
    }

    res.json(bom);
  } catch (err) {
    sendError(res, err);
  }
});

// Requisition Prototype Materials to Supply Chain
rdRouter.post('/rd/projects/:id/material-request', requireAuth, requirePerm('rd', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { items, notes } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('At least one item is required for material request.');
    }

    const project = await RDProjectModel.findOne({ id });
    if (!project) throw new Error(`NOT_FOUND: R&D project '${id}' not found.`);

    const mrDocNo = await mongoERPRepository.getNextDocNo('MR');
    const bom = await RDBOMModel.findOne({ rdProjectId: project.id });

    const scMr = await MaterialRequestModel.create({
      id: generateId('MR'),
      docNo: mrDocNo,
      productionOrderId: project.id,
      productionOrderDocNo: `RND-${project.projectCode}`,
      salesOrderId: `RND-${project.id}`,
      salesOrderDocNo: project.projectCode,
      bomId: bom?.id || `BOM-${project.id}`,
      bomDocNo: bom ? `RND-BOM-v${bom.version}` : `BOM-${project.projectCode}`,
      productName: project.title,
      requestedBy: req.user!.name,
      department: 'rd',
      requestDate: new Date().toISOString().split('T')[0],
      requiredByDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority: 'High',
      status: 'Pending',
      receiptStatus: 'Pending',
      items: items.map((i: any, idx: number) => ({
        materialId: i.materialId || `mat-rd-${idx}`,
        materialCode: i.partNumber || i.materialCode || `RD-MAT-${idx + 1}`,
        materialName: i.name || i.materialName,
        requiredQty: Number(i.quantityRequested) || Number(i.quantityRequired) || 1,
        issuedQty: 0,
        receivedQty: 0,
        returnedQty: 0,
        unit: i.unit || 'Nos',
      })),
      notes: `R&D Prototype Requisition for Project ${project.projectCode}: "${project.title}". ${notes || ''}`,
    });

    // Update requested quantities in RDBOM if item matches
    if (bom) {
      items.forEach((reqItem: any) => {
        const found = bom.items.find(
          (b) => b.id === reqItem.id || b.name.toLowerCase() === (reqItem.name || '').toLowerCase(),
        );
        if (found) {
          found.quantityRequested = (found.quantityRequested || 0) + (Number(reqItem.quantityRequested) || 1);
        }
      });
      await bom.save();
    }

    res.status(201).json(scMr);
  } catch (err) {
    sendError(res, err);
  }
});

// Record Prototype Material Consumption
rdRouter.patch('/rd/projects/:id/bom/:itemId/consume', requireAuth, requirePerm('rd', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id, itemId } = req.params;
    const { quantityConsumed } = req.body;

    const bom = await RDBOMModel.findOne({ rdProjectId: id });
    if (!bom) throw new Error(`NOT_FOUND: BOM for project '${id}' not found.`);

    const item = bom.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`NOT_FOUND: Item '${itemId}' not found in BOM.`);

    const consumed = Number(quantityConsumed) || 0;
    item.quantityConsumed = (item.quantityConsumed || 0) + consumed;
    await bom.save();

    // Increment project budget utilization
    const addedCost = consumed * item.estimatedUnitCost;
    await RDProjectModel.updateOne({ id }, { $inc: { budgetUtilized: addedCost } });

    res.json(bom);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// DAILY R&D WORK UPDATES
// Supports: Multi-select Stages + Custom Stage + Multiple Highlights
// ==========================================

rdRouter.get('/rd/projects/:id/work-updates', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const updates = await RDWorkUpdateModel.find({ rdProjectId: id }).sort({ date: -1, createdAt: -1 }).lean();
    res.json(updates);
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.post('/rd/projects/:id/work-updates', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { date, selectedStages, customStage, hoursSpent, highlights, technicalObservations, attachments } = req.body;

    const project = await RDProjectModel.findOne({ id });
    if (!project) throw new Error(`NOT_FOUND: R&D project '${id}' not found.`);

    const updateDoc = await RDWorkUpdateModel.create({
      id: generateId('RWU'),
      rdProjectId: project.id,
      date: date || new Date().toISOString().split('T')[0],
      engineerId: req.user!.id,
      engineerName: req.user!.name,
      selectedStages: Array.isArray(selectedStages) ? selectedStages : [],
      customStage: customStage || '',
      hoursSpent: Number(hoursSpent) || 1,
      highlights: Array.isArray(highlights) ? highlights : [],
      technicalObservations: technicalObservations || '',
      attachments: Array.isArray(attachments) ? attachments : [],
      createdAt: new Date().toISOString(),
    });

    // Update project current stage if provided
    if (selectedStages && selectedStages.length > 0) {
      project.currentStage = selectedStages.join(', ');
      await project.save();
    } else if (customStage) {
      project.currentStage = customStage;
      await project.save();
    }

    res.status(201).json(updateDoc);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// PROTOTYPE TESTING & VALIDATION
// Supports: Dynamic Checklist (Pass/Fail/Pending) + Retesting History
// ==========================================

rdRouter.get('/rd/projects/:id/tests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tests = await RDTestRecordModel.find({ rdProjectId: id }).sort({ iteration: -1, createdAt: -1 }).lean();
    res.json(tests);
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.post('/rd/projects/:id/tests', requireAuth, requirePerm('rd', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { testName, testProtocolNumber, checklist, environmentalConditions, testNotes } = req.body;

    if (!testName) throw new Error('testName is required.');

    const project = await RDProjectModel.findOne({ id });
    if (!project) throw new Error(`NOT_FOUND: R&D project '${id}' not found.`);

    const checklistItems = Array.isArray(checklist)
      ? checklist.map((c: any) => ({
          id: c.id || generateId('TCK'),
          parameterOrCheck: c.parameterOrCheck,
          expectedCondition: c.expectedCondition,
          measuredValue: c.measuredValue || '',
          result: c.result || 'Pending',
          remarks: c.remarks || '',
        }))
      : [];

    const hasFailure = checklistItems.some((c) => c.result === 'Fail');
    const allPass = checklistItems.length > 0 && checklistItems.every((c) => c.result === 'Pass');
    const status = allPass ? 'Passed' : hasFailure ? 'Failed' : 'In Progress';

    const testDoc = await RDTestRecordModel.create({
      id: generateId('RTEST'),
      rdProjectId: project.id,
      testName: testName.trim(),
      testProtocolNumber: testProtocolNumber || '',
      iteration: 1,
      testDate: new Date().toISOString().split('T')[0],
      testedById: req.user!.id,
      testedByName: req.user!.name,
      status,
      checklist: checklistItems,
      environmentalConditions: environmentalConditions || '',
      testNotes: testNotes || '',
      retestRequired: hasFailure,
    });

    if (project.status !== 'Testing' && project.status !== 'Successfully Completed') {
      project.status = 'Testing';
      project.currentStage = `Prototype Testing: ${testName}`;
      await project.save();
    }

    res.status(201).json(testDoc);
  } catch (err) {
    sendError(res, err);
  }
});

// Log Retest Iteration (Iteration 2, 3...)
rdRouter.post('/rd/projects/:id/tests/:testId/retest', requireAuth, requirePerm('rd', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id, testId } = req.params;
    const { checklist, environmentalConditions, testNotes, retestReason } = req.body;

    const previousTest = await RDTestRecordModel.findOne({ id: testId });
    if (!previousTest) throw new Error(`NOT_FOUND: Test record '${testId}' not found.`);

    const nextIteration = previousTest.iteration + 1;

    const checklistItems = Array.isArray(checklist)
      ? checklist.map((c: any) => ({
          id: c.id || generateId('TCK'),
          parameterOrCheck: c.parameterOrCheck,
          expectedCondition: c.expectedCondition,
          measuredValue: c.measuredValue || '',
          result: c.result || 'Pending',
          remarks: c.remarks || '',
        }))
      : previousTest.checklist;

    const hasFailure = checklistItems.some((c) => c.result === 'Fail');
    const allPass = checklistItems.length > 0 && checklistItems.every((c) => c.result === 'Pass');
    const status = allPass ? 'Passed' : hasFailure ? 'Failed' : 'In Progress';

    const retestDoc = await RDTestRecordModel.create({
      id: generateId('RTEST'),
      rdProjectId: id,
      testName: previousTest.testName,
      testProtocolNumber: previousTest.testProtocolNumber,
      iteration: nextIteration,
      testDate: new Date().toISOString().split('T')[0],
      testedById: req.user!.id,
      testedByName: req.user!.name,
      status,
      checklist: checklistItems,
      environmentalConditions: environmentalConditions || previousTest.environmentalConditions,
      testNotes: testNotes || '',
      retestRequired: hasFailure,
      retestReason: retestReason || `Iteration ${nextIteration} Retest`,
    });

    res.status(201).json(retestDoc);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// R&D DASHBOARD & GLOBAL AGGREGATE ENDPOINTS
// ==========================================

rdRouter.get('/rd/specifications', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const specs = await RDSpecificationModel.find().lean();
    const projects = await RDProjectModel.find().lean();
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    const enriched = specs.map((s) => {
      const proj = projectMap.get(s.rdProjectId);
      return {
        ...s,
        projectCode: proj?.projectCode || 'RND-???',
        projectTitle: proj?.title || 'Unknown Project',
        projectStatus: proj?.status || 'Unknown',
        leadEngineerName: proj?.leadEngineerName || 'Unknown',
      };
    });

    res.json(enriched);
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.get('/rd/boms', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const boms = await RDBOMModel.find().lean();
    const projects = await RDProjectModel.find().lean();
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    const enriched = boms.map((b) => {
      const proj = projectMap.get(b.rdProjectId);
      return {
        ...b,
        projectCode: proj?.projectCode || 'RND-???',
        projectTitle: proj?.title || 'Unknown Project',
        projectStatus: proj?.status || 'Unknown',
        leadEngineerName: proj?.leadEngineerName || 'Unknown',
      };
    });

    res.json(enriched);
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.get('/rd/work-updates', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const updates = await RDWorkUpdateModel.find().sort({ date: -1, createdAt: -1 }).lean();
    const projects = await RDProjectModel.find().lean();
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    const enriched = updates.map((u) => {
      const proj = projectMap.get(u.rdProjectId);
      return {
        ...u,
        projectCode: proj?.projectCode || 'RND-???',
        projectTitle: proj?.title || 'Unknown Project',
      };
    });

    res.json(enriched);
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.get('/rd/tests', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const tests = await RDTestRecordModel.find().sort({ testDate: -1, createdAt: -1 }).lean();
    const projects = await RDProjectModel.find().lean();
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    const enriched = tests.map((t) => {
      const proj = projectMap.get(t.rdProjectId);
      return {
        ...t,
        projectCode: proj?.projectCode || 'RND-???',
        projectTitle: proj?.title || 'Unknown Project',
      };
    });

    res.json(enriched);
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.get('/rd/reports', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const [projects, boms, updates, tests] = await Promise.all([
      RDProjectModel.find().lean(),
      RDBOMModel.find().lean(),
      RDWorkUpdateModel.find().lean(),
      RDTestRecordModel.find().lean(),
    ]);

    const totalProjects = projects.length;
    const completedProjects = projects.filter((p) => p.status === 'Successfully Completed').length;
    const activeProjects = totalProjects - completedProjects;

    const totalEstimatedBudget = projects.reduce((acc, p) => acc + (p.budgetEstimated || 0), 0);
    const totalUtilizedBudget = projects.reduce((acc, p) => acc + (p.budgetUtilized || 0), 0);
    const totalBOMCost = boms.reduce((acc, b) => acc + (b.totalEstimatedCost || 0), 0);
    const totalEngineeringHours = updates.reduce((acc, u) => acc + (u.hoursSpent || 0), 0);

    const totalTests = tests.length;
    const passedTests = tests.filter((t) => t.status === 'Passed').length;
    const failedTests = tests.filter((t) => t.status === 'Failed').length;
    const inProgressTests = tests.filter((t) => t.status === 'In Progress').length;
    const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
    const retestIterations = tests.filter((t) => (t.iteration || 1) > 1).length;

    const stageBreakdown = projects.reduce((acc: Record<string, number>, p) => {
      const stage = p.currentStage || 'Concept & Requirements';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});

    const statusBreakdown = projects.reduce((acc: Record<string, number>, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      summary: {
        totalProjects,
        activeProjects,
        completedProjects,
        totalEstimatedBudget,
        totalUtilizedBudget,
        budgetBurnRate: totalEstimatedBudget > 0 ? Math.round((totalUtilizedBudget / totalEstimatedBudget) * 100) : 0,
        totalBOMCost,
        totalEngineeringHours,
        totalTests,
        passedTests,
        failedTests,
        inProgressTests,
        passRate,
        retestIterations,
      },
      stageBreakdown,
      statusBreakdown,
      projectList: projects.map((p) => ({
        id: p.id,
        code: p.projectCode,
        title: p.title,
        status: p.status,
        stage: p.currentStage,
        budgetEstimated: p.budgetEstimated,
        budgetUtilized: p.budgetUtilized,
        burnRate: p.budgetEstimated > 0 ? Math.round((p.budgetUtilized / p.budgetEstimated) * 100) : 0,
      })),
    });
  } catch (err) {
    sendError(res, err);
  }
});

rdRouter.get('/rd/dashboard', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const [
      totalProjects,
      activeProjects,
      prototypingCount,
      testingCount,
      completedProjects,
      allProjects,
    ] = await Promise.all([
      RDProjectModel.countDocuments(),
      RDProjectModel.countDocuments({ status: { $in: ['Initiated', 'Specification Done', 'Prototyping', 'Testing'] } }),
      RDProjectModel.countDocuments({ status: 'Prototyping' }),
      RDProjectModel.countDocuments({ status: 'Testing' }),
      RDProjectModel.countDocuments({ status: 'Successfully Completed' }),
      RDProjectModel.find().lean(),
    ]);

    const totalBudget = allProjects.reduce((acc, curr) => acc + (curr.budgetEstimated || 0), 0);
    const totalUtilized = allProjects.reduce((acc, curr) => acc + (curr.budgetUtilized || 0), 0);

    res.json({
      totalProjects,
      activeProjects,
      prototypingCount,
      testingCount,
      completedProjects,
      totalBudget,
      totalUtilized,
      budgetBurnRate: totalBudget > 0 ? Math.round((totalUtilized / totalBudget) * 100) : 0,
    });
  } catch (err) {
    sendError(res, err);
  }
});
