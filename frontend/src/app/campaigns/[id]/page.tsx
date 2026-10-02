'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import { formatCurrency as formatINR } from '@/lib/currency';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const [campaign, setCampaign] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCampaignData();
  }, [campaignId]);

  const loadCampaignData = async () => {
    try {
      setLoading(true);
      const [campaignRes, metricsRes] = await Promise.all([
        api.getCampaign(campaignId),
        api.getCampaignMetrics(campaignId),
      ]);
      setCampaign(campaignRes.data.campaign);
      setMetrics(metricsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatINR(amount);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      PAUSED: 'bg-yellow-100 text-yellow-800',
      DRAFT: 'bg-gray-100 text-gray-800',
      PENDING: 'bg-blue-100 text-blue-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="text-center py-12">
          <p className="text-gray-600">Loading campaign...</p>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !campaign) {
    return (
      <ProtectedRoute>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Campaign not found'}
        </div>
      </ProtectedRoute>
    );
  }

  const chartData = campaign.metrics?.slice(0, 30).map((m: any) => ({
    date: new Date(m.date).toLocaleDateString(),
    impressions: m.impressions,
    clicks: m.clicks,
    spend: parseFloat(m.spend),
    revenue: parseFloat(m.revenue),
  })) || [];

  return (
    <ProtectedRoute>
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <Link href="/campaigns" className="text-primary-600 hover:text-primary-700 mb-2 inline-block">
              ← Back to Campaigns
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{campaign.name}</h1>
          </div>
          <div className="flex space-x-4">
            <button
              onClick={async () => {
                try {
                  await api.syncCampaign(campaignId);
                  loadCampaignData();
                  alert('Synced metrics from platform');
                } catch (err) {
                  alert('Failed to sync campaign');
                }
              }}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800"
            >
              Sync Metrics
            </button>
            <button
              onClick={async () => {
                try {
                  await api.optimizeCampaign(campaignId);
                  alert('Optimization recommendations generated');
                } catch (err) {
                  alert('Failed to optimize campaign');
                }
              }}
              className="px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700"
            >
              Optimize
            </button>
            {campaign.status === 'DRAFT' && (
              <button
                onClick={async () => {
                  try {
                    await api.deployCampaign(campaignId);
                    loadCampaignData();
                  } catch (err) {
                    alert('Failed to deploy campaign');
                  }
                }}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Deploy
              </button>
            )}
          </div>
        </div>

        {/* Campaign Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Status</h3>
            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(campaign.status)}`}>
              {campaign.status}
            </span>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Platform</h3>
            <p className="text-lg font-semibold text-gray-900">{campaign.platform}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Budget</h3>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(campaign.budget)}</p>
            {campaign.dailyBudget && (
              <p className="text-sm text-gray-500">Daily: {formatCurrency(campaign.dailyBudget)}</p>
            )}
          </div>
        </div>

        {/* Performance Metrics */}
        {metrics && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Performance Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Spend</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.summary.totalSpend)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(metrics.summary.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ROAS</p>
                <p className={`text-2xl font-bold ${metrics.summary.roas >= 2 ? 'text-green-600' : 'text-red-600'}`}>
                  {metrics.summary.roas.toFixed(2)}x
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">CTR</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.summary.ctr.toFixed(2)}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        {chartData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Impressions & Clicks</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="impressions" stroke="#3b82f6" />
                  <Line type="monotone" dataKey="clicks" stroke="#10b981" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Spend & Revenue</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="spend" fill="#ef4444" />
                  <Bar dataKey="revenue" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Ad Sets */}
        {campaign.adSets && campaign.adSets.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Ad Sets</h2>
            <div className="space-y-4">
              {campaign.adSets.map((adSet: any) => (
                <div key={adSet.id} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900">{adSet.name}</h3>
                  <p className="text-sm text-gray-500">Budget: {formatCurrency(adSet.budget)}</p>
                  {adSet.ads && adSet.ads.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700">Ads ({adSet.ads.length}):</p>
                      <ul className="list-disc list-inside text-sm text-gray-600">
                        {adSet.ads.map((ad: any) => (
                          <li key={ad.id}>{ad.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

