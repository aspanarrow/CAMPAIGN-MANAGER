'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/currency';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';

/**
 * Profit tab — India unit economics (NINA C1 spec §7).
 *
 * Three honesty rules enforced in this UI:
 *   1. CM% is always shown WITH coverage% — never averaged over missing data.
 *   2. RTO shows an ASSUMED badge until outcomes are confirmed.
 *   3. Campaigns sort by contribution, not ROAS.
 */

const OUTCOMES = ['PENDING', 'DELIVERED', 'RTO', 'RETURNED', 'CANCELLED'] as const;

function Badge({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const tones = {
    ok: 'bg-green-100 text-green-800',
    warn: 'bg-amber-100 text-amber-800',
    bad: 'bg-red-100 text-red-800',
    neutral: 'bg-gray-100 text-gray-700',
  };
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${tones[tone]}`}>{children}</span>;
}

function verdictTone(v: string) {
  return v === 'Healthy' ? 'ok' : v === 'Thin' ? 'warn' : 'bad';
}

export default function ProfitPage() {
  const [summary, setSummary] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [s, c, o, co] = await Promise.all([
        api.profitSummary(),
        api.profitCampaigns(),
        api.profitOrders({ filter, limit: 25 }),
        api.getCosts(),
      ]);
      setSummary(s.data);
      setCampaigns(c.data.campaigns || []);
      setOrders(o.data.orders || []);
      setCosts(co.data.assumptions || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load profit data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const syncNow = async () => {
    try {
      setSyncing(true);
      await api.profitSync();
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const setOutcome = async (id: string) => {
    const outcome = prompt(`Set outcome (${OUTCOMES.join(', ')}):`) as any;
    if (!outcome || !OUTCOMES.includes(outcome)) return;
    try {
      await api.profitSetOutcome(id, outcome);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to set outcome');
    }
  };

  const updateCost = async (key: string) => {
    const current = costs.find((c) => c.key === key)?.value;
    const value = prompt(`New value for ${key}:`, String(current));
    if (value === null || value === '') return;
    try {
      await api.updateCost(key, Number(value));
      await api.profitRecompute();
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Update failed');
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="text-center py-12 text-gray-600">Loading profit data…</div>
      </ProtectedRoute>
    );
  }

  const k = summary?.kpis || {};
  const cov = summary?.coverage || {};
  const warnings: string[] = summary?.warnings || [];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Profit</h1>
              <p className="text-gray-600 mt-1">
                Bank-account profit (contribution margin), not platform ROAS.
              </p>
            </div>
            <Button onClick={syncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : '⟳ Sync orders from Shopify'}
            </Button>
          </div>

          {/* Warnings — assumptions must be labelled (honesty rule #2) */}
          {warnings.length > 0 && (
            <div className="mb-6 space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">{error}</div>}

          {/* KPI row — CM% always paired with coverage (honesty rule #1) */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
            <Card className="p-4">
              <p className="text-xs text-gray-500">Net revenue</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(k.netRevenue || 0)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500">Contribution margin</p>
              <p className={`text-xl font-bold ${(k.contributionMargin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(k.contributionMargin || 0)}
              </p>
              <p className="text-xs text-gray-400">COGS cov. {Math.round((cov.withCogs || 0) * 100)}%</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500">CM %</p>
              <p className={`text-xl font-bold ${(k.cmPercent || 0) >= 15 ? 'text-green-600' : (k.cmPercent || 0) < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                {k.cmPercent !== null && k.cmPercent !== undefined ? `${k.cmPercent}%` : '—'}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500">Max CAC</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(k.maxCac || 0)}</p>
              <p className="text-xs text-gray-400">never pay more</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500">Break-even ROAS</p>
              <p className="text-xl font-bold text-gray-900">{k.breakEvenRoas ?? '—'}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500">Prepaid %</p>
              <p className="text-xl font-bold text-gray-900">{k.prepaidShare ?? 0}%</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500">RTO %</p>
              <p className="text-xl font-bold text-gray-900">{k.rtoRate ?? 0}%</p>
              <Badge tone={cov.withConfirmedOutcome > 0 ? 'ok' : 'warn'}>
                {cov.withConfirmedOutcome > 0 ? 'MEASURED' : 'ASSUMED'}
              </Badge>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-500">Orders</p>
              <p className="text-xl font-bold text-gray-900">{k.orders ?? 0}</p>
              <p className="text-xs text-gray-400">COGS cov. {Math.round((cov.withCogs || 0) * 100)}%</p>
            </Card>
          </div>

          {/* Campaigns — sorted by contribution, not ROAS (honesty rule #3) */}
          <Card className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Profit (by contribution)</h2>
            {campaigns.length === 0 ? (
              <p className="text-gray-500">No campaigns yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 text-xs uppercase">
                      <th className="py-2 pr-4">Campaign</th>
                      <th className="py-2 pr-4">Spend</th>
                      <th className="py-2 pr-4">Orders</th>
                      <th className="py-2 pr-4">ROAS</th>
                      <th className="py-2 pr-4">CM after RTO</th>
                      <th className="py-2 pr-4">CM%</th>
                      <th className="py-2">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.campaignId} className="border-t border-gray-100">
                        <td className="py-2 pr-4 font-medium text-gray-900">{c.name}</td>
                        <td className="py-2 pr-4">{formatCurrency(c.spend)}</td>
                        <td className="py-2 pr-4">
                          {c.orders}
                          {c.codOrders > 0 && <span className="text-xs text-amber-600"> ({c.codOrders} COD)</span>}
                        </td>
                        <td className="py-2 pr-4">{c.roas ?? '—'}</td>
                        <td className={`py-2 pr-4 font-semibold ${c.contributionMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(c.contributionMargin)}
                        </td>
                        <td className="py-2 pr-4">{c.cmPercent}%</td>
                        <td className="py-2">
                          <Badge tone={verdictTone(c.verdict) as any}>{c.verdict}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Orders drill-down with manual outcome marking (T6) */}
          <Card className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Orders (drill-down)</h2>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
                <option value="">All orders</option>
                <option value="cod">COD only</option>
                <option value="prepaid">Prepaid only</option>
                <option value="rto">RTO</option>
                <option value="no_cogs">Missing COGS</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs uppercase">
                    <th className="py-2 pr-4">Order</th>
                    <th className="py-2 pr-4">Placed</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Outcome</th>
                    <th className="py-2 pr-4">Net rev</th>
                    <th className="py-2 pr-4">CM</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t border-gray-100">
                      <td className="py-2 pr-4 font-mono text-xs">{o.orderNumber}</td>
                      <td className="py-2 pr-4">{new Date(o.placedAt).toLocaleDateString()}</td>
                      <td className="py-2 pr-4">
                        {o.isCod ? <Badge tone="warn">COD</Badge> : <Badge tone="neutral">Prepaid</Badge>}
                        {o.dataQuality === 'no_cogs' && <Badge tone="bad">NO COGS</Badge>}
                      </td>
                      <td className="py-2 pr-4">
                        {o.outcome}
                        {o.outcomeConfirmed && <Badge tone="ok"> ✓</Badge>}
                      </td>
                      <td className="py-2 pr-4">{formatCurrency(o.netRevenue)}</td>
                      <td className={`py-2 pr-4 font-semibold ${o.contributionMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(o.contributionMargin)}
                      </td>
                      <td className="py-2">
                        <button onClick={() => setOutcome(o.id)} className="text-sm text-primary-600 hover:underline">
                          Set outcome
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Cost assumptions (T7) */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Cost Assumptions</h2>
            <p className="text-sm text-gray-500 mb-4">
              Every rupee assumption lives here. Click a value to edit — all rows recompute automatically.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {costs.map((c) => (
                <div key={c.key} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{c.key}</div>
                    <div className="text-xs text-gray-400">{c.note}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{c.value}</span>
                    <span className="text-xs text-gray-400">{c.unit}</span>
                    <button onClick={() => updateCost(c.key)} className="text-primary-600 text-sm hover:underline">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </main>
      </div>
    </ProtectedRoute>
  );
}
