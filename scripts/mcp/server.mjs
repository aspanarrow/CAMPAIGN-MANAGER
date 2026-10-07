#!/usr/bin/env node
/**
 * ============================================================================
 *  Glowify MCP Server — Model Context Protocol
 * ============================================================================
 *
 *  Exposes the CAMPAIGN-MANAGER backend as MCP tools so any MCP client
 *  (Claude Desktop, Cursor, Claude Code, etc.) can control your marketing
 *  app from outside.
 *
 *  Two transports:
 *    --stdio   : local stdio (for Claude Desktop / Cursor MCP config)
 *    (default) : Streamable HTTP on port 3910 (for remote/browser clients)
 *
 *  Usage:
 *    node server.mjs              # HTTP mode → http://localhost:3910/mcp
 *    node server.mjs --stdio      # stdio mode (for MCP client configs)
 *
 *  Env (auto-read from backend/.env):
 *    MCP_BACKEND_URL  (default http://localhost:5001)
 *    MCP_API_KEY      (backend API key — forwarded as x-api-key)
 *    MCP_PORT         (default 3910)
 *    MCP_HTTP_TOKEN   (optional — bearer token to protect the HTTP endpoint)
 *
 *  Standalone folder — does NOT touch the main app code.
 * ============================================================================
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* -------------------------------------------------------------------------- */
/*  Config — auto-read backend/.env for API key + backend URL                 */
/* -------------------------------------------------------------------------- */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const envFile = loadEnvFile(path.resolve(__dirname, '..', '..', 'backend', '.env'));

const BACKEND_URL = process.env.MCP_BACKEND_URL || envFile.API_URL || 'http://localhost:5001';
const API_KEY = process.env.MCP_API_KEY || envFile.API_KEY || '';
const HTTP_TOKEN = process.env.MCP_HTTP_TOKEN || '';
const PORT = Number(process.env.MCP_PORT || 3910);

/* -------------------------------------------------------------------------- */
/*  Backend API helper                                                        */
/* -------------------------------------------------------------------------- */

