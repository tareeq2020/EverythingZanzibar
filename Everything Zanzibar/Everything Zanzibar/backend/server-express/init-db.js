/* Creates the users table (auth for the self-hosted path) and seeds the first
   admin from .env. Run once:  npm run init-db
   (The data tables come from backend/schema.sql — run that on your Postgres too,
   skipping the Supabase-only "auth." trigger and the RLS / storage blocks.) */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  await pool.query(`
    create table if not exists users (
      id serial primary key,
      email text unique not null,
      password_hash text not null,
      role text not null default 'media' check (role in ('admin','manager','media')),
      created_at timestamptz default now()
    );`);

  const email = process.env.SEED_ADMIN_EMAIL, pass = process.env.SEED_ADMIN_PASSWORD;
  if (email && pass) {
    const hash = bcrypt.hashSync(pass, 10);
    await pool.query(
      `insert into users (email, password_hash, role) values ($1,$2,'admin')
       on conflict (email) do update set password_hash=excluded.password_hash, role='admin'`,
      [email, hash]
    );
    console.log("Seeded admin:", email);
  }
  console.log("users table ready.");
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
