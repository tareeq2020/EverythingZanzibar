/* ============================================================================
   EVERYTHING ZANZIBAR — self-hosted API (Node/Express + Postgres + JWT RBAC)
   Run:  npm install  →  npm run init-db  →  npm start
   Mirrors the Supabase RLS matrix in middleware. See backend/README.md.
   ============================================================================ */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // media (swap for S3/Cloudinary in prod)

const q = (text, params) => pool.query(text, params);

/* ---------------- AUTH ---------------- */
function sign(user) { return jwt.sign({ id: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: "12h" }); }
function auth(req, _res, next) {
  const h = req.headers.authorization || "";
  try { req.user = jwt.verify(h.replace(/^Bearer /, ""), process.env.JWT_SECRET); } catch (_) { req.user = null; }
  next();
}
app.use(auth);
// role guard: require(['admin','manager']) etc.
const require_ = (roles) => (req, res, next) =>
  (req.user && roles.includes(req.user.role)) ? next() : res.status(403).json({ error: "Forbidden" });

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await q("select * from users where email=$1", [email]);
  if (!rows[0] || !bcrypt.compareSync(password, rows[0].password_hash)) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: sign(rows[0]), role: rows[0].role, email: rows[0].email });
});
app.get("/api/me", (req, res) => res.json(req.user || null));

/* ---------------- helper to build CRUD routes ---------------- */
function crud(name, { read = "public", write = ["admin"] } = {}) {
  const base = "/api/" + name;
  app.get(base, read === "public" ? (q2) => q2 : require_(write), async (req, res) => {
    const { rows } = await q(`select * from ${name}`); res.json(rows);
  });
  app.post(base, require_(write), async (req, res) => {           // upsert by JSON body
    const cols = Object.keys(req.body), vals = cols.map((c) => req.body[c]);
    const ph = cols.map((_, i) => "$" + (i + 1)).join(",");
    const upd = cols.map((c) => `${c}=excluded.${c}`).join(",");
    const { rows } = await q(`insert into ${name} (${cols.join(",")}) values (${ph})
      on conflict (${name === "activities" ? "name" : "id"}) do update set ${upd} returning *`, vals);
    res.json(rows[0]);
  });
  app.delete(base + "/:id", require_(write), async (req, res) => {
    await q(`delete from ${name} where ${name === "activities" ? "name" : "id"}=$1`, [req.params.id]); res.json({ ok: true });
  });
}

/* ---------------- ROUTES (RBAC matrix) ---------------- */
crud("activities", { read: "public", write: ["admin", "manager"] });
crud("hotels",     { read: "public", write: ["admin", "manager"] });
crud("transit",    { read: "public", write: ["admin", "manager"] });
crud("events",     { read: "auth",   write: ["admin", "manager"] });
crud("posts",      { read: "public", write: ["admin", "media"] });
crud("settings",   { read: "public", write: ["admin"] });

// bookings: PUBLIC may create (shadow log); only ADMIN may read/update/delete
app.post("/api/bookings", async (req, res) => {
  const b = req.body;
  b.id = b.id || "EZ-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  await q(`insert into bookings (id,name,contact,travel_date,assets,total,type,status)
           values ($1,$2,$3,$4,$5,$6,$7,'Pending WhatsApp Escrow Verification')`,
    [b.id, b.name, b.contact, b.date || null, b.assets, b.total, b.type]);
  res.json({ ok: true, id: b.id });
});
app.get("/api/bookings", require_(["admin"]), async (_req, res) => { const { rows } = await q("select * from bookings order by created_at desc"); res.json(rows); });
app.patch("/api/bookings/:id", require_(["admin"]), async (req, res) => { await q("update bookings set status=$1 where id=$2", [req.body.status, req.params.id]); res.json({ ok: true }); });
app.delete("/api/bookings/:id", require_(["admin"]), async (req, res) => { await q("delete from bookings where id=$1", [req.params.id]); res.json({ ok: true }); });

// media upload (admin/manager/media) → returns a URL
const upload = multer({ dest: path.join(__dirname, "uploads") });
app.post("/api/media", require_(["admin", "manager", "media"]), upload.single("file"), (req, res) =>
  res.json({ url: "/uploads/" + req.file.filename }));

app.listen(process.env.PORT || 4000, () => console.log("EZ API on :" + (process.env.PORT || 4000)));
