# parcel

**parcel** is a mobile-first territory game built around real movement. You explore your city on foot, bike, skates, or blades—while the app traces a live neon trail on the map. Close a loop back where you started, and the ground you surrounded becomes yours: a **parcel**. Parcels earn passive points over time; bigger parcels earn more. Someone else can contest your territory only by physically retracing a route that legitimately overlaps yours—so ownership stays tied to bodies in space, not screens alone.

The point is simple: **make outdoor exercise feel like play**, with stakes you can see on a shared world map.

---

## Why it exists

Most fitness apps optimize reps, streaks, and closed loops on a chart. parcel optimizes **loops on the Earth**. It rewards exploration, returning home, and carving shapes into the street grid. Your workout leaves a visible trace—instant feedback—and when geometry meets persistence, you get something people can envy from across town.

Social layers matter: everyone sees parcels on one global map. You can band together in **groups**, pool treasury points from what members earn, and **vote** on how to spend them—cosmetics today, partner redemptions on the roadmap.

---

## How it works (player view)

1. **Pick an activity** — walking, running, cycling, skating, or rollerblading. Activity sets speed rules and how stats read (pace vs speed).
2. **Move** — GPS draws your trail in real time. The trail is the hero moment: gradients on the path only, minimal chrome elsewhere.
3. **Close the loop** — come back within ~30 m of where you began with enough points on the path to form a polygon.
4. **Claim** — the enclosed area becomes your parcel. Tier scales with area (micro → landmark); passive **points per minute** scale with tier.
5. **Defend** — after a short grace period, rivals can contest overlapping territory by completing their own valid loop and passing server-side checks (speed, geometry, overlap).

Fair play is enforced on the server: traces are simplified (Ramer–Douglas–Peucker), speeds are validated per activity, and overlap logic uses PostGIS—so the map stays honest.

---

## Stack (high level)

| Layer | Choice |
|-------|--------|
| App | React Native, Expo (managed), expo-router, NativeWind |
| Maps & location | react-native-maps, expo-location (foreground + background tracking target) |
| Backend | Supabase (Auth, Postgres **+ PostGIS**, Realtime, Storage) |
| State | Zustand |
| Geo helpers | `@turf/area` / `@turf/helpers`, client preview; server is authoritative |

Detailed schema, edge functions (`claim-parcel`, `tick-points`, `contest-parcel`, `speed-check`, `group-treasury`), and product specs live in-repo (`supabase/` and app structure under `app/`).

---

## Run locally

```bash
cd parcel
npm install
npx expo start
```

Then open **Expo Go** on a device (QR), press **`i`** / **`a`** for simulators, or **`w`** for web (native-only features may be limited).

---

## Supabase setup

Tracking, territory claims, and live sync require a Supabase project.

### 1. Create a project

In [supabase.com/dashboard](https://supabase.com/dashboard), create a new project and wait for the database to finish provisioning.

### 2. Run the database schema

Open **SQL Editor → New query**, paste the contents of [`supabase/setup.sql`](supabase/setup.sql) (copy from the raw file in your editor, not from a markdown preview), and **Run**. This creates profiles, live GPS (`locations`), territories, RLS policies, a sign-up profile trigger, and Realtime on `locations`.

### 3. Enable email auth (local dev)

**Authentication → Providers → Email** — keep Email enabled.

For frictionless local testing, turn **off** “Confirm email” under Email provider settings. Otherwise new accounts must confirm via email before they can sign in.

### 4. Copy API keys into `.env`

Copy `.env.example` → `.env` and fill in values from **Project Settings → API**:

| Variable | Where to find it |
|----------|------------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud Console (Android map tiles) |

Restart Expo after changing env vars:

```bash
npx expo start --clear
```

### 5. Create an account in the app

Launch the app → **Create account** → pick an activity on **Track** → move outdoors on a **physical device** for accurate GPS.

---

## Strava integration

Connect Strava in **Settings** (when signed in with email) or use **Continue with Strava** on the welcome screen. Both use the same Strava app configuration below.

### 1. Register a Strava API application

Go to [strava.com/settings/api](https://www.strava.com/settings/api):

- **Application Name:** parcel
- **Category:** Other
- **Authorization Callback Domain:** your Supabase project host (e.g. `YOUR_PROJECT_REF.supabase.co`)

Copy **Client ID** → `EXPO_PUBLIC_STRAVA_CLIENT_ID` in `.env`.

Copy **Client Secret** → Supabase Edge Function secret only (never `EXPO_PUBLIC_`).

### 2. Run Strava migrations (if you already ran `setup.sql` before Strava was added)

Paste and run these in the SQL editor:

- [`supabase/migrations/002_strava_connections.sql`](supabase/migrations/002_strava_connections.sql)
- [`supabase/migrations/003_strava_activities.sql`](supabase/migrations/003_strava_activities.sql)

Fresh installs: `setup.sql` already includes these tables.

### 3. Set Edge Function secrets

In **Project Settings → Edge Functions → Secrets** (or via CLI):

```bash
supabase secrets set STRAVA_CLIENT_ID=your_client_id
supabase secrets set STRAVA_CLIENT_SECRET=your_client_secret
supabase secrets set STRAVA_WEBHOOK_VERIFY_TOKEN=your_random_verify_token
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase.

### 4. Deploy Edge Functions

```bash
supabase functions deploy strava-oauth-callback
supabase functions deploy strava-sign-in
supabase functions deploy strava-token-exchange
supabase functions deploy strava-webhook
```

`strava-webhook` is configured with `verify_jwt = false` in [`supabase/config.toml`](supabase/config.toml) so Strava can reach it without auth headers.

### 5. Register the Strava webhook

After deploying `strava-webhook`:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://YOUR_PROJECT_REF.supabase.co/functions/v1/strava-webhook \
  -F verify_token=YOUR_VERIFY_TOKEN
```

### 6. Connect in the app

Restart Expo (`npx expo start --clear`), open **Settings → Connect Strava**, complete OAuth. When you finish a Strava activity, the webhook stores the GPS route in `strava_activities` with `territory_hits` populated.

---

## Design stance

- **parcel** is always lowercase; wordmark energy is **Syne** (800); numbers and stats use **DM Mono**.
- Dark/light backgrounds: `#0b0d12` / `#e8eef5`. Accent gold for points and owned land: `#f5c842`.
- During tracking: **full-screen map**, HUD floats on top. Bottom dock: map toggle · pause · stop.