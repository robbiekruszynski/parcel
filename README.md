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

Copy `.env.example` → `.env` and fill Supabase and Maps keys when you connect real services:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (especially for Android map tiles)

---

## Design stance

- **parcel** is always lowercase; wordmark energy is **Syne** (800); numbers and stats use **DM Mono**.
- Dark/light backgrounds: `#0b0d12` / `#e8eef5`. Accent gold for points and owned land: `#f5c842`.
- During tracking: **full-screen map**, HUD floats on top. Bottom dock: map toggle · pause · stop.