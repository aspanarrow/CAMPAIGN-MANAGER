#!/usr/bin/env node
/**
 * ============================================================================
 *  Meta (Facebook / Instagram) OAuth Helper
 * ============================================================================
 *
 *  Standalone script. It does ONE job:
 *    1. Opens the Facebook OAuth dialog ("Connect with Facebook")
 *    2. Exchanges the returned code for a SHORT-lived token
 *    3. Upgrades it to a LONG-lived token (~60 days)
 *    4. Fetches your Ad Accounts and Pages
 *    5. Lets you pick one, then writes the values into backend/.env:
 *
 *         META_ACCESS_TOKEN=...
 *         META_AD_ACCOUNT_ID=act_...
 *         META_PAGE_ID=...            (optional)
 *
 *  The main application code is NOT modified. It keeps reading the same
 *  environment variables it already reads today.
 *
 *  Usage:
 *      node scripts/meta-oauth/index.js
 *
 *  Requires Node 18+ (uses the built-in global fetch). Zero dependencies.
 * ============================================================================
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/* -------------------------------------------------------------------------- */
/*  Config                                                                    */
/* -------------------------------------------------------------------------- */

const GRAPH_VERSION = 'v18.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const PORT = Number(process.env.META_OAUTH_PORT || 5555);
const REDIRECT_URI =
  process.env.META_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/callback`;

// Scopes the main app needs (meta.service.ts: create campaigns, adsets, ads,
// creatives, read insights). pages_show_list lets us fetch the Page ID used
// for ad creatives.
const SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
];

const ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(ROOT, 'backend', '.env');

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
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
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
    out.push('# --- Written by scripts/meta-oauth ---');
    for (const [k, v] of remaining) out.push(`${k}=${v}`);
  }

  fs.writeFileSync(file, out.join('\n'));
}

/* -------------------------------------------------------------------------- */
/*  Credentials from backend/.env (or process.env)                            */
/* -------------------------------------------------------------------------- */

let APP_ID = '';
let APP_SECRET = '';

function looksLikePlaceholder(v) {
  if (!v) return true;
  return /^your_|^xxx|^<|placeholder|_here$/i.test(v);
}

// Re-read credentials from the environment and backend/.env. Called at startup
// and again right after the user saves them through the browser form.
function loadCredentials() {
  const envFile = loadEnvFile(ENV_PATH);
  APP_ID = process.env.META_APP_ID || envFile.META_APP_ID || '';
  APP_SECRET = process.env.META_APP_SECRET || envFile.META_APP_SECRET || '';
}

function hasCredentials() {
  return !looksLikePlaceholder(APP_ID) && !looksLikePlaceholder(APP_SECRET);
}

loadCredentials();

/* -------------------------------------------------------------------------- */
/*  In-memory session (single local user)                                     */
/* -------------------------------------------------------------------------- */

let oauthState = null;
let longToken = null;
let tokenExpiresAt = null; // unix seconds
let adAccounts = [];
let pages = [];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function graphGet(pathname, params = {}) {
  const url = new URL(GRAPH + pathname);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    const e = data.error;
    throw new Error(`${e.message}${e.code ? ` (code ${e.code})` : ''}`);
  }
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · Meta OAuth Helper</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #0b0f14; color: #e6edf3; padding: 24px;
  }
  .card {
    width: 100%; max-width: 640px; background: #121821;
    border: 1px solid #22303f; border-radius: 16px; padding: 28px 30px;
    box-shadow: 0 20px 60px rgba(0,0,0,.45);
  }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p.sub { margin: 0 0 22px; color: #8b9bb0; font-size: 14px; line-height: 1.5; }
  a.btn, button.btn {
    display: inline-block; background: #1877f2; color: #fff; text-decoration: none;
    padding: 12px 20px; border-radius: 10px; font-weight: 600; border: 0;
    font-size: 15px; cursor: pointer;
  }
  a.btn:hover, button.btn:hover { background: #1467d6; }
  .list { display: grid; gap: 10px; margin: 18px 0 6px; }
  .item {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    border: 1px solid #22303f; border-radius: 12px; padding: 14px 16px;
    background: #0f1620; text-decoration: none; color: inherit;
  }
  .item:hover { border-color: #1877f2; background: #101c2a; }
  .item .name { font-weight: 600; font-size: 14px; }
  .item .id { color: #8b9bb0; font-size: 12px; font-family: ui-monospace, monospace; }
  .item .go { color: #4c9aff; font-size: 13px; font-weight: 600; white-space: nowrap; }
  .note { margin-top: 18px; font-size: 13px; color: #8b9bb0; line-height: 1.6; }
  .ok { color: #3fb950; font-weight: 600; }
  .err { color: #f85149; font-weight: 600; }
  code {
    background: #0b1119; border: 1px solid #22303f; border-radius: 6px;
    padding: 2px 6px; font-size: 12.5px; font-family: ui-monospace, monospace;
    word-break: break-all;
  }
  .kv { margin: 14px 0; display: grid; gap: 8px; }
  .kv div { font-size: 13px; }
  .kv b { color: #8b9bb0; font-weight: 500; display: inline-block; min-width: 150px; }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function missingConfigPage(errorMsg) {
  const err = errorMsg
    ? `<p class="err" style="margin:0 0 16px">${escapeHtml(errorMsg)}</p>`
    : '';
  return page(
    'Connect Meta',
    `<h1>Connect your Meta app</h1>
     <p class="sub">Paste your App ID and App Secret once. They are saved to
        <code>backend/.env</code> and you won't be asked again.</p>
     ${err}
     <form method="POST" action="/save">
       <label class="field">
         <span>App ID</span>
         <input type="text" name="appId" inputmode="numeric" autocomplete="off"
                placeholder="123456789012345" required />
       </label>
       <label class="field">
         <span>App Secret</span>
         <input type="password" name="appSecret" autocomplete="off"
                placeholder="your app secret" required />
       </label>
       <button class="btn" type="submit">Save &amp; Connect with Facebook →</button>
     </form>
     <p class="note">
       Find both in <b>developers.facebook.com</b> → your app →
       <b>Settings → Basic</b>.<br>
       Also add this to <b>Facebook Login → Settings → Valid OAuth Redirect URIs</b>:<br>
       <code>${escapeHtml(REDIRECT_URI)}</code>
     </p>
     <style>
       .field { display:block; margin: 0 0 14px; }
       .field span { display:block; font-size:13px; color:#8b9bb0; margin-bottom:6px; }
       .field input {
         width:100%; padding:12px 14px; border-radius:10px; font-size:15px;
         background:#0b1119; border:1px solid #22303f; color:#e6edf3;
         font-family: ui-monospace, monospace;
       }
       .field input:focus { outline:none; border-color:#1877f2; }
       button.btn { width:100%; margin-top:6px; }
     </style>`
  );
}

/* -------------------------------------------------------------------------- */
/*  Route handlers                                                            */
/* -------------------------------------------------------------------------- */

function handleHome(res) {
  if (!hasCredentials()) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(missingConfigPage());
    return;
  }
  oauthState = crypto.randomBytes(16).toString('hex');
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', APP_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', oauthState);
  url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('response_type', 'code');

  res.writeHead(302, { Location: url.toString() });
  res.end();
}

// Read a form-urlencoded POST body (small; capped for safety).
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Save App ID + Secret from the browser form, then send the user to Facebook.
async function handleSave(req, res) {
  let fields;
  try {
    fields = new URLSearchParams(await readBody(req));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(missingConfigPage(err.message));
    return;
  }

  const appId = (fields.get('appId') || '').trim();
  const appSecret = (fields.get('appSecret') || '').trim();

  if (!appId || !appSecret) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(missingConfigPage('Both App ID and App Secret are required.'));
    return;
  }

  try {
    updateEnvFile(ENV_PATH, {
      META_APP_ID: appId,
      META_APP_SECRET: appSecret,
    });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(missingConfigPage(`Could not write .env: ${err.message}`));
    return;
  }

  loadCredentials();
  console.log(`  ✓ Credentials saved to ${ENV_PATH} (App ID ${appId})`);

  // Continue straight into the Facebook dialog.
  res.writeHead(302, { Location: '/connect' });
  res.end();
}

async function handleCallback(reqUrl, res) {
  const code = reqUrl.searchParams.get('code');
  const returnedState = reqUrl.searchParams.get('state');
  const error = reqUrl.searchParams.get('error_description') || reqUrl.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Authorization failed', `<h1 class="err">Authorization failed</h1><p class="sub">${escapeHtml(error)}</p><a class="btn" href="/">Try again</a>`));
    return;
  }
  if (!code || returnedState !== oauthState) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Invalid callback', `<h1 class="err">Invalid callback</h1><p class="sub">Missing code or state mismatch. Start over.</p><a class="btn" href="/">Start over</a>`));
    return;
  }

  try {
    // 1) code -> short-lived token
    const shortRes = await graphGet('/oauth/access_token', {
      client_id: APP_ID,
      client_secret: APP_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
    });
    const shortToken = shortRes.access_token;

    // 2) short-lived -> long-lived (~60 days)
    const longRes = await graphGet('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: APP_ID,
      client_secret: APP_SECRET,
      fb_exchange_token: shortToken,
    });
    longToken = longRes.access_token;

    // 3) token metadata (expiry / scopes)
    try {
      const dbg = await graphGet('/debug_token', {
        input_token: longToken,
        access_token: `${APP_ID}|${APP_SECRET}`,
      });
      tokenExpiresAt = dbg.data && dbg.data.expires_at ? dbg.data.expires_at : null;
    } catch {
      tokenExpiresAt = null;
    }

    // 4) fetch ad accounts + pages
    const accRes = await graphGet('/me/adaccounts', {
      access_token: longToken,
      fields: 'id,name,account_id,currency,account_status',
      limit: '100',
    });
    adAccounts = accRes.data || [];

    try {
      const pageRes = await graphGet('/me/accounts', {
        access_token: longToken,
        fields: 'id,name',
        limit: '100',
      });
      pages = pageRes.data || [];
    } catch {
      pages = [];
    }

    if (adAccounts.length === 0) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('No ad accounts', `<h1 class="err">No ad accounts found</h1>
        <p class="sub">This Facebook user has no ad accounts. Make sure you are logged in with the account that owns the ad account (Business Manager), and that it is a <b>dev/test</b> user of the app.</p>
        <a class="btn" href="/">Try again</a>`));
      return;
    }

    const items = adAccounts
      .map(
        (a) => `<a class="item" href="/select?account=${encodeURIComponent(a.id)}">
          <span>
            <span class="name">${escapeHtml(a.name || '(unnamed)')}</span><br>
            <span class="id">${escapeHtml(a.id)} · ${escapeHtml(a.currency || '')} · status ${escapeHtml(String(a.account_status))}</span>
          </span>
          <span class="go">use this →</span>
        </a>`
      )
      .join('');

    const expiry = tokenExpiresAt
      ? escapeHtml(new Date(tokenExpiresAt * 1000).toLocaleString())
      : 'unknown';

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      page(
        'Pick an ad account',
        `<h1>Connected ✓</h1>
         <p class="sub">Long-lived token acquired (expires <b>${expiry}</b>). Now choose which ad account this app should use.</p>
         <div class="list">${items}</div>
         <p class="note">The chosen token + account will be written to <code>backend/.env</code>.</p>`
      )
    );
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Error', `<h1 class="err">Something went wrong</h1><p class="sub">${escapeHtml(err.message)}</p><a class="btn" href="/">Try again</a>`));
  }
}

function handleSelect(reqUrl, res) {
  const accountId = reqUrl.searchParams.get('account');

  if (!longToken || !accountId) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Session expired', `<h1 class="err">Session expired</h1><p class="sub">Restart the flow.</p><a class="btn" href="/">Start over</a>`));
    return;
  }

  const account = adAccounts.find((a) => a.id === accountId);
  const pageId = pages.length ? pages[0].id : '';

  const updates = {
    META_ACCESS_TOKEN: longToken,
    META_AD_ACCOUNT_ID: accountId,
  };
  if (pageId) updates.META_PAGE_ID = pageId;

  try {
    updateEnvFile(ENV_PATH, updates);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Write failed', `<h1 class="err">Could not write .env</h1><p class="sub">${escapeHtml(err.message)}</p>`));
    return;
  }

  const expiry = tokenExpiresAt
    ? new Date(tokenExpiresAt * 1000).toLocaleString()
    : 'unknown';

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    page(
      'Saved',
      `<h1 class="ok">Saved to backend/.env ✓</h1>
       <p class="sub">These variables were written. Restart the backend to load them.</p>
       <div class="kv">
         <div><b>META_ACCESS_TOKEN</b> <code>${escapeHtml(longToken.slice(0, 12))}…${escapeHtml(longToken.slice(-6))}</code></div>
         <div><b>META_AD_ACCOUNT_ID</b> <code>${escapeHtml(accountId)}</code>${account ? ` — ${escapeHtml(account.name || '')}` : ''}</div>
         <div><b>META_PAGE_ID</b> ${pageId ? `<code>${escapeHtml(pageId)}</code>` : '<span class="note">no page found (left unchanged)</span>'}</div>
         <div><b>Token expires</b> ${escapeHtml(expiry)}</div>
       </div>
       <p class="note">Done. You can close this tab and stop the helper (Ctrl+C).<br>
       Re-run this script whenever the token expires (~60 days) to refresh it.</p>`
    )
  );
}

function handleStatus(res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify(
      {
        appIdConfigured: !looksLikePlaceholder(APP_ID),
        appSecretConfigured: !looksLikePlaceholder(APP_SECRET),
        redirectUri: REDIRECT_URI,
        scopes: SCOPES,
        envPath: ENV_PATH,
        hasToken: Boolean(longToken),
        adAccounts: adAccounts.length,
        pages: pages.length,
      },
      null,
      2
    )
  );
}

/* -------------------------------------------------------------------------- */
/*  Server                                                                    */
/* -------------------------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === 'POST' && reqUrl.pathname === '/save') {
      await handleSave(req, res);
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405).end('Method not allowed');
      return;
    }
    switch (reqUrl.pathname) {
      case '/':
      case '/connect':
        handleHome(res);
        break;
      case '/callback':
        await handleCallback(reqUrl, res);
        break;
      case '/select':
        handleSelect(reqUrl, res);
        break;
      case '/status':
        handleStatus(res);
        break;
      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found. Open http://localhost:' + PORT + '/');
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Meta OAuth Helper');
  console.log('  ────────────────────────────────────────────────');
  console.log(`  Open:         http://localhost:${PORT}/`);
  console.log(`  Redirect URI: ${REDIRECT_URI}`);
  console.log(`  Writes to:    ${ENV_PATH}`);
  console.log('');
  console.log(`  App ID:       ${hasCredentials() ? '✓ ' + APP_ID : 'will be asked in the browser'}`);
  console.log(`  App Secret:   ${hasCredentials() ? '✓ set' : 'will be asked in the browser'}`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
