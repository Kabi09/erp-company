import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { FollowUp } from '../../types/erp';

export const FollowUpsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(() => searchParams.get('filter') || 'All');
  const [open, setOpen] = useState(false);

  const [entityType, setEntityType] = useState<'enquiry' | 'quotation'>('enquiry');
  const [entityId, setEntityId] = useState('');
  const [followUpDate, setFollowUpDate] = useState(new Date().toISOString().slice(0, 10));
  const [contactMethod, setContactMethod] = useState<'Call' | 'Email' | 'Meeting'>('Call');
  const [discussion, setDiscussion] = useState('');
  const [response, setResponse] = useState<'Pending' | 'Accepted' | 'Rejected' | 'Negotiation'>('Pending');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!data) return null;

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return data.followUps.filter((f) => {
      if (filter === 'Today' && !(f.status === 'Scheduled' && f.nextFollowUpDate === today)) return false;
      if (filter === 'Overdue' && !(f.status === 'Scheduled' && f.nextFollowUpDate && f.nextFollowUpDate < today)) return false;
      if (filter === 'Scheduled' && f.status !== 'Scheduled') return false;
      if (filter === 'Completed' && f.status !== 'Completed') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !f.entityDocNo.toLowerCase().includes(q) &&
          !f.customerName.toLowerCase().includes(q) &&
          !f.discussion.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data.followUps, filter, search, today]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await erpApi.createFollowUp({
        entityType,
        entityId,
        followUpDate,
        contactMethod,
        discussion,
        response,
        nextFollowUpDate: nextFollowUpDate || undefined,
        rejectionReason: rejectionReason || undefined,
      });
      await refresh();
      toast('success', 'Follow-up saved', `Status synchronized automatically.`);
      setOpen(false);
      setDiscussion('');
      setRejectionReason('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save follow-up');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<FollowUp>[] = [
    {
      key: 'doc',
      header: 'Reference',
      render: (r) => (
        <div>
          <span className="font-mono font-semibold text-xs">{r.entityDocNo}</span>
          <div className="text-[11px] text-slate-500 capitalize">{r.entityType}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer & Summary',
      render: (r) => (
        <div>
          <div className="font-medium">{r.customerName}</div>
          <div className="text-xs text-slate-500">{r.summary}</div>
        </div>
      ),
    },
    {
      key: 'discussion',
      header: 'Discussion',
      render: (r) => <div className="text-xs max-w-md">{r.discussion}</div>,
    },
    {
      key: 'dates',
      header: 'Date / Next',
      render: (r) => (
        <div className="font-mono text-xs">
          <div>{r.followUpDate} ({r.contactMethod})</div>
          {r.nextFollowUpDate && <div className="text-amber-700 dark:text-amber-400">Next: {r.nextFollowUpDate}</div>}
        </div>
      ),
    },
    {
      key: 'response',
      header: 'Response',
      render: (r) => <StatusBadge status={r.response} />,
    },
    {
      key: 'by',
      header: 'Followed By',
      render: (r) => <span className="text-xs text-slate-600 dark:text-slate-400">{r.followedBy}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Sales Follow-ups"
        subtitle="Track scheduled and historical follow-ups across enquiries and quotations."
        actions={
          can('sales', 'create') && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Follow-up
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by document, customer, or notes..."
        statuses={['All', 'Today', 'Overdue', 'Scheduled', 'Completed']}
        activeStatus={filter}
        onStatusChange={setFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">{r.entityDocNo}</span>
              <StatusBadge status={r.response} />
            </div>
            <div className="text-sm font-medium">{r.customerName}</div>
            <p className="text-xs text-slate-600 dark:text-slate-400">{r.discussion}</p>
            <div className="text-xs text-slate-500">
              {r.followUpDate} · {r.contactMethod} · {r.followedBy}
              {r.nextFollowUpDate && ` · Next: ${r.nextFollowUpDate}`}
            </div>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record Sales Follow-up"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="fu-modal-form" loading={submitting}>Save Follow-up</Button>
          </>
        }
      >
        <form id="fu-modal-form" onSubmit={handleCreate} className="space-y-3.5">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Record Type" required>
              <Select
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value as any);
                  setEntityId('');
                }}
              >
                <option value="enquiry">Customer Enquiry</option>
                <option value="quotation">Commercial Quotation</option>
              </Select>
            </Field>
            <Field label="Select Record" required>
              <Select value={entityId} onChange={(e) => setEntityId(e.target.value)} required>
                <option value="">Choose record...</option>
                {entityType === 'enquiry'
                  ? data.enquiries
                      .filter((e) => e.status !== 'Rejected')
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.docNo} — {e.customerSnapshot.name}
                        </option>
                      ))
                  : data.quotations
                      .filter((q) => q.status !== 'Superseded' && q.status !== 'Rejected')
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.docNo} — {q.customerSnapshot.name}
                        </option>
                      ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Follow-up Date" required>
              <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} required />
            </Field>
            <Field label="Contact Method" required>
              <Select value={contactMethod} onChange={(e) => setContactMethod(e.target.value as any)}>
                <option value="Call">Call</option>
                <option value="Email">Email</option>
                <option value="Meeting">Meeting</option>
              </Select>
            </Field>
          </div>
          <Field label="Discussion Details" required>
            <Textarea value={discussion} onChange={(e) => setDiscussion(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer Response" required>
              <Select value={response} onChange={(e) => setResponse(e.target.value as any)}>
                <option value="Pending">Pending</option>
                <option value="Accepted">Accepted</option>
                {entityType === 'quotation' && <option value="Negotiation">Negotiation</option>}
                <option value="Rejected">Rejected</option>
              </Select>
            </Field>
            {(response === 'Pending' || response === 'Negotiation') && (
              <Field label="Next Follow-up Date">
                <Input type="date" value={nextFollowUpDate} onChange={(e) => setNextFollowUpDate(e.target.value)} />
              </Field>
            )}
          </div>
          {response === 'Rejected' && (
            <Field label="Rejection Reason" required>
              <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} required />
            </Field>
          )}
        </form>
      </Modal>
    </div>
  );
};
