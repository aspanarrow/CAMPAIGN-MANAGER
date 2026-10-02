'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import { formatCurrency as formatINR } from '@/lib/currency';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function AnalyticsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await api.getCampaigns({ limit: 100 });
      setCampaigns(response.data.campaigns || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatINR(amount);
  };

  // Calculate totals
  const totals = campaigns.reduce(
    (acc, campaign) => ({
      spend: acc.spend + parseFloat(campaign.spend || 0),
      revenue: acc.revenue + parseFloat(campaign.revenue || 0),
      impressions: acc.impressions + (campaign.impressions || 0),
      clicks: acc.clicks + (campaign.clicks || 0),
    }),
    { spend: 0, revenue: 0, impressions: 0, clicks: 0 }
  );

  const overallROAS = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const overallCTR = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  // Platform breakdown
  const platformData = campaigns.reduce((acc: any, campaign) => {
    const platform = campaign.platform;
    if (!acc[platform]) {
      acc[platform] = { spend: 0, revenue: 0, count: 0 };
    }
    acc[platform].spend += parseFloat(campaign.spend || 0);
    acc[platform].revenue += parseFloat(campaign.revenue || 0);
    acc[platform].count += 1;
    return acc;
  }, {});

  const platformChartData = Object.entries(platformData).map(([name, data]: [string, any]) => ({
    name,
    value: data.spend,
    revenue: data.revenue,
    roas: data.spend > 0 ? data.revenue / data.spend : 0,
  }));

  // Top performing campaigns
  const topCampaigns = [...campaigns]
    .sort((a, b) => {
      const roasA = a.roas || 0;
      const roasB = b.roas || 0;
      return roasB - roasA;
    })
    .slice(0, 5)
    .map((campaign) => ({
      name: campaign.name.substring(0, 20) + (campaign.name.length > 20 ? '...' : ''),
      roas: campaign.roas || 0,
      spend: parseFloat(campaign.spend || 0),
    }));

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="text-center py-12">
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Analytics Dashboard</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Spend</h3>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totals.spend)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Revenue</h3>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totals.revenue)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Overall ROAS</h3>
            <p className={`text-2xl font-bold ${overallROAS >= 2 ? 'text-green-600' : 'text-red-600'}`}>
              {overallROAS.toFixed(2)}x
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Overall CTR</h3>
            <p className="text-2xl font-bold text-gray-900">{overallCTR.toFixed(2)}%</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Platform Spend */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Spend by Platform</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={platformChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {platformChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top Campaigns */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Campaigns (ROAS)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topCampaigns}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="roas" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Platform Performance Table */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Performance</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaigns</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spend</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ROAS</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {platformChartData.map((platform) => (
                  <tr key={platform.name}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {platform.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {platformData[platform.name]?.count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(platform.value)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                      {formatCurrency(platform.revenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={platform.roas >= 2 ? 'text-green-600' : 'text-red-600'}>
                        {platform.roas.toFixed(2)}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

