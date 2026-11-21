import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type {
  RDBOM,
  RDBOMItem,
  RDProject,
  RDSpecParameter,
  RDSpecification,
  RDTestItem,
  RDTestRecord,
  RDWorkUpdate,
} from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

const PREDEFINED_STAGES = [
  'Design & Thermal Simulation',
  'Frame & Structural Fabrication',
  'Evaporator & Piping Brazing',
  'Cascade System Electrical Wiring',
  'Microcontroller & Sensor Integration',
  'Vacuum Dehydration & Leak Testing',
  'Mixed Refrigerant Gas Charging',
  'Insulation & Outer Enclosure Curing',
];

export const RDProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, toast, can } = useERP();
  const navigate = useNavigate();

  const [project, setProject] = useState<RDProject | null>(null);
  const [spec, setSpec] = useState<RDSpecification | null>(null);
  const [bom, setBom] = useState<RDBOM | null>(null);
  const [updates, setUpdates] = useState<RDWorkUpdate[]>([]);
  const [tests, setTests] = useState<RDTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Modals
  const [specModalOpen, setSpecModalOpen] = useState(false);
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const [mrModalOpen, setMrModalOpen] = useState(false);
  const [consumeModalOpen, setConsumeModalOpen] = useState(false);
  const [selectedBomItem, setSelectedBomItem] = useState<RDBOMItem | null>(null);
  const [consumeQty, setConsumeQty] = useState(1);
  const [workUpdateOpen, setWorkUpdateOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [retestModalOpen, setRetestModalOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<RDTestRecord | null>(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Forms
  const [specParameters, setSpecParameters] = useState<RDSpecParameter[]>([
    { id: '1', category: 'Thermal', parameterName: 'Ultimate Low Temperature', targetValue: '-86', tolerance: '±1', unit: '°C' },
    { id: '2', category: 'Thermal', parameterName: 'Pull-down Time (+25°C to -86°C)', targetValue: '180', tolerance: '<= 210', unit: 'Min' },
    { id: '3', category: 'Electrical', parameterName: 'Power Consumption (Steady State)', targetValue: '950', tolerance: '±50', unit: 'Watts' },
    { id: '4', category: 'Acoustic', parameterName: 'Noise Level (1 Meter)', targetValue: '48', tolerance: '<= 52', unit: 'dBA' },
  ]);

  const [bomItems, setBomItems] = useState<Array<Omit<RDBOMItem, 'id' | 'totalCost' | 'quantityRequested' | 'quantityIssued' | 'quantityConsumed'>>>([
    { name: 'Secop Low-Temp Hermetic Compressor 1.5HP', partNumber: 'SC-150-LT', category: 'Refrigeration', quantityRequired: 1, unit: 'Nos', source: 'Stock', estimatedUnitCost: 42000 },
    { name: 'Copper Tubing 3/8" Refrigerant Grade (Roll)', partNumber: 'CU-38-REF', category: 'Piping', quantityRequired: 3, unit: 'Rolls', source: 'Stock', estimatedUnitCost: 6500 },
    { name: 'Micro-Channel Auxiliary Condenser Coil', partNumber: 'MC-COND-400', category: 'Heat Exchanger', quantityRequired: 1, unit: 'Nos', source: 'Procurement', estimatedUnitCost: 14500 },
  ]);

  const [selectedMrItems, setSelectedMrItems] = useState<Array<{ name: string; quantityRequested: number; unit: string }>>([]);

  const [workUpdateForm, setWorkUpdateForm] = useState({
    selectedStages: ['Frame & Structural Fabrication'],
    customStage: '',
    hoursSpent: 4,
    highlights: ['Cut and TIG-welded base structural frame', 'Deburred all mounting flanges'],
    newHighlightText: '',
    technicalObservations: 'Structural rigidity verified under static load test. No vibration resonance.',
  });

  const [testForm, setTestForm] = useState({
    testName: 'Cascade Pull-Down Performance Validation',
    testProtocolNumber: 'TP-RND-001',
    environmentalConditions: 'Ambient temperature: 24.5°C, Relative Humidity: 55%',
    testNotes: 'Continuous data logger recording every 30 seconds.',
    checklist: [
      { id: '1', parameterOrCheck: 'Pull-down to -40°C Stage 1', expectedCondition: '<= 60 Mins', measuredValue: '52 Mins', result: 'Pass' as const },
      { id: '2', parameterOrCheck: 'Pull-down to -86°C Stage 2', expectedCondition: '<= 180 Mins', measuredValue: '174 Mins', result: 'Pass' as const },
      { id: '3', parameterOrCheck: 'Steady state cabinet stability', expectedCondition: '±0.5°C over 4 hours', measuredValue: '±0.3°C', result: 'Pass' as const },
      { id: '4', parameterOrCheck: 'Compressor discharge temperature', expectedCondition: '<= 95°C', measuredValue: '88°C', result: 'Pass' as const },
    ],
  });

  const [retestForm, setRetestForm] = useState({
    retestReason: 'Secondary cycle thermostatic valve orifice recalibrated.',
    environmentalConditions: 'Ambient 25°C',
    testNotes: 'Retesting after orifice adjustment.',
    checklist: [] as RDTestItem[],
  });

  const [finalConclusion, setFinalConclusion] = useState(
    'All prototype design specifications, thermal pull-down performance parameters, and electrical safety tests have passed full engineering validation.',
  );

  const loadProject = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await erpApi.getRDProjectDetail(id);
      setProject(res.project);
      setSpec(res.specifications);
      if (res.specifications?.parameters?.length) {
        setSpecParameters(res.specifications.parameters);
      }
      setBom(res.bom);
      setUpdates(res.workUpdates);
      setTests(res.testRecords);
    } catch (e: any) {
      toast('error', 'Failed to load project details', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  const handleSaveSpecs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.saveRDSpecifications(project.id, {
        parameters: specParameters,
        version: spec ? `${(parseFloat(spec.version) + 0.1).toFixed(1)}` : '1.0',
      });
      toast('success', 'Product Specifications Saved');
      setSpecModalOpen(false);
      await loadProject();
    } catch (e: any) {
      setErr(e.message || 'Saving specifications failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveBom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.saveRDBOM(project.id, {
        items: bomItems,
      });
      toast('success', 'Prototype BOM Saved');
      setBomModalOpen(false);
      await loadProject();
    } catch (e: any) {
      setErr(e.message || 'Saving BOM failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestMaterials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.requestRDMaterials(project.id, {
        items: selectedMrItems,
      });
      toast('success', 'Requisition Dispatched to Supply Chain');
      setMrModalOpen(false);
      await loadProject();
    } catch (e: any) {
      setErr(e.message || 'Material request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConsumeItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !selectedBomItem) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.consumeRDBOMItem(project.id, selectedBomItem.id, {
        quantityConsumed: consumeQty,
      });
      toast('success', 'Material Consumption Recorded');
      setConsumeModalOpen(false);
      setSelectedBomItem(null);
      await loadProject();
    } catch (e: any) {
      setErr(e.message || 'Recording consumption failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createRDWorkUpdate(project.id, {
        selectedStages: workUpdateForm.selectedStages,
        customStage: workUpdateForm.customStage,
        hoursSpent: workUpdateForm.hoursSpent,
        highlights: workUpdateForm.highlights,
        technicalObservations: workUpdateForm.technicalObservations,
      });
      toast('success', 'Daily R&D Work Update Logged');
      setWorkUpdateOpen(false);
      await loadProject();
    } catch (e: any) {
      setErr(e.message || 'Logging work update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createRDTest(project.id, testForm);
      toast('success', 'Test Protocol Execution Saved');
      setTestModalOpen(false);
      await loadProject();
    } catch (e: any) {
      setErr(e.message || 'Saving test failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRetest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !selectedTest) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createRDRetest(project.id, selectedTest.id, retestForm);
      toast('success', 'Retest Iteration Recorded');
      setRetestModalOpen(false);
      setSelectedTest(null);
      await loadProject();
    } catch (e: any) {
      setErr(e.message || 'Retest failed.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * CRITICAL ARCHITECTURAL MANDATE:
   * R&D is strictly independent from Production.
   * DO NOT create Production Orders from R&D completion.
   * DO NOT modify Product Master BOM from R&D.
   * DO NOT introduce a design-release-to-production gate.
   * 'Successfully Completed' is the final R&D status.
   */
  const handleCompleteProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.completeRDProject(project.id, {
        finalConclusion,
      });
      toast('success', 'R&D Project Marked Successfully Completed');
      setCompleteModalOpen(false);
      await loadProject();
    } catch (e: any) {
      setErr(e.message || 'Project closure failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !project) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading R&D Project Workspace...</div>;
  }

  const tabs = [
    { id: 'overview', label: 'Overview & Objectives' },
    { id: 'spec', label: `Specifications (${spec?.parameters.length || specParameters.length})` },
    { id: 'bom', label: `Prototype BOM (${bom?.items.length || 0})` },
    { id: 'updates', label: `Daily Updates (${updates.length})` },
    { id: 'testing', label: `Testing & Retests (${tests.length})` },
    { id: 'archive', label: 'Completion Archive' },
  ];

  const burnRate = project.budgetEstimated > 0 ? Math.round((project.budgetUtilized / project.budgetEstimated) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/rd/projects')} className="text-xs">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Projects
        </Button>
        <div className="flex items-center gap-2">
          {project.status !== 'Successfully Completed' && can('rd', 'confirm') && (
            <Button size="sm" variant="success" onClick={() => setCompleteModalOpen(true)}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Mark Successfully Completed
            </Button>
          )}
        </div>
      </div>

      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">
                {project.projectCode}
              </h2>
              <StatusBadge status={project.status} />
              <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 rounded">
                {project.projectType}
              </span>
            </div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
              {project.title}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Current Stage: <span className="font-semibold text-slate-700 dark:text-slate-300">{project.currentStage}</span> • Lead Engineer: <span className="font-semibold">{project.leadEngineerName}</span>
            </p>
          </div>

          <div className="w-48 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Budget Burn Rate:</span>
              <span className="font-semibold">{burnRate}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${Math.min(100, burnRate)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>{formatCurrency(project.budgetUtilized)}</span>
              <span>of {formatCurrency(project.budgetEstimated)}</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Research Scope &amp; Target Milestones
              </h3>
              <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-800 leading-relaxed">
                {project.objective}
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2 text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-400 block">Target Completion</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{project.targetCompletionDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Created On</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{project.createdAt.split('T')[0]}</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Engineering Project Team
              </h3>
              <div className="space-y-2">
                {project.teamMembers.map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{m.name}</span>
                    <span className="text-slate-500 font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SPECIFICATIONS */}
      {activeTab === 'spec' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Design Specifications Baseline {spec ? `(Version ${spec.version})` : ''}
            </h3>
            {can('rd', 'edit') && (
              <Button size="sm" onClick={() => setSpecModalOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Edit / Add Specifications
              </Button>
            )}
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">Category</th>
                  <th className="p-3">Parameter Name</th>
                  <th className="p-3">Target Value</th>
                  <th className="p-3">Tolerance</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {specParameters.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3 font-medium text-slate-500">{p.category || 'Mechanical'}</td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{p.parameterName}</td>
                    <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{p.targetValue}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{p.tolerance || '-'}</td>
                    <td className="p-3 text-slate-500">{p.unit || '-'}</td>
                    <td className="p-3 text-slate-500">{p.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PROTOTYPE BOM */}
      {activeTab === 'bom' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Prototype Experimental Bill of Materials (BOM)
            </h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (bom?.items) {
                    setSelectedMrItems(
                      bom.items.map((i) => ({ name: i.name, quantityRequested: i.quantityRequired, unit: i.unit })),
                    );
                  }
                  setMrModalOpen(true);
                }}
              >
                <Boxes className="w-3.5 h-3.5 mr-1" />
                Request Materials from Stores
              </Button>
              {can('rd', 'edit') && (
                <Button size="sm" onClick={() => setBomModalOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Define BOM Components
                </Button>
              )}
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">Component / Material</th>
                  <th className="p-3">Part #</th>
                  <th className="p-3">Source</th>
                  <th className="p-3 text-right">Required</th>
                  <th className="p-3 text-right">Unit Cost</th>
                  <th className="p-3 text-right">Total Cost</th>
                  <th className="p-3 text-right">Consumed</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(bom?.items || []).map((it) => (
                  <tr key={it.id}>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{it.name}</td>
                    <td className="p-3 font-mono text-slate-500">{it.partNumber || '-'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800">
                        {it.source}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{it.quantityRequired} {it.unit}</td>
                    <td className="p-3 text-right">{formatCurrency(it.estimatedUnitCost)}</td>
                    <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(it.totalCost)}
                    </td>
                    <td className="p-3 text-right font-bold text-indigo-600">
                      {it.quantityConsumed} {it.unit}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedBomItem(it);
                          setConsumeQty(1);
                          setConsumeModalOpen(true);
                        }}
                        className="text-xs h-6 px-2"
                      >
                        Log Consumption
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: DAILY WORK UPDATES */}
      {activeTab === 'updates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Daily Fabrication &amp; Engineering Activity Logs
            </h3>
            <Button size="sm" onClick={() => setWorkUpdateOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Log Daily Work Update
            </Button>
          </div>

          {!updates.length ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              No daily engineering activity updates logged yet.
            </div>
          ) : (
            <div className="space-y-4">
              {updates.map((u) => (
                <div
                  key={u.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {u.selectedStages.join(', ') || u.customStage || 'General Assembly'}
                      </span>
                      <span className="text-slate-500 ml-2">by {u.engineerName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>Date: {u.date}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {u.hoursSpent} hrs
                      </span>
                    </div>
                  </div>

                  {u.highlights && u.highlights.length > 0 && (
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Work Highlights:
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-400">
                        {u.highlights.map((h, idx) => (
                          <li key={idx}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {u.technicalObservations && (
                    <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-0.5">
                        Technical Observations:
                      </span>
                      {u.technicalObservations}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: TESTING & VALIDATION */}
      {activeTab === 'testing' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Prototype Test Protocols &amp; Iteration Retests
            </h3>
            <Button size="sm" onClick={() => setTestModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Test Protocol Run
            </Button>
          </div>

          {!tests.length ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              No test validation runs recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {tests.map((t) => (
                <div
                  key={t.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {t.testName}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                        Iteration {t.iteration}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">{t.testDate}</span>
                      {t.status === 'Failed' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedTest(t);
                            setRetestForm({
                              retestReason: `Retest for failed parameters in Iteration ${t.iteration}`,
                              environmentalConditions: t.environmentalConditions || '',
                              testNotes: '',
                              checklist: t.checklist.map((c) => ({ ...c })),
                            });
                            setRetestModalOpen(true);
                          }}
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-1" />
                          Retest (Iteration {t.iteration + 1})
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="p-2.5">Parameter / Check</th>
                          <th className="p-2.5">Expected Condition</th>
                          <th className="p-2.5">Measured Value</th>
                          <th className="p-2.5 w-24">Result</th>
                          <th className="p-2.5">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {t.checklist.map((chk) => (
                          <tr key={chk.id}>
                            <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{chk.parameterOrCheck}</td>
                            <td className="p-2.5 text-slate-500">{chk.expectedCondition}</td>
                            <td className="p-2.5 font-mono font-bold text-slate-900 dark:text-slate-100">{chk.measuredValue}</td>
                            <td className="p-2.5">
                              <StatusBadge status={chk.result} />
                            </td>
                            <td className="p-2.5 text-slate-500">{chk.remarks || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: COMPLETION ARCHIVE */}
      {activeTab === 'archive' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            R&D Innovation Completion Archive &amp; Validation Ledger
          </div>

          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-2 text-xs">
            <span className="font-bold text-emerald-900 dark:text-emerald-200 block text-sm">
              Status: {project.status}
            </span>
            <p className="text-emerald-800 dark:text-emerald-300">
              {project.finalConclusion || 'Project is in progress. When objectives are met, mark Successfully Completed.'}
            </p>
            {project.completedAt && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Completed Date: {new Date(project.completedAt).toLocaleString()}
              </div>
            )}
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200 block">
              Architectural Isolation Guarantee:
            </span>
            <p>
              R&D Management operates as an independent innovation laboratory. Completed prototypes and engineering experimental BOMs remain permanently archived in the R&D ledger and do not alter production master recipes.
            </p>
          </div>
        </div>
      )}

      {/* Edit Specifications Modal */}
      <Modal open={specModalOpen} onClose={() => setSpecModalOpen(false)} title="Define Product Specifications" size="lg">
        <form onSubmit={handleSaveSpecs} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="space-y-3">
            {specParameters.map((p, idx) => (
              <div key={idx} className="p-3 border border-slate-200 dark:border-slate-800 rounded-md grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <Input
                    placeholder="Category"
                    value={p.category}
                    onChange={(e) => {
                      const next = [...specParameters];
                      next[idx].category = e.target.value;
                      setSpecParameters(next);
                    }}
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    placeholder="Parameter Name"
                    value={p.parameterName}
                    onChange={(e) => {
                      const next = [...specParameters];
                      next[idx].parameterName = e.target.value;
                      setSpecParameters(next);
                    }}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    placeholder="Target"
                    value={p.targetValue}
                    onChange={(e) => {
                      const next = [...specParameters];
                      next[idx].targetValue = e.target.value;
                      setSpecParameters(next);
                    }}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    placeholder="Unit"
                    value={p.unit}
                    onChange={(e) => {
                      const next = [...specParameters];
                      next[idx].unit = e.target.value;
                      setSpecParameters(next);
                    }}
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSpecParameters(specParameters.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setSpecParameters([...specParameters, { id: String(Date.now()), category: 'Mechanical', parameterName: '', targetValue: '', tolerance: '', unit: '' }])}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Parameter Row
          </Button>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setSpecModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Specifications
            </Button>
          </div>
        </form>
      </Modal>

      {/* Define Prototype BOM Modal */}
      <Modal open={bomModalOpen} onClose={() => setBomModalOpen(false)} title="Define Prototype BOM Components" size="lg">
        <form onSubmit={handleSaveBom} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="space-y-3">
            {bomItems.map((b, idx) => (
              <div key={idx} className="p-3 border border-slate-200 dark:border-slate-800 rounded-md grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <Input
                    placeholder="Component Name"
                    value={b.name}
                    onChange={(e) => {
                      const next = [...bomItems];
                      next[idx].name = e.target.value;
                      setBomItems(next);
                    }}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    placeholder="Part #"
                    value={b.partNumber}
                    onChange={(e) => {
                      const next = [...bomItems];
                      next[idx].partNumber = e.target.value;
                      setBomItems(next);
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={b.quantityRequired}
                    onChange={(e) => {
                      const next = [...bomItems];
                      next[idx].quantityRequired = Number(e.target.value);
                      setBomItems(next);
                    }}
                    required
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    placeholder="Est Unit Cost"
                    value={b.estimatedUnitCost}
                    onChange={(e) => {
                      const next = [...bomItems];
                      next[idx].estimatedUnitCost = Number(e.target.value);
                      setBomItems(next);
                    }}
                    required
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBomItems(bomItems.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setBomItems([...bomItems, { name: '', partNumber: '', category: 'Mechanical', quantityRequired: 1, unit: 'Nos', source: 'Stock', estimatedUnitCost: 0 }])}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add BOM Component
          </Button>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setBomModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Prototype BOM
            </Button>
          </div>
        </form>
      </Modal>

      {/* Log Material Consumption Modal */}
      <Modal open={consumeModalOpen} onClose={() => setConsumeModalOpen(false)} title="Log Prototype Material Consumption">
        <form onSubmit={handleConsumeItem} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="text-xs">
            Component: <span className="font-semibold">{selectedBomItem?.name}</span> (Est Cost: {formatCurrency(selectedBomItem?.estimatedUnitCost || 0)})
          </div>
          <Field label="Quantity Consumed into Prototype" required>
            <Input
              type="number"
              min="1"
              value={consumeQty}
              onChange={(e) => setConsumeQty(Number(e.target.value))}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setConsumeModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Record Consumption
            </Button>
          </div>
        </form>
      </Modal>

      {/* Log Daily Work Update Modal (Multi-select stages + Custom Stage + Highlights) */}
      <Modal open={workUpdateOpen} onClose={() => setWorkUpdateOpen(false)} title="Log Daily R&D Engineering Update" size="lg">
        <form onSubmit={handleWorkUpdate} className="space-y-4">
          {err && <ErrorBanner message={err} />}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Manufacturing / R&amp;D Stages (Multi-Select)
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {PREDEFINED_STAGES.map((st) => (
                <label key={st} className="flex items-center gap-2 cursor-pointer p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={workUpdateForm.selectedStages.includes(st)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setWorkUpdateForm({
                          ...workUpdateForm,
                          selectedStages: [...workUpdateForm.selectedStages, st],
                        });
                      } else {
                        setWorkUpdateForm({
                          ...workUpdateForm,
                          selectedStages: workUpdateForm.selectedStages.filter((s) => s !== st),
                        });
                      }
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{st}</span>
                </label>
              ))}
            </div>
          </div>

          <Field label="Custom Stage (Optional)">
            <Input
              placeholder="Or define a custom experimental stage..."
              value={workUpdateForm.customStage}
              onChange={(e) => setWorkUpdateForm({ ...workUpdateForm, customStage: e.target.value })}
            />
          </Field>

          <Field label="Engineering Hours Spent" required>
            <Input
              type="number"
              min="0.5"
              step="0.5"
              value={workUpdateForm.hoursSpent}
              onChange={(e) => setWorkUpdateForm({ ...workUpdateForm, hoursSpent: Number(e.target.value) })}
              required
            />
          </Field>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Daily Work Highlights
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a work highlight or breakthrough..."
                value={workUpdateForm.newHighlightText}
                onChange={(e) => setWorkUpdateForm({ ...workUpdateForm, newHighlightText: e.target.value })}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (workUpdateForm.newHighlightText.trim()) {
                    setWorkUpdateForm({
                      ...workUpdateForm,
                      highlights: [...workUpdateForm.highlights, workUpdateForm.newHighlightText.trim()],
                      newHighlightText: '',
                    });
                  }
                }}
              >
                Add
              </Button>
            </div>
            <ul className="list-disc list-inside text-xs text-slate-600 dark:text-slate-400 space-y-1">
              {workUpdateForm.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>

          <Field label="Technical Observations &amp; Learnings">
            <Textarea
              value={workUpdateForm.technicalObservations}
              onChange={(e) => setWorkUpdateForm({ ...workUpdateForm, technicalObservations: e.target.value })}
              rows={2}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setWorkUpdateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Update
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Test Modal (Dynamic Checklist) */}
      <Modal open={testModalOpen} onClose={() => setTestModalOpen(false)} title="New Prototype Test Protocol Execution" size="lg">
        <form onSubmit={handleCreateTest} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Test Protocol Name" required>
              <Input
                value={testForm.testName}
                onChange={(e) => setTestForm({ ...testForm, testName: e.target.value })}
                required
              />
            </Field>
            <Field label="Protocol #">
              <Input
                value={testForm.testProtocolNumber}
                onChange={(e) => setTestForm({ ...testForm, testProtocolNumber: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Environmental Conditions">
            <Input
              value={testForm.environmentalConditions}
              onChange={(e) => setTestForm({ ...testForm, environmentalConditions: e.target.value })}
            />
          </Field>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Inspection &amp; Validation Checklist
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {testForm.checklist.map((chk, idx) => (
                <div key={chk.id} className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-800 dark:text-slate-200 flex-1">{chk.parameterOrCheck}</span>
                  <Input
                    placeholder="Measured"
                    value={chk.measuredValue}
                    onChange={(e) => {
                      const next = [...testForm.checklist];
                      next[idx].measuredValue = e.target.value;
                      setTestForm({ ...testForm, checklist: next });
                    }}
                    className="w-28 text-xs py-1"
                  />
                  <Select
                    value={chk.result}
                    onChange={(e) => {
                      const next = [...testForm.checklist];
                      next[idx].result = e.target.value as any;
                      setTestForm({ ...testForm, checklist: next });
                    }}
                    className="w-24 text-xs py-1"
                  >
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                    <option value="Pending">Pending</option>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setTestModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Test Protocol
            </Button>
          </div>
        </form>
      </Modal>

      {/* Retest Modal (Iteration Retesting) */}
      <Modal open={retestModalOpen} onClose={() => setRetestModalOpen(false)} title={`Retest Iteration for: ${selectedTest?.testName}`} size="lg">
        <form onSubmit={handleCreateRetest} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <Field label="Retest Justification / Adjustments Made" required>
            <Input
              value={retestForm.retestReason}
              onChange={(e) => setRetestForm({ ...retestForm, retestReason: e.target.value })}
              required
            />
          </Field>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Re-evaluating Checklist Items
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {retestForm.checklist.map((chk, idx) => (
                <div key={chk.id} className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-800 dark:text-slate-200 flex-1">{chk.parameterOrCheck}</span>
                  <Input
                    placeholder="New Measured Value"
                    value={chk.measuredValue}
                    onChange={(e) => {
                      const next = [...retestForm.checklist];
                      next[idx].measuredValue = e.target.value;
                      setRetestForm({ ...retestForm, checklist: next });
                    }}
                    className="w-32 text-xs py-1"
                  />
                  <Select
                    value={chk.result}
                    onChange={(e) => {
                      const next = [...retestForm.checklist];
                      next[idx].result = e.target.value as any;
                      setRetestForm({ ...retestForm, checklist: next });
                    }}
                    className="w-24 text-xs py-1"
                  >
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                    <option value="Pending">Pending</option>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setRetestModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Retest
            </Button>
          </div>
        </form>
      </Modal>

      {/* Mark Successfully Completed Modal */}
      <Modal open={completeModalOpen} onClose={() => setCompleteModalOpen(false)} title="Mark R&D Project Successfully Completed" size="lg">
        <form onSubmit={handleCompleteProject} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1.5 text-emerald-900 dark:text-emerald-200">
            <span className="font-bold block">Final Prototype Validation Sign-Off</span>
            <p>
              Marking this project as Successfully Completed finalizes the research milestones and archives all technical test runs in the R&D ledger.
            </p>
          </div>

          <Field label="Final Technical Conclusion & Validation Summary" required>
            <Textarea
              value={finalConclusion}
              onChange={(e) => setFinalConclusion(e.target.value)}
              rows={4}
              required
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setCompleteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" loading={submitting}>
              Confirm Successful Completion
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
