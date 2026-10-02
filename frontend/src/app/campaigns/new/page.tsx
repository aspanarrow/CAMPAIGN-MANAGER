'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { api } from '@/lib/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const campaignSchema = z.object({
  platform: z.enum(['META', 'GOOGLE_ADS', 'EMAIL']),
  budget: z.number().positive(),
  dailyBudget: z.number().positive().optional(),
  objective: z.string().min(1, 'Objective is required'),
  autoApprove: z.boolean().optional().default(false),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiPreview, setAiPreview] = useState<any>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      platform: 'META',
      autoApprove: false,
    },
  });

  const platform = watch('platform');

  const onSubmit = async (data: CampaignFormData) => {
    try {
      setLoading(true);
      setError('');

      const response = await api.createCampaign({
        ...data,
        budget: Number(data.budget),
        dailyBudget: data.dailyBudget ? Number(data.dailyBudget) : undefined,
      });

      if (response.data.approval) {
        router.push(`/approvals?campaign=${response.data.campaign.id}`);
      } else {
        router.push(`/campaigns/${response.data.campaign.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Create New Campaign</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Platform Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Platform *
            </label>
            <select
              {...register('platform')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="META">Meta (Facebook/Instagram)</option>
              <option value="GOOGLE_ADS">Google Ads</option>
              <option value="EMAIL">Email Marketing</option>
            </select>
            {errors.platform && (
              <p className="mt-1 text-sm text-red-600">{errors.platform.message}</p>
            )}
          </div>

          {/* Budget */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Budget (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                {...register('budget', { valueAsNumber: true })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="1000.00"
              />
              {errors.budget && (
                <p className="mt-1 text-sm text-red-600">{errors.budget.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Daily Budget (₹)
              </label>
              <input
                type="number"
                step="0.01"
                {...register('dailyBudget', { valueAsNumber: true })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="50.00"
              />
              {errors.dailyBudget && (
                <p className="mt-1 text-sm text-red-600">{errors.dailyBudget.message}</p>
              )}
            </div>
          </div>

          {/* Objective */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Campaign Objective *
            </label>
            <input
              type="text"
              {...register('objective')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., CONVERSIONS, TRAFFIC, AWARENESS"
            />
            {errors.objective && (
              <p className="mt-1 text-sm text-red-600">{errors.objective.message}</p>
            )}
          </div>

          {/* Auto Approve */}
          <div className="flex items-center">
            <input
              type="checkbox"
              {...register('autoApprove')}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label className="ml-2 block text-sm text-gray-700">
              Auto-approve and deploy immediately (skip approval workflow)
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* AI Preview (if available) */}
          {aiPreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">AI-Generated Content Preview</h3>
              <div className="space-y-2 text-sm text-blue-800">
                {aiPreview.headlines && (
                  <div>
                    <strong>Headlines:</strong>
                    <ul className="list-disc list-inside ml-2">
                      {aiPreview.headlines.map((h: string, i: number) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}

