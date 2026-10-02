# Shopify Token Helper

A **standalone** helper that fetches a fresh Shopify Admin API access token and
writes it into `backend/.env`.

> ✅ It does **not** touch the main application code. The app keeps reading the
> exact same environment variable it already reads today
> (`SHOPIFY_ACCESS_TOKEN`).

---

## Why this exists

Dev Dashboard apps (created at `dev.shopify.com`) **do not show a static token**.
Instead, you exchange your **Client ID + Client Secret** for an access token.
That token expires after **24 hours** — this helper regenerates it for you.

---

## Setup

Make sure `backend/.env` has your store + credentials (these never change):

```dotenv
SHOPIFY_STORE_URL=rqukgw-tx.myshopify.com
SHOPIFY_API_KEY=<Client ID>        # from Dev Dashboard → Settings
SHOPIFY_API_SECRET=<Client Secret> # from Dev Dashboard → Settings
```

> Note: `SHOPIFY_ACCESS_TOKEN` is **written by this helper** — you don’t set it.

---

## Usage

```bash
# Fetch a fresh token once
node scripts/shopify-auth/index.js

# Keep it fresh automatically (refreshes every ~22h)
node scripts/shopify-auth/index.js --watch

# Show the current token's age / expiry
node scripts/shopify-auth/index.js --status
```

---

## What it does

```
backend/.env (store + client id/secret)
        │
        ▼
POST https://<store>/admin/oauth/access_token
     grant_type=client_credentials
        │
        ▼
   access_token (24h)
        │
        ▼
verify against  /admin/api/<version>/graphql.json  ({ shop { name } })
        │
        ▼
write  SHOPIFY_ACCESS_TOKEN  (and SHOPIFY_ACCESS_TOKEN_GENERATED_AT)  to .env
```

Only those two lines are touched; the rest of `.env` is left untouched.

---

## ⚠️ Important: restart the backend

The backend reads `backend/.env` **once at startup**. After this helper writes a
new token, **restart the backend** to load it:

```bash
# stop the backend, then:
cd backend && npm run dev
```

In `--watch` mode the helper keeps the token fresh on disk, but the running
backend still holds the value it started with. So either restart the backend when
you refresh, or (recommended) use the app’s dev watcher and restart it after the
first token.

> Want zero restarts? That requires the backend to fetch the token per request
> instead of at startup — a small change to
> `backend/src/services/shopify.service.ts`. Ask and it can be added.

---

## Options

| Env var                 | Default    | Meaning                              |
| ----------------------- | ---------- | ------------------------------------ |
| `SHOPIFY_API_VERSION`   | `2026-10`  | Admin API version used for verify    |
| `SHOPIFY_REFRESH_MS`    | `79200000` | Watch interval (22h in ms)           |

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `SHOPIFY_API_KEY (Client ID) is missing` | Add it to `backend/.env` (Dev Dashboard → Settings → Credentials). |
| `Token request failed: shop_not_permitted` | The store isn’t in the same Shopify organization as the app. See the Dev Dashboard **Dev stores** list. |
| `ACCESS_DENIED` when the app calls products/orders | The app **version** is missing scopes. Add `read_products`, `read_orders`, `read_customers` to the version, **release** it, then re-run this helper. |
| Token works in isolation but app still 401s | The backend wasn’t restarted. Restart it. |

---

## Note on scopes

The scopes are **not** requested by this helper — they come from the **app
version** in the Dev Dashboard. If a resource is denied, release a new app
version with that scope and re-run this helper to get a token that carries it.
