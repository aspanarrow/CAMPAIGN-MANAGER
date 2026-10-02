# Meta (Facebook / Instagram) OAuth Helper

A **standalone** helper that connects your app to Meta the way big apps do
("Connect with Facebook") — and then writes the result into `backend/.env`.

> ✅ It does **not** touch the main application code. The app keeps reading the
> exact same environment variables it already reads today
> (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`).

---

## What it does

```
Browser  →  Facebook OAuth dialog  →  we receive ?code
         →  exchange code  →  short-lived token
         →  upgrade       →  LONG-LIVED token (~60 days)
         →  list your Ad Accounts + Pages
         →  you pick one
         →  writes  backend/.env
```

You no longer have to hunt for tokens in the Meta developer dashboard.

---

## One-time setup

### 1. Create / open a Meta app

Go to **https://developers.facebook.com/apps** → your app
(or **Create App** → type **Business**).

### 2. Add the redirect URI

**App settings → Facebook Login → Settings → Valid OAuth Redirect URIs**, add:

```
http://localhost:5555/callback
```

Save.

> If you change the port (see below), update this URI to match.

### 3. Run it — App ID + Secret are entered in the browser

You do **not** need to edit `.env` by hand. Just run the helper:

```bash
node scripts/meta-oauth/index.js
```

Then open **http://localhost:5555/** and paste your **App ID** and **App Secret**
into the form. Click **Save & Connect with Facebook**. The helper:

1. Saves them to `backend/.env` for you
2. Sends you straight to the Facebook login dialog

After that, follow the prompts: log in → grant permissions → pick your ad
account. Everything (token, ad account, page) is written to `backend/.env`.

**Restart the backend** so it loads the new values.

> Prefer to set them yourself? You can also put `META_APP_ID` / `META_APP_SECRET`
> directly in `backend/.env` before starting — the form will be skipped.

### 4. Make sure you can use the app

If the app is still in **Development mode**, only **admins / developers /
testers** can authorize it. Add yourself under **App roles → Roles** (you are
admin by default), and make sure the ad account belongs to the same Business.

---

## Run it (summary)

```bash
node scripts/meta-oauth/index.js
```

Open **http://localhost:5555/**.

1. Paste **App ID** + **App Secret** in the form (first time only)
2. Click **Save & Connect with Facebook**
3. Log in with Facebook, grant the requested permissions
4. Pick your ad account from the list
5. Done — values are written to `backend/.env`

**Restart the backend** so it loads the new values.

---

## What gets written

| Variable               | Meaning                                   |
| ---------------------- | ----------------------------------------- |
| `META_ACCESS_TOKEN`    | Long-lived access token (~60 days)        |
| `META_AD_ACCOUNT_ID`   | e.g. `act_1234567890`                     |
| `META_PAGE_ID`         | Your Facebook Page ID (used for creatives)|

Only these three lines are changed; the rest of `.env` is left untouched.

---

## Options

| Env var                     | Default                              |
| --------------------------- | ------------------------------------ |
| `META_OAUTH_PORT`           | `5555`                               |
| `META_OAUTH_REDIRECT_URI`   | `http://localhost:<PORT>/callback`   |

Example with a custom port:

```bash
META_OAUTH_PORT=6000 node scripts/meta-oauth/index.js
# then add http://localhost:6000/callback to Valid OAuth Redirect URIs
```

---

## Handy endpoints

| URL                                | Purpose                        |
| ---------------------------------- | ------------------------------ |
| `http://localhost:5555/`           | Start the flow                 |
| `http://localhost:5555/status`     | JSON status (no secrets shown) |

---

## Token lifetime

The long-lived token lasts **~60 days**. When ad calls start failing with a
`401` / `OAuthException`, just run this helper again — it will overwrite the
token in `.env`.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `URL Blocked: This redirect failed` | The redirect URI in the Meta app doesn't match `http://localhost:5555/callback`. Add it exactly. |
| `No ad accounts found` | Log in with the account that owns the ad account, and ensure it's in the same Business. |
| `Invalid Scopes: ads_management` | The app needs the Marketing API / Ads product, and in dev mode the user must be an app admin/tester. |
| `Session expired` on the select step | The helper was restarted. Start over from `/`. |
| `App credentials missing` | `META_APP_ID` / `META_APP_SECRET` not set in `backend/.env`. |

---

## Production note

For **public** users (not just you), Meta requires **App Review** for
`ads_management`. That takes days/weeks. For a single operator (you), running it
in Development mode is fine.
