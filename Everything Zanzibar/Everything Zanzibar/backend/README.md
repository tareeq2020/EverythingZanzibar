# Everything Zanzibar — Backend scaffold

This turns the client-side mock console (`everything-zanzibar-admin.html`) into a **real, multi-user, secure** system: shared database, server-enforced RBAC, and proper media storage. Pick **one** path.

| | Path A — Supabase *(recommended)* | Path B — Node/Express |
|---|---|---|
| You host | nothing (managed) | a Node server + Postgres |
| Auth | Supabase Auth | JWT + bcrypt (built in) |
| Security model | Row-Level Security (in DB) | role middleware (in API) |
| Media | Supabase Storage | local `/uploads` (swap for S3/Cloudinary) |
| Files | `schema.sql`, `ez-api.js` | `server-express/` |

The frontend stays static HTML — it just calls the API instead of `localStorage`.

---

## Path A — Supabase (recommended)

1. Create a free project at **supabase.com**.
2. **SQL Editor → paste `schema.sql` → Run.** (Creates tables, the 3-tier `profiles` role model, and all RLS policies.)
3. **Storage →** create a **public** bucket named `media`.
4. **Authentication → Users →** add your staff (email + password). Then in SQL set roles:
   ```sql
   update public.profiles set role='admin'   where email='owner@everythingzanzibar.com';
   update public.profiles set role='manager' where email='ops@everythingzanzibar.com';
   update public.profiles set role='media'   where email='content@everythingzanzibar.com';
   ```
5. In **`ez-api.js`** paste your `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project Settings → API).
6. On every page that needs data, load the client before your page script:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="backend/ez-api.js"></script>
   ```

RBAC is now enforced **in the database** — even if someone forges the UI, a Manager simply cannot read bookings or write posts.

---

## Path B — Node/Express (self-hosted)

```bash
cd backend/server-express
cp .env.example .env          # fill DATABASE_URL, JWT_SECRET, SEED_ADMIN_*
npm install
# run the data tables on your Postgres (skip the Supabase-only auth/RLS/storage blocks):
psql "$DATABASE_URL" -f ../schema.sql
npm run init-db               # creates users table + seeds your admin
npm start                     # API on :4000
```
Point the frontend at it (e.g. `const API='https://api.everythingzanzibar.com'`) and `fetch` the `/api/*` routes, sending `Authorization: Bearer <token>` from `/api/login`. Deploy on Render/Railway/Fly/VPS; move `/uploads` to S3 or Cloudinary for production.

---

## Wiring the console (localStorage → API)

The only real change is **sync → async**. Today the admin does:
```js
var data = get('ez_activities');      // sync
set('ez_activities', data);           // sync
```
With the API it becomes:
```js
const data = await EZ.activities.list();      // Supabase (or fetch for Express)
await EZ.activities.upsert(activity);
```
So each panel’s render becomes `async` and `await`s its data before painting. Example for the Activities panel:
```js
async function pActs(){
  const tours = await EZ.activities.list();    // was: merged() from localStorage
  // …render the table from `tours` exactly as now…
}
// save handler:
$('#ma-save').addEventListener('click', async () => {
  await EZ.activities.upsert(buildRecordFromForm());
  paint();                                     // re-fetch + repaint
});
```
Login uses `await EZ.auth.signIn(email,password)` and `await EZ.auth.role()` to drive the same `renderRole()` you already have. The **role toggle** stays as a dev-only simulator (real access is the signed-in role from the server).

## Wiring the public site (bookings + live content)

- Replace the `logBooking()` localStorage write with `await EZ.bookings.create(rec)` (anon insert is allowed by RLS / the public POST route) — keep it **before** the WhatsApp `window.open`.
- Replace the activities page’s `localStorage.getItem('ez_activities')` override read with `await EZ.activities.list()` so prices/images come from the database for **all** visitors.

## Security notes
- Never expose the Supabase **service_role** key or the JWT secret in the frontend — only the **anon** key/URL belong there.
- Keep RLS ON (Supabase) / the role middleware ON (Express). The client-side role toggle is a convenience, **not** the security boundary.
- Rotate the seeded admin password immediately; enforce strong passwords / 2FA for staff.
