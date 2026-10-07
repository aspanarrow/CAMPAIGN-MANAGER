import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth - dynamically get credentials (JWT preferred, API key fallback)
apiClient.interceptors.request.use(
  (config) => {
    // Get credentials from localStorage (client-side only)
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      const apiKey = localStorage.getItem('api_key');
      if (token && !config.headers['Authorization']) {
        config.headers['Authorization'] = `Bearer ${token}`;
      } else if (apiKey && !config.headers['x-api-key']) {
        // Don't override a key explicitly passed by the caller (e.g. the login screen)
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
      // Handle unauthorized - clear credentials and redirect (but not while on the login page)
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        localStorage.removeItem('api_key');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
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

  // C2 — JWT auth
  register: (email: string, password: string, name?: string) =>
    apiClient.post('/api/auth/register', { email, password, name }),
  login: (email: string, password: string) =>
    apiClient.post('/api/auth/login', { email, password }),
  me: () => apiClient.get('/api/auth/me'),

  // Labs — A/B tests, AI content, emails
  getABTests: () => apiClient.get('/api/labs/abtests'),
  createABTest: (data: { name: string; adIds: string[]; trafficSplit?: number; endDate?: string }) =>
    apiClient.post('/api/labs/abtests', data),
  completeABTest: (id: string) => apiClient.post(`/api/labs/abtests/${id}/complete`),
  getContent: (params?: { type?: string; status?: string }) =>
    apiClient.get('/api/labs/content', { params }),
  generateContent: (data: { type: string; prompt: string; productName?: string; productDescription?: string; targetAudience?: string; tone?: string; platform?: string }) =>
    apiClient.post('/api/labs/content/generate', data),
  updateContentStatus: (id: string, status: string) =>
    apiClient.patch(`/api/labs/content/${id}`, { status }),
  getEmails: () => apiClient.get('/api/labs/emails'),
  createEmail: (data: { name: string; subject: string; body: string; listId?: string; scheduledAt?: string }) =>
    apiClient.post('/api/labs/emails', data),
  sendEmail: (id: string) => apiClient.post(`/api/labs/emails/${id}/send`),

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

  // Products (from Shopify — for the campaign form picker)
  getProducts: (limit = 50) =>
    apiClient.get('/api/products', { params: { limit } }),
  
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

  // Profit (India unit economics)
  profitSummary: (params?: { from?: string; to?: string; campaignId?: string }) =>
    apiClient.get('/api/profit/summary', { params }),

  profitOrders: (params?: { from?: string; to?: string; filter?: string; page?: number; limit?: number }) =>
    apiClient.get('/api/profit/orders', { params }),

  profitCampaigns: (params?: { from?: string; to?: string }) =>
    apiClient.get('/api/profit/campaigns', { params }),

  profitSetOutcome: (id: string, outcome: string, confirmedBy?: string) =>
    apiClient.patch(`/api/profit/orders/${id}/outcome`, { outcome, confirmedBy }),

  profitSync: () => apiClient.post('/api/profit/sync'),

  profitRecompute: (params?: { from?: string; to?: string }) =>
    apiClient.post('/api/profit/recompute', params || {}),

  getCosts: () => apiClient.get('/api/profit/costs'),

  updateCost: (key: string, value: number) =>
    apiClient.put('/api/profit/costs', { key, value }),

  // Approvals
  getApprovals: () =>
    apiClient.get('/api/approvals'),
  
  approveRequest: (id: string, data: { approvedBy: string }) =>
    apiClient.post(`/api/approvals/${id}/approve`, data),
  
  rejectRequest: (id: string, data: { rejectedBy: string; reason: string }) =>
    apiClient.post(`/api/approvals/${id}/reject`, data),
};

export default apiClient;