async function api(method, endpoint, body) {
  const res = await fetch(`${BACKEND_URL}/api${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Backend returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error || `Backend HTTP ${res.status}`);
  }
  return data;
}

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(error) {
  return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
}

/* -------------------------------------------------------------------------- */
/*  MCP server + tools                                                        */
/* -------------------------------------------------------------------------- */

function buildServer() {
  const server = new McpServer({ name: 'glowify', version: '1.1.0' });

  // ---------- System ----------
  server.tool('health', 'Backend health check — verify the marketing app is running.', {}, async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      return ok(await res.json());
    } catch (e) { return fail(e); }
  });

  // ---------- Campaigns ----------
  server.tool(
    'list_campaigns',
    'List all marketing campaigns with status, budget, spend, ROAS and Meta external IDs.',
    {
      platform: z.enum(['META', 'GOOGLE_ADS', 'EMAIL']).optional().describe('Filter by platform'),
      status: z.enum(['DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 50)'),
    },
    async ({ platform, status, limit }) => {
      try {
        const q = new URLSearchParams();
        if (platform) q.set('platform', platform);
        if (status) q.set('status', status);
        if (limit) q.set('limit', String(limit));
        return ok(await api('GET', `/campaigns?${q.toString()}`));
      } catch (e) { return fail(e); }
    }
  );

  server.tool(
    'get_campaign',
    'Get full campaign details: metrics, ad sets, ads, approvals.',
    { id: z.string().describe('Campaign ID') },
    async ({ id }) => {
      try { return ok(await api('GET', `/campaigns/${id}`)); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'create_campaign',
    'Create a new marketing campaign. AI generates ad copy from the Shopify product. Returns campaign + pending approval (unless autoApprove).',
    {
      name: z.string().optional().describe('Campaign name (auto-generated from product if empty)'),
      platform: z.enum(['META', 'GOOGLE_ADS', 'EMAIL']).default('META'),
      productId: z.string().optional().describe('Shopify product ID for AI ad copy (top-selling if empty)'),
      budget: z.number().positive().describe('Total budget (INR)'),
      dailyBudget: z.number().positive().optional().describe('Daily budget (INR)'),
      objective: z.string().default('CONVERSIONS').describe('e.g. CONVERSIONS, AWARENESS, TRAFFIC'),
      autoApprove: z.boolean().default(false).describe('Skip approval and deploy immediately'),
    },
    async ({ name, platform, productId, budget, dailyBudget, objective, autoApprove }) => {
      try {
        return ok(await api('POST', '/campaigns', {
          name, platform,
          productIds: productId ? [productId] : undefined,
          budget, dailyBudget, objective, autoApprove,
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.tool(
    'deploy_campaign',
    'Deploy an approved campaign to its ad platform (creates campaign + ad set on Meta). Requires the campaign to be approved first.',
    { id: z.string().describe('Campaign ID') },
    async ({ id }) => {
      try { return ok(await api('POST', `/campaigns/${id}/deploy`)); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'sync_campaign_metrics',
    'Force-sync a campaign: pulls latest metrics + status from the ad platform and re-computes ROAS from attributed Shopify orders.',
    { id: z.string().describe('Campaign ID') },
    async ({ id }) => {
      try { return ok(await api('POST', `/campaigns/${id}/sync`)); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'update_campaign',
    'Update campaign name / daily budget / status. Budget + status changes sync to the ad platform.',
    {
      id: z.string().describe('Campaign ID'),
      name: z.string().optional(),
      dailyBudget: z.number().positive().optional().describe('New daily budget (INR)'),
      status: z.enum(['ACTIVE', 'PAUSED']).optional().describe('Pause or resume on the platform'),
    },
    async ({ id, name, dailyBudget, status }) => {
      try { return ok(await api('PATCH', `/campaigns/${id}`, { name, dailyBudget, status })); }
      catch (e) { return fail(e); }
    }
  );

  // ---------- Products ----------
  server.tool(
    'list_products',
    'List products from the connected Shopify store (for picking campaign products).',
    { limit: z.number().int().min(1).max(100).default(20) },
    async ({ limit }) => {
      try { return ok(await api('GET', `/products?limit=${limit}`)); }
      catch (e) { return fail(e); }
    }
  );

  // ---------- Approvals ----------
  server.tool(
    'list_approvals',
    'List pending approvals (campaign creations, budget changes, pauses waiting for human sign-off).',
    {},
    async () => {
      try { return ok(await api('GET', '/approvals')); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'approve_request',
    'Approve a pending request. For campaign creations this executes the deploy to the ad platform.',
    {
      id: z.string().describe('Approval ID'),
      approvedBy: z.string().default('mcp').describe('Who approved (recorded in audit log)'),
    },
    async ({ id, approvedBy }) => {
      try { return ok(await api('POST', `/approvals/${id}/approve`, { approvedBy })); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'reject_request',
    'Reject a pending request with a reason.',
    {
      id: z.string().describe('Approval ID'),
      rejectedBy: z.string().default('mcp'),
      reason: z.string().describe('Why the request is rejected'),
    },
    async ({ id, rejectedBy, reason }) => {
      try { return ok(await api('POST', `/approvals/${id}/reject`, { rejectedBy, reason })); }
      catch (e) { return fail(e); }
    }
  );

  // ---------- Profit (India unit economics) ----------
  server.tool(
    'profit_summary',
    'India unit economics KPIs: net revenue, contribution margin, CM%, max CAC, break-even ROAS, prepaid%, RTO%, plus COGS coverage % and warnings (honesty flags).',
    {
      from: z.string().optional().describe('ISO date — range start'),
      to: z.string().optional().describe('ISO date — range end'),
    },
    async ({ from, to }) => {
      try {
        const q = new URLSearchParams();
        if (from) q.set('from', from);
        if (to) q.set('to', to);
        return ok(await api('GET', `/profit/summary?${q.toString()}`));
      } catch (e) { return fail(e); }
    }
  );

  server.tool(
    'profit_orders',
    'Drill-down into per-order economics: COD/prepaid, net revenue, contribution margin, outcome, data quality.',
    {
      filter: z.enum(['cod', 'prepaid', 'rto', 'no_cogs']).optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(100).default(25),
    },
    async ({ filter, page, limit }) => {
      try {
        const q = new URLSearchParams({ limit: String(limit) });
        if (filter) q.set('filter', filter);
        if (page) q.set('page', String(page));
        return ok(await api('GET', `/profit/orders?${q.toString()}`));
      } catch (e) { return fail(e); }
    }
  );

  server.tool(
    'profit_campaigns',
    'Campaign profit table — spend vs REAL contribution margin (sorted by contribution, not ROAS). Verdict: Losing money / Thin / Healthy.',
    {
      from: z.string().optional(),
      to: z.string().optional(),
    },
    async ({ from, to }) => {
      try {
        const q = new URLSearchParams();
        if (from) q.set('from', from);
        if (to) q.set('to', to);
        return ok(await api('GET', `/profit/campaigns?${q.toString()}`));
      } catch (e) { return fail(e); }
    }
  );

  server.tool(
    'set_order_outcome',
    'Manually mark an order outcome (DELIVERED / RTO / RETURNED / CANCELLED). This turns assumed RTO rates into measured data.',
    {
      id: z.string().describe('OrderEconomics row ID'),
      outcome: z.enum(['PENDING', 'DELIVERED', 'RTO', 'RETURNED', 'CANCELLED']),
      confirmedBy: z.string().default('mcp'),
    },
    async ({ id, outcome, confirmedBy }) => {
      try {
        return ok(await api('PATCH', `/profit/orders/${id}/outcome`, { outcome, confirmedBy }));
      } catch (e) { return fail(e); }
    }
  );

  server.tool(
    'sync_profit_orders',
    'Pull recent Shopify orders into the economics engine (COD detection, COGS, contribution margin).',
    {
      since: z.string().optional().describe('ISO date — only orders after this date'),
    },
    async ({ since }) => {
      try { return ok(await api('POST', '/profit/sync', { since })); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'get_cost_assumptions',
    'List editable India cost assumptions (payment fees, COD fees, packaging, shipping, assumed RTO rate).',
    {},
    async () => {
      try { return ok(await api('GET', '/profit/costs')); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'update_cost_assumption',
    'Update one cost assumption value and recompute all order economics. Every rupee assumption lives here — never hard-coded.',
    {
      key: z.string().describe('Assumption key, e.g. forward_ship_per_order, assumed_rto_rate'),
      value: z.number().describe('New value'),
    },
    async ({ key, value }) => {
      try {
        await api('PUT', '/profit/costs', { key, value });
        await api('POST', '/profit/recompute', {});
        return ok({ updated: key, value, recompute: 'done' });
      } catch (e) { return fail(e); }
    }
  );

  // ---------- Automation ----------
  server.tool(
    'list_automation_rules',
    'List automation rules (e.g. "if ROAS < 2, propose pause").',
    {},
    async () => {
      try { return ok(await api('GET', '/automation/rules')); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'create_automation_rule',
    'Create an automation rule that watches campaign metrics and proposes (or auto-applies) actions. Actions need approval by default.',
    {
      name: z.string().describe('Rule name, e.g. "Pause low ROAS"'),
      metric: z.enum(['roas', 'ctr', 'cpc', 'spend', 'conversions', 'clicks', 'impressions', 'contributionMargin']).describe('Metric to watch'),
      operator: z.enum(['lt', 'lte', 'gt', 'gte']).describe('Comparison operator'),
      value: z.number().describe('Threshold value'),
      action: z.enum(['PAUSE_CAMPAIGN', 'INCREASE_BUDGET', 'DECREASE_BUDGET']).describe('Action when threshold crossed'),
      percentage: z.number().optional().describe('Budget change % (for budget actions)'),
      requiresApproval: z.boolean().default(true).describe('Queue as approval request (recommended) vs auto-execute'),
    },
    async ({ name, metric, operator, value, action, percentage, requiresApproval }) => {
      try {
        return ok(await api('POST', '/automation/rules', {
          name,
          conditions: { metric, operator, value },
          actions: [{ type: action, percentage, requiresApproval }],
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.tool(
    'evaluate_rules_now',
    'Run the automation rules engine against a campaign immediately (syncs metrics first).',
    { campaignId: z.string().describe('Campaign ID') },
    async ({ campaignId }) => {
      try { return ok(await api('POST', `/automation/evaluate/${campaignId}`, {})); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'toggle_automation_rule',
    'Enable or disable an automation rule.',
    {
      id: z.string().describe('Rule ID'),
      enabled: z.boolean().describe('true = enable, false = disable'),
    },
    async ({ id, enabled }) => {
      try { return ok(await api('PATCH', `/automation/rules/${id}`, { enabled })); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'delete_automation_rule',
    'Delete an automation rule permanently.',
    { id: z.string().describe('Rule ID') },
    async ({ id }) => {
      try { return ok(await api('DELETE', `/automation/rules/${id}`)); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'get_audit_log',
    'Recent audit log — who approved/paused/changed what, when.',
    {
      limit: z.number().int().min(1).max(200).default(50),
      entityType: z.string().optional().describe('Filter: campaign, approval, rule, order_economics, cost_assumption'),
    },
    async ({ limit, entityType }) => {
      try {
        const q = new URLSearchParams({ limit: String(limit) });
        if (entityType) q.set('entityType', entityType);
        return ok(await api('GET', `/automation/audit?${q.toString()}`));
      } catch (e) { return fail(e); }
    }
  );

  // ---------- Analytics ----------
  server.tool(
    'get_analytics',
    'Aggregated overview: total campaigns, impressions, clicks, spend, revenue, ROAS — by platform and status.',
    {},
    async () => {
      try { return ok(await api('GET', '/analytics')); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'optimize_campaign',
    'AI analysis of a campaign: performance recommendations + suggested actions (budget, pause, creative).',
    { id: z.string().describe('Campaign ID') },
    async ({ id }) => {
      try { return ok(await api('POST', `/campaigns/${id}/optimize`, {})); }
      catch (e) { return fail(e); }
    }
  );

  // ---------- Labs: A/B tests ----------
  server.tool(
    'list_abtests',
    'List all A/B tests with their ads and performance.',
    {},
    async () => {
      try { return ok(await api('GET', '/labs/abtests')); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'create_abtest',
    'Create an A/B test comparing 2+ ads.',
    {
      name: z.string().describe('Test name'),
      adIds: z.array(z.string()).describe('At least 2 ad IDs to compare'),
      trafficSplit: z.number().optional().describe('Traffic % for variant A (default 50)'),
    },
    async ({ name, adIds, trafficSplit }) => {
      try { return ok(await api('POST', '/labs/abtests', { name, adIds, trafficSplit })); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'complete_abtest',
    'Complete an A/B test — auto-picks winner by conversions/CTR.',
    { id: z.string().describe('A/B test ID') },
    async ({ id }) => {
      try { return ok(await api('POST', `/labs/abtests/${id}/complete`, {})); }
      catch (e) { return fail(e); }
    }
  );

  // ---------- Labs: AI content (H4) ----------
  server.tool(
    'generate_content',
    'Generate marketing content with AI: AD_COPY, PRODUCT_DESCRIPTION, EMAIL_SUBJECT, EMAIL_BODY, SOCIAL_POST.',
    {
      type: z.enum(['AD_COPY', 'PRODUCT_DESCRIPTION', 'EMAIL_SUBJECT', 'EMAIL_BODY', 'SOCIAL_POST']).describe('Content type'),
      prompt: z.string().describe('Brief / prompt for the AI'),
      productName: z.string().optional().describe('Product name'),
      productDescription: z.string().optional().describe('Product description'),
      targetAudience: z.string().optional().describe('Target audience'),
      tone: z.string().optional().describe('Tone (professional/casual/luxury/friendly)'),
    },
    async (args) => {
      try { return ok(await api('POST', '/labs/content/generate', args)); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'list_content',
    'List AI-generated content (filter by type/status).',
    {
      type: z.string().optional().describe('Filter by type'),
      status: z.string().optional().describe('Filter by status'),
    },
    async ({ type, status }) => {
      try {
        const q = new URLSearchParams();
        if (type) q.set('type', type);
        if (status) q.set('status', status);
        return ok(await api('GET', `/labs/content?${q.toString()}`));
      } catch (e) { return fail(e); }
    }
  );

  // ---------- Labs: Email campaigns ----------
  server.tool(
    'list_emails',
    'List email campaigns.',
    {},
    async () => {
      try { return ok(await api('GET', '/labs/emails')); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'create_email',
    'Create an email campaign.',
    {
      name: z.string().describe('Campaign name'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body (HTML or text)'),
      listId: z.string().optional().describe('Email list ID'),
    },
    async (args) => {
      try { return ok(await api('POST', '/labs/emails', args)); }
      catch (e) { return fail(e); }
    }
  );

  server.tool(
    'send_email',
    'Send an email campaign (via Klaviyo if configured, else marked sent).',
    { id: z.string().describe('Email campaign ID') },
    async ({ id }) => {
      try { return ok(await api('POST', `/labs/emails/${id}/send`, {})); }
      catch (e) { return fail(e); }
    }
  );

  return server;
}

/* -------------------------------------------------------------------------- */
/*  Transports                                                                */
/* -------------------------------------------------------------------------- */

async function startStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Glowify MCP server running on stdio');
}

async function startHttp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Simple bearer-token guard for the HTTP endpoint
  app.use((req, res, next) => {
    if (!HTTP_TOKEN) return next(); // no token configured = open (local network)
    const auth = req.headers.authorization || '';
    if (auth === `Bearer ${HTTP_TOKEN}`) return next();
    res.status(401).json({ error: 'Unauthorized — send Authorization: Bearer <MCP_HTTP_TOKEN>' });
  });

  // Stateless Streamable HTTP: one transport per request (fine for MCP clients)
  app.post('/mcp', async (req, res) => {
    try {
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: e.message }, id: null });
    }
  });

  // GET/DELETE not supported in stateless mode
  app.get('/mcp', (_req, res) => res.status(405).json({ error: 'Use POST for MCP (stateless)' }));

  app.get('/health', (_req, res) => res.json({ ok: true, backend: BACKEND_URL }));

  app.listen(PORT, () => {
    console.error(`Glowify MCP server running → http://localhost:${PORT}/mcp`);
    console.error(`Backend: ${BACKEND_URL}`);
    console.error(`HTTP auth: ${HTTP_TOKEN ? 'bearer token required' : 'OPEN (local network only — set MCP_HTTP_TOKEN to protect)'}`);
  });
}

const isStdio = process.argv.includes('--stdio');
if (isStdio) {
  startStdio().catch((e) => { console.error(e); process.exit(1); });
} else {
  startHttp().catch((e) => { console.error(e); process.exit(1); });
}
