# Deploying Dukaan Manager (free: Render + MongoDB Atlas)

This runs the app on **Render** (free Web Service) with data in **MongoDB Atlas** (free M0).
Both tiers are free and allow real/commercial use. The only catch on Render's free tier:
the service **sleeps after ~15 minutes idle**, so the first visit after a quiet period takes
~50 seconds to wake. After that it's fast.

> Config lives in `render.yaml`. Secrets are **never** in the repo — you paste them into the
> Render dashboard.

---

## 1. MongoDB Atlas (database) — one-time

1. Create a free cluster at <https://www.mongodb.com/cloud/atlas> (M0, Singapore/Mumbai region is closest to Pakistan).
2. **Database Access** → add a database user with a password. (Keep the username + password.)
3. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`).
   Render's outbound IPs change, so this is required or the app can't connect.
4. **Connect → Drivers** → copy the connection string. It looks like:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxx.mongodb.net/`
   Add a database name before the `?` (or at the end): **`/dukaan`**, e.g.
   `mongodb+srv://USER:PASSWORD@cluster0.xxxx.mongodb.net/dukaan?retryWrites=true&w=majority`

This full string is your **`MONGODB_URI`**.

---

## 2. Render (app) — one-time

1. Sign up at <https://render.com> with **"Sign in with GitHub"** and authorise the
   `general-stores-app` repository.
2. **New → Web Service** → pick `Ahmed-Zeeshan/general-stores-app` → branch `main`.
   Render reads `render.yaml` and fills in build/start commands automatically:
   - Build: `npm ci && npm run build`
   - Start: `npm run start`
   - Plan: Free
3. Open the **Environment** tab and add these (the two generated values were given to you in chat —
   treat them as secret, do not commit them):

   | Key | Value |
   |-----|-------|
   | `MONGODB_URI` | your Atlas string from step 1 (with `/dukaan`) |
   | `AUTH_SECRET` | the 32-byte random value generated for you |
   | `SETUP_TOKEN` | the random value generated for you (guards first-admin creation) |

   `NODE_VERSION` and `TZ` are already set by `render.yaml`.
4. Click **Create Web Service**. First build takes a few minutes.

---

## 3. First run — create your shop owner

1. When the service is **Live**, open its URL (e.g. `https://dukaan-manager.onrender.com`).
2. Go to **`/setup`**. It will ask for the **`SETUP_TOKEN`** (so only you can create the first admin).
3. Create the Super Admin / owner account, then log in.

---

## 4. After deploying — security

- **Rotate the Atlas DB password** if it was ever shared in plain text, then update `MONGODB_URI`
  in Render → Environment.
- Keep `AUTH_SECRET` secret and stable — changing it logs everyone out.

---

## Updating the app later

`autoDeploy` is on: every push to `main` on GitHub triggers a new Render deploy automatically.

## Notes / limits on the free tier

- **Cold starts:** the free Web Service sleeps when idle (~15 min) — first request wakes it (~50s).
- **Background jobs** (nightly auto-backup, FBR re-send timers) run while the service is awake; they
  pause while it's asleep. For always-on background work, upgrade to a paid instance.
