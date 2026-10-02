'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import Link from 'next/link';

export default function SetupGuidePage() {
  const sections = [
    {
      id: 'overview',
      title: 'Overview',
      icon: '📋',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            Glowify Marketing AI is a comprehensive platform for automating your marketing campaigns across multiple channels including Meta (Facebook/Instagram), Google Ads, and Email marketing.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Key Features</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
              <li>AI-powered content generation using Google Gemini</li>
              <li>Automated campaign creation and management</li>
              <li>Real-time performance tracking and analytics</li>
              <li>Human-in-the-loop approval workflows</li>
              <li>Multi-platform campaign orchestration</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'authentication',
      title: 'Authentication & Login',
      icon: '🔐',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            The platform uses API key authentication for secure access. Your API key is stored locally in your browser and never transmitted to external servers.
          </p>
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-2">Where is my API key?</h4>
              <p className="text-sm text-gray-600 mb-2">
                The API key is whatever you have set as <code className="bg-white px-1.5 py-0.5 rounded border border-gray-300 text-xs font-mono">API_KEY</code> in <code className="bg-white px-1.5 py-0.5 rounded border border-gray-300 text-xs font-mono">backend/.env</code>. Read it with:
              </p>
              <code className="block bg-white px-3 py-2 rounded border border-gray-300 text-sm font-mono">grep '^API_KEY=' backend/.env</code>
              <p className="text-sm text-gray-600 mt-2">
                If you set <code className="bg-white px-1.5 py-0.5 rounded border border-gray-300 text-xs font-mono">NEXT_PUBLIC_API_KEY</code> in <code className="bg-white px-1.5 py-0.5 rounded border border-gray-300 text-xs font-mono">frontend/.env.local</code>, the login form is pre-filled automatically.
              </p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Generate a strong random key with <code className="bg-white px-1.5 py-0.5 rounded border border-yellow-300 text-xs font-mono">openssl rand -hex 32</code> and never commit your .env file.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'required-vars',
      title: 'Required Environment Variables',
      icon: '⚙️',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            These environment variables must be configured in <code className="bg-gray-100 px-2 py-1 rounded text-sm">backend/.env</code> for the application to function properly.
          </p>
          <div className="space-y-4">
            {[
              {
                name: 'API_KEY',
                description: 'Authentication key for API access. This is what you enter on the login page.',
                example: '<paste output of: openssl rand -hex 32>',
                required: true,
              },
              {
                name: 'DATABASE_URL',
                description: 'PostgreSQL database connection string.',
                example: 'postgresql://user:password@localhost:5432/shopify_marketing',
                required: true,
                help: 'You can use services like Supabase, Railway, or Neon for managed PostgreSQL databases.',
              },
              {
                name: 'GEMINI_API_KEY',
                description: 'Google Gemini API key for AI content generation features.',
                example: 'AIza...',
                required: true,
                help: 'Get your API key from https://makersuite.google.com/app/apikey',
              },
              {
                name: 'SHOPIFY_STORE_URL',
                description: 'Your Shopify store URL (e.g., your-store.myshopify.com).',
                example: 'https://your-store.myshopify.com',
                required: true,
              },
              {
                name: 'SHOPIFY_ACCESS_TOKEN',
                description: 'Shopify Admin API access token for accessing your store data.',
                example: 'shpat_...',
                required: true,
                help: 'Create a private app in Shopify Admin → Settings → Apps → Develop apps',
              },
            ].map((var_) => (
              <Card key={var_.name} className="border-l-4 border-l-primary-500">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <code className="text-sm font-mono font-semibold text-primary-700 bg-primary-50 px-2 py-1 rounded">
                        {var_.name}
                      </code>
                      {var_.required && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{var_.description}</p>
                    {var_.help && (
                      <p className="text-xs text-gray-600 italic mb-2">💡 {var_.help}</p>
                    )}
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">Example:</p>
                      <code className="block bg-gray-50 px-3 py-2 rounded text-xs font-mono border border-gray-200">
                        {var_.name}={var_.example}
                      </code>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'optional-vars',
      title: 'Optional Environment Variables',
      icon: '🔧',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            These variables enable additional platform integrations. Configure them based on which platforms you want to use.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                platform: 'Meta (Facebook/Instagram)',
                vars: ['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID'],
                description: 'Required for creating and managing Meta ad campaigns.',
                link: 'https://developers.facebook.com/',
              },
              {
                platform: 'Google Ads',
                vars: ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID'],
                description: 'Required for Google Ads campaign management.',
                link: 'https://ads.google.com/',
              },
              {
                platform: 'Klaviyo (Email)',
                vars: ['KLAVIYO_API_KEY', 'KLAVIYO_LIST_ID'],
                description: 'Required for email marketing campaigns.',
                link: 'https://www.klaviyo.com/',
              },
            ].map((platform) => (
              <Card key={platform.platform} hover>
                <h4 className="font-semibold text-gray-900 mb-2">{platform.platform}</h4>
                <p className="text-sm text-gray-600 mb-3">{platform.description}</p>
                <div className="space-y-1 mb-3">
                  {platform.vars.map((v) => (
                    <code key={v} className="block text-xs bg-gray-50 px-2 py-1 rounded font-mono">
                      {v}
                    </code>
                  ))}
                </div>
                <a
                  href={platform.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium inline-flex items-center space-x-1"
                >
                  <span>Get API credentials</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </Card>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'database-setup',
      title: 'Database Setup',
      icon: '🗄️',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            The application uses PostgreSQL as its database. You can set up a local PostgreSQL instance or use a managed service.
          </p>
          <div className="space-y-4">
            <Card>
              <h4 className="font-semibold text-gray-900 mb-3">Option 1: Local PostgreSQL</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <p>1. Install PostgreSQL on your system</p>
                <p>2. Create a database:</p>
                <code className="block bg-gray-50 px-3 py-2 rounded font-mono text-xs mt-2">
                  createdb shopify_marketing
                </code>
                <p className="mt-2">3. Update DATABASE_URL in backend/.env</p>
              </div>
            </Card>
            <Card>
              <h4 className="font-semibold text-gray-900 mb-3">Option 2: Managed Services</h4>
              <div className="grid md:grid-cols-3 gap-3">
                {[
                  { name: 'Supabase', url: 'https://supabase.com' },
                  { name: 'Railway', url: 'https://railway.app' },
                  { name: 'Neon', url: 'https://neon.tech' },
                ].map((service) => (
                  <a
                    key={service.name}
                    href={service.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
                  >
                    {service.name}
                  </a>
                ))}
              </div>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-2">Run Migrations</h4>
              <p className="text-sm text-blue-800 mb-3">
                After setting up your database, run Prisma migrations to create the schema:
              </p>
              <code className="block bg-white px-3 py-2 rounded font-mono text-xs border border-blue-200">
                cd backend && npx prisma migrate dev
              </code>
            </Card>
          </div>
        </div>
      ),
    },
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: '🚀',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            Follow these steps to get your Glowify Marketing AI platform up and running:
          </p>
          <div className="space-y-3">
            {[
              {
                step: 1,
                title: 'Configure Environment Variables',
                description: 'Update backend/.env with your API keys and credentials. See the Required Environment Variables section above.',
              },
              {
                step: 2,
                title: 'Set Up Database',
                description: 'Configure PostgreSQL and run migrations. See Database Setup section for details.',
              },
              {
                step: 3,
                title: 'Start the Application',
                description: 'Start both backend and frontend servers (e.g. npm run dev inside backend/ and frontend/).',
              },
              {
                step: 4,
                title: 'Log In',
                description: 'Navigate to http://localhost:3000/login and enter your API key to access the platform.',
              },
              {
                step: 5,
                title: 'Create Your First Campaign',
                description: 'Use the Create Campaign page to set up your first marketing campaign. The AI will help generate content.',
              },
            ].map((item) => (
              <Card key={item.step} className="border-l-4 border-l-accent-500">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-accent-600 text-white rounded-full flex items-center justify-center font-bold">
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{item.title}</h4>
                    <p className="text-sm text-gray-600">{item.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      icon: '🆘',
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            {[
              {
                issue: 'Login fails with "Invalid API key"',
                solution: 'Ensure the API_KEY in backend/.env matches what you enter on the login page. Restart the backend server after changing .env.',
              },
              {
                issue: 'Database connection errors',
                solution: 'Verify your DATABASE_URL is correct and PostgreSQL is running. Check database credentials and network connectivity.',
              },
              {
                issue: 'AI features not working',
                solution: 'Ensure GEMINI_API_KEY is set correctly in backend/.env. Verify the API key is valid at https://makersuite.google.com/app/apikey',
              },
              {
                issue: 'Campaigns not loading',
                solution: 'Check that the backend server is running and that NEXT_PUBLIC_API_URL in frontend/.env.local points to it. Verify API authentication is working and database migrations have been run.',
              },
            ].map((item, idx) => (
              <Card key={idx} className="border-l-4 border-l-yellow-500">
                <h4 className="font-semibold text-gray-900 mb-2">❌ {item.issue}</h4>
                <p className="text-sm text-gray-700">✅ {item.solution}</p>
              </Card>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <ProtectedRoute>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Setup Guide</h1>
              <p className="text-lg text-gray-600">
                Comprehensive guide to setting up and using Glowify Marketing AI
              </p>
            </div>
            <Link href="/campaigns">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </div>
        </div>

        {/* Table of Contents */}
        <Card className="mb-8 bg-gradient-to-br from-primary-50 to-accent-50 border-primary-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Table of Contents</h2>
          <nav className="space-y-2">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block px-4 py-2 rounded-lg hover:bg-white/50 transition-colors text-gray-700 hover:text-primary-600"
              >
                <span className="mr-2">{section.icon}</span>
                {section.title}
              </a>
            ))}
          </nav>
        </Card>

        {/* Sections */}
        <div className="space-y-8">
          {sections.map((section) => (
            <Card key={section.id} id={section.id} className="scroll-mt-8">
              <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-gray-200">
                <span className="text-3xl">{section.icon}</span>
                <h2 className="text-2xl font-bold text-gray-900">{section.title}</h2>
              </div>
              <div>{section.content}</div>
            </Card>
          ))}
        </div>

        {/* Footer CTA */}
        <Card className="mt-8 bg-gradient-to-r from-primary-600 to-accent-600 text-white">
          <div className="text-center">
            <h3 className="text-2xl font-bold mb-2">Ready to Get Started?</h3>
            <p className="text-primary-100 mb-4">
              Configure your environment variables and start creating amazing marketing campaigns!
            </p>
            <div className="flex justify-center space-x-4">
              <Link href="/campaigns">
                <Button variant="secondary" size="lg">
                  Go to Campaigns
                </Button>
              </Link>
              <Link href="/campaigns/new">
                <Button variant="outline" size="lg" className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                  Create Campaign
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

