'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import { formatCurrency as formatINR } from '@/lib/currency';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { HelpTooltip } from '@/components/HelpTooltip';

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number;
  dailyBudget: number | null;
  spend: number;
  revenue: number;
  roas: number | null;
  impressions: number;
  clicks: number;
  createdAt: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ platform: '', status: '' });

  useEffect(() => {
    loadCampaigns();
  }, [filters]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await api.getCampaigns(filters);
      setCampaigns(response.data.campaigns || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatINR(amount);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string; dot: string }> = {
      ACTIVE: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
      PAUSED: { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
      DRAFT: { bg: 'bg-gray-100', text: 'text-gray-800', dot: 'bg-gray-500' },
      PENDING: { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
    };
    return colors[status] || { bg: 'bg-gray-100', text: 'text-gray-800', dot: 'bg-gray-500' };
  };

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      META: '📘',
      GOOGLE_ADS: '🔍',
      EMAIL: '📧',
    };
    return icons[platform] || '📊';
  };

  return (
    <ProtectedRoute>
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Campaigns</h1>
            <p className="text-gray-600">
              Manage and track your marketing campaigns across all platforms
            </p>
          </div>
          <Link href="/campaigns/new">
            <Button variant="primary" size="lg" className="w-full sm:w-auto">
              <span className="mr-2">➕</span>
              Create Campaign
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            <HelpTooltip
              content="Filter campaigns by platform or status to quickly find what you're looking for"
              title="Filtering Help"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platform
              </label>
              <select
                value={filters.platform}
                onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm"
              >
                <option value="">All Platforms</option>
                <option value="META">Meta (Facebook/Instagram)</option>
                <option value="GOOGLE_ADS">Google Ads</option>
                <option value="EMAIL">Email</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                fullWidth
                onClick={() => setFilters({ platform: '', status: '' })}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>

        {/* Error Message */}
        {error && (
          <Card className="mb-6 border-l-4 border-l-red-500 bg-red-50">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-red-900">Error Loading Campaigns</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card>
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600 mb-4"></div>
              <p className="text-gray-600 font-medium">Loading campaigns...</p>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {!loading && campaigns.length === 0 && (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No campaigns found</h3>
            <p className="text-gray-600 mb-6">
              {filters.platform || filters.status
                ? 'Try adjusting your filters to see more campaigns'
                : 'Get started by creating your first marketing campaign'}
            </p>
            <Link href="/campaigns/new">
              <Button variant="primary" size="lg">
                Create Your First Campaign
              </Button>
            </Link>
          </Card>
        )}

        {/* Campaigns Grid (Mobile) / Table (Desktop) */}
        {!loading && campaigns.length > 0 && (
          <>
            {/* Mobile/Tablet: Card Grid */}
            <div className="grid grid-cols-1 lg:hidden gap-4 mb-6">
              {campaigns.map((campaign) => {
                const statusColors = getStatusColor(campaign.status);
                return (
                  <Card key={campaign.id} hover className="border-l-4 border-l-primary-500">
                    <Link href={`/campaigns/${campaign.id}`}>
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">
                              {campaign.name}
                            </h3>
                            <div className="flex items-center space-x-3 text-sm text-gray-600">
                              <span className="flex items-center space-x-1">
                                <span>{getPlatformIcon(campaign.platform)}</span>
                                <span>{campaign.platform}</span>
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center space-x-1.5 ${statusColors.bg} ${statusColors.text}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${statusColors.dot}`}></span>
                            <span>{campaign.status}</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Budget</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(campaign.budget)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Spend</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(campaign.spend)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">ROAS</p>
                            <p
                              className={`text-sm font-semibold ${
                                campaign.roas && campaign.roas >= 2
                                  ? 'text-green-600'
                                  : campaign.roas
                                  ? 'text-red-600'
                                  : 'text-gray-400'
                              }`}
                            >
                              {campaign.roas ? `${campaign.roas.toFixed(2)}x` : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">CTR</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {campaign.impressions > 0
                                ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2)
                                : '0.00'}
                              %
                            </p>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>
                              {campaign.impressions.toLocaleString()} impressions
                            </span>
                            <span>{campaign.clicks.toLocaleString()} clicks</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </Card>
                );
              })}
            </div>

            {/* Desktop: Table View */}
            <Card className="hidden lg:block overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Campaign
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Platform
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Budget
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Spend
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        ROAS
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Performance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {campaigns.map((campaign) => {
                      const statusColors = getStatusColor(campaign.status);
                      return (
                        <tr
                          key={campaign.id}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Link
                              href={`/campaigns/${campaign.id}`}
                              className="text-primary-600 hover:text-primary-700 font-medium"
                            >
                              {campaign.name}
                            </Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2 text-sm text-gray-900">
                              <span>{getPlatformIcon(campaign.platform)}</span>
                              <span>{campaign.platform}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center space-x-1.5 w-fit ${statusColors.bg} ${statusColors.text}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${statusColors.dot}`}></span>
                              <span>{campaign.status}</span>
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(campaign.budget)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(campaign.spend)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {campaign.roas ? (
                              <span
                                className={`font-semibold ${
                                  campaign.roas >= 2 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {campaign.roas.toFixed(2)}x
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            <div className="space-y-1">
                              <div>
                                {campaign.impressions.toLocaleString()}{' '}
                                <span className="text-gray-500">impressions</span>
                              </div>
                              <div>
                                {campaign.clicks.toLocaleString()}{' '}
                                <span className="text-gray-500">clicks</span>
                              </div>
                              {campaign.impressions > 0 && (
                                <div className="text-xs text-gray-500">
                                  CTR:{' '}
                                  {((campaign.clicks / campaign.impressions) * 100).toFixed(2)}%
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
