#!/usr/bin/env node
/**
 * ============================================================================
 *  Shopify Token Helper
 * ============================================================================
 *
 *  Standalone script. It does ONE job:
 *    1. Reads your store URL + Client ID + Client Secret from backend/.env
 *    2. Requests a fresh Admin API access token (client credentials grant)
 *    3. Verifies the token against the store
 *    4. Writes SHOPIFY_ACCESS_TOKEN back into backend/.env
 *
 *  The main application code is NOT modified. It keeps reading the same
 *  environment variable it already reads today (SHOPIFY_ACCESS_TOKEN).
 *
 *  Usage:
 *      node scripts/shopify-auth/index.js            # fetch once
 *      node scripts/shopify-auth/index.js --watch    # refresh every ~22h
 *      node scripts/shopify-auth/index.js --status   # show current token state
 *
 *  Requires Node 18+ (uses the built-in global fetch). Zero dependencies.
 *
 *  NOTE: These tokens expire after 24 hours. In --watch mode this script keeps
 *  the token fresh, but the backend reads .env only at startup — so restart the
 *  backend (or use the app's dev watcher) to pick up a newly written token.
 * ============================================================================
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/* -------------------------------------------------------------------------- */
/*  Config                                                                    */
/* -------------------------------------------------------------------------- */

const ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(ROOT, 'backend', '.env');
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-10';

const args = process.argv.slice(2);
const WATCH = args.includes('--watch');
const STATUS_ONLY = args.includes('--status');
const REFRESH_MS = Number(process.env.SHOPIFY_REFRESH_MS || 22 * 60 * 60 * 1000); // 22h

/* -------------------------------------------------------------------------- */
/*  Tiny .env read / write (keeps every other line untouched)                 */
/* -------------------------------------------------------------------------- */

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

function updateEnvFile(file, updates) {
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const pending = { ...updates };
  const lines = content.split(/\r?\n/);

  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && Object.prototype.hasOwnProperty.call(pending, m[1])) {
      const key = m[1];
      const value = pending[key];
      delete pending[key];
      return `${key}=${value}`;
    }
    return line;
  });

  const remaining = Object.entries(pending);
  if (remaining.length) {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push('# --- Written by scripts/shopify-auth ---');
    for (const [k, v] of remaining) out.push(`${k}=${v}`);
  }

  fs.writeFileSync(file, out.join('\n'));
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function looksLikePlaceholder(v) {
  if (!v) return true;
  return /^your_|^xxx|^<|placeholder|_here$/i.test(v);
}

function normalizeStoreUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`  [${stamp()}] ${msg}`);
}

/* -------------------------------------------------------------------------- */
/*  Core                                                                      */
/* -------------------------------------------------------------------------- */

async function fetchToken({ store, clientId, clientSecret }) {
  const url = `https://${store}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Token request failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || data.error || !data.access_token) {
    const msg = data.error_description || data.error || text.slice(0, 200);
    throw new Error(`Token request failed: ${msg}`);
  }
  return data;
}

async function verifyToken({ store, token }) {
  const url = `https://${store}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: '{ shop { name currencyCode } }' }),
  });
  const data = await res.json();
  if (data.errors) {
    throw new Error(`Token verification failed: ${JSON.stringify(data.errors)}`);
  }
  return data.data && data.data.shop ? data.data.shop : null;
}

async function refreshOnce() {
  const env = loadEnvFile(ENV_PATH);
  const store = normalizeStoreUrl(process.env.SHOPIFY_STORE_URL || env.SHOPIFY_STORE_URL);
  const clientId = process.env.SHOPIFY_API_KEY || env.SHOPIFY_API_KEY || '';
  const clientSecret = process.env.SHOPIFY_API_SECRET || env.SHOPIFY_API_SECRET || '';

  if (!store) throw new Error('SHOPIFY_STORE_URL is missing in backend/.env');
  if (looksLikePlaceholder(clientId)) {
    throw new Error('SHOPIFY_API_KEY (Client ID) is missing in backend/.env');
  }
  if (looksLikePlaceholder(clientSecret)) {
    throw new Error('SHOPIFY_API_SECRET (Client Secret) is missing in backend/.env');
  }

  const data = await fetchToken({ store, clientId, clientSecret });
  const scopeCount = (data.scope || '').split(',').filter(Boolean).length;

  const shop = await verifyToken({ store, token: data.access_token });

  updateEnvFile(ENV_PATH, {
    SHOPIFY_ACCESS_TOKEN: data.access_token,
    SHOPIFY_ACCESS_TOKEN_GENERATED_AT: new Date().toISOString(),
  });

  return { data, shop, store, scopeCount };
}

/* -------------------------------------------------------------------------- */
/*  Entry                                                                     */
/* -------------------------------------------------------------------------- */

function printStatus() {
  const env = loadEnvFile(ENV_PATH);
  const token = env.SHOPIFY_ACCESS_TOKEN || '';
  const generatedAt = env.SHOPIFY_ACCESS_TOKEN_GENERATED_AT || '';
  const store = normalizeStoreUrl(env.SHOPIFY_STORE_URL);
  const clientId = env.SHOPIFY_API_KEY || '';

  console.log('');
  console.log('  Shopify Token Helper — status');
  console.log('  ────────────────────────────────────────────────');
  console.log(`  Store:        ${store || '❌ missing'}`);
  console.log(`  Client ID:    ${looksLikePlaceholder(clientId) ? '❌ missing' : clientId}`);
  console.log(`  Token:        ${token ? token.slice(0, 12) + '…' + token.slice(-6) : '❌ missing'}`);
  console.log(`  Generated at: ${generatedAt || 'unknown'}`);

  if (generatedAt) {
    const ageH = (Date.now() - new Date(generatedAt).getTime()) / 3600000;
    const leftH = 24 - ageH;
    console.log(`  Age:          ${ageH.toFixed(1)}h`);
    console.log(
      `  Expires in:   ${leftH > 0 ? leftH.toFixed(1) + 'h' : 'EXPIRED'}`
    );
  }
  console.log('');
}

async function main() {
  if (STATUS_ONLY) {
    printStatus();
    return;
  }

  console.log('');
  console.log('  Shopify Token Helper');
  console.log('  ────────────────────────────────────────────────');
  console.log(`  Writes to:    ${ENV_PATH}`);
  console.log(`  API version:  ${API_VERSION}`);
  console.log(`  Mode:         ${WATCH ? 'watch (refresh every ~22h)' : 'one-shot'}`);
  console.log('');

  const run = async () => {
    try {
      const { data, shop, store, scopeCount } = await refreshOnce();
      const expiryH = data.expires_in ? (data.expires_in / 3600).toFixed(0) : '?';
      log(`✓ Token saved to backend/.env`);
      log(`  store:  ${store}${shop ? ` (${shop.name}, ${shop.currencyCode})` : ''}`);
      log(`  token:  ${data.access_token.slice(0, 12)}…${data.access_token.slice(-6)}`);
      log(`  scopes: ${scopeCount}`);
      log(`  expires in ~${expiryH}h`);
      if (!WATCH) {
        console.log('');
        console.log('  ⚠  Restart the backend so it loads the new token.');
        console.log('');
      }
    } catch (err) {
      log(`✗ ${err.message}`);
      if (!WATCH) process.exitCode = 1;
    }
  };

  await run();

  if (WATCH) {
    log(`Watching — next refresh in ${(REFRESH_MS / 3600000).toFixed(1)}h. Ctrl+C to stop.`);
    setInterval(run, REFRESH_MS);
  }
}

main().catch((err) => {
  console.error('  Fatal:', err.message);
  process.exitCode = 1;
});
