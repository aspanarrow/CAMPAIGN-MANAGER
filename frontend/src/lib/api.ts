import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth - dynamically get API key
apiClient.interceptors.request.use(
  (config) => {
    // Get API key from localStorage (client-side only)
    if (typeof window !== 'undefined') {
      const apiKey = localStorage.getItem('api_key');
      // Don't override a key explicitly passed by the caller (e.g. the login screen)
      if (apiKey && !config.headers['x-api-key']) {
        config.headers['x-api-key'] = apiKey;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - clear API key and redirect (but not while on the login page)
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        localStorage.removeItem('api_key');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API methods
export const api = {
  // Health check (no auth required)
  health: () => apiClient.get('/health'),

  // Verify an API key against the backend (optionally pass one explicitly)
  verifyAuth: (apiKey?: string) =>
    apiClient.get(
      '/api/auth/verify',
      apiKey ? { headers: { 'x-api-key': apiKey } } : undefined
    ),

  // Campaigns
  getCampaigns: (params?: { platform?: string; status?: string; limit?: number; offset?: number }) => {
    // Drop empty filters so the backend doesn't receive e.g. `?platform=`
    const cleaned = params
      ? Object.fromEntries(
          Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null)
        )
      : undefined;
    return apiClient.get('/api/campaigns', { params: cleaned });
  },
  
  getCampaign: (id: string) =>
    apiClient.get(`/api/campaigns/${id}`),
  
  createCampaign: (data: any) =>
    apiClient.post('/api/campaigns', data),
  
  getCampaignMetrics: (id: string) =>
    apiClient.get(`/api/campaigns/${id}/metrics`),
  
  optimizeCampaign: (id: string) =>
    apiClient.post(`/api/campaigns/${id}/optimize`),
  
  deployCampaign: (id: string) =>
    apiClient.post(`/api/campaigns/${id}/deploy`),

  syncCampaign: (id: string) =>
    apiClient.post(`/api/campaigns/${id}/sync`),

  updateCampaign: (id: string, data: { name?: string; dailyBudget?: number; status?: string }) =>
    apiClient.patch(`/api/campaigns/${id}`, data),

  getTimeseries: (id: string, days = 30) =>
    apiClient.get(`/api/campaigns/${id}/timeseries`, { params: { days } }),

  getAnalytics: () =>
    apiClient.get('/api/analytics'),

  // Automation rules + audit
  getRules: () =>
    apiClient.get('/api/automation/rules'),

  createRule: (data: any) =>
    apiClient.post('/api/automation/rules', data),

  updateRule: (id: string, data: any) =>
    apiClient.patch(`/api/automation/rules/${id}`, data),

  deleteRule: (id: string) =>
    apiClient.delete(`/api/automation/rules/${id}`),

  evaluateRules: (campaignId: string) =>
    apiClient.post(`/api/automation/evaluate/${campaignId}`),

  getAuditLog: (limit = 100) =>
    apiClient.get('/api/automation/audit', { params: { limit } }),

  // Approvals
  getApprovals: () =>
    apiClient.get('/api/approvals'),
  
  approveRequest: (id: string, data: { approvedBy: string }) =>
    apiClient.post(`/api/approvals/${id}/approve`, data),
  
  rejectRequest: (id: string, data: { rejectedBy: string; reason: string }) =>
    apiClient.post(`/api/approvals/${id}/reject`, data),
};

export default apiClient;
