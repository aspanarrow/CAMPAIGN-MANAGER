'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { HelpTooltip } from '@/components/HelpTooltip';

interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: { metric: string; operator: string; value: number };
  actions: { type: string; percentage?: number; requiresApproval?: boolean }[];
  lastTriggered: string | null;
  triggerCount: number;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  changes?: any;
}

const METRICS = ['roas', 'ctr', 'cpc', 'spend', 'conversions', 'clicks', 'impressions'];
const OPERATORS = [
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
];
const ACTIONS = ['PAUSE_CAMPAIGN', 'INCREASE_BUDGET', 'DECREASE_BUDGET'];

export default function AutomationPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // form
  const [name, setName] = useState('Pause low ROAS');
  const [metric, setMetric] = useState('roas');
  const [operator, setOperator] = useState('lt');
  const [value, setValue] = useState('2');
  const [action, setAction] = useState('PAUSE_CAMPAIGN');
  const [percentage, setPercentage] = useState('20');
  const [requiresApproval, setRequiresApproval] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const [r, a] = await Promise.all([api.getRules(), api.getAuditLog(20)]);
      setRules(r.data.rules || []);
      setAudit(a.data.logs || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load automation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const actionObj: any = { type: action, requiresApproval };
      if (action !== 'PAUSE_CAMPAIGN') actionObj.percentage = Number(percentage);
      await api.createRule({
        name,
        conditions: { metric, operator, value: Number(value) },
        actions: [actionObj],
      });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create rule');
    }
  };

  const toggle = async (rule: Rule) => {
    try {
      await api.updateRule(rule.id, { enabled: !rule.enabled });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update rule');
    }
  };

  const remove = async (rule: Rule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await api.deleteRule(rule.id);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete rule');
    }
  };

  const opLabel = (op: string) => OPERATORS.find((o) => o.value === op)?.label || op;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              Automation Rules
              <HelpTooltip content="Rules watch campaign metrics and propose (or auto-apply) actions. By default every action needs your approval — safe for real spend." />
            </h1>
            <p className="text-gray-600 mt-1">
              If a metric crosses a threshold, propose a pause or budget change.
            </p>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">{error}</div>}

          {/* Create rule */}
          <Card className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Rule</h2>
            <form onSubmit={createRule} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-700 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">If metric</label>
                <select value={metric} onChange={(e) => setMetric(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  {METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">is</label>
                <select value={operator} onChange={(e) => setOperator(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">value</label>
                <input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Then</label>
                <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                </select>
              </div>

              {action !== 'PAUSE_CAMPAIGN' && (
                <div>
                  <label className="block text-sm text-gray-700 mb-1">by %</label>
                  <input type="number" value={percentage} onChange={(e) => setPercentage(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              )}

              <label className="flex items-center space-x-2 text-sm text-gray-700 md:col-span-2">
                <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
                <span>Require my approval (recommended)</span>
              </label>

              <div className="md:col-span-2">
                <Button type="submit" fullWidth>Create Rule</Button>
              </div>
            </form>
          </Card>

          {/* Rules list */}
          <Card className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Rules</h2>
            {loading ? (
              <p className="text-gray-500">Loading…</p>
            ) : rules.length === 0 ? (
              <p className="text-gray-500">No rules yet. Create one above.</p>
            ) : (
              <div className="space-y-3">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                    <div>
                      <div className="font-semibold text-gray-900">{r.name}</div>
                      <div className="text-sm text-gray-600">
                        If <b>{r.conditions.metric}</b> {opLabel(r.conditions.operator)} <b>{r.conditions.value}</b>
                        {' → '}{r.actions.map((a) => a.type.replace(/_/g, ' ')).join(', ')}
                        {r.actions.some((a) => a.requiresApproval !== false) ? ' (needs approval)' : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Triggered {r.triggerCount}× · last {r.lastTriggered ? new Date(r.lastTriggered).toLocaleString() : 'never'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggle(r)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${r.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {r.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button onClick={() => remove(r)} className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Audit log */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Log</h2>
            {audit.length === 0 ? (
              <p className="text-gray-500">No activity recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 pr-4">When</th>
                      <th className="py-2 pr-4">Action</th>
                      <th className="py-2 pr-4">Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((e) => (
                      <tr key={e.id} className="border-t border-gray-100">
                        <td className="py-2 pr-4 text-gray-600">{new Date(e.createdAt).toLocaleString()}</td>
                        <td className="py-2 pr-4 font-medium text-gray-900">{e.action}</td>
                        <td className="py-2 pr-4 text-gray-600">{e.entityType}{e.entityId ? ` · ${e.entityId.slice(0, 8)}…` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </main>
      </div>
    </ProtectedRoute>
  );
}
