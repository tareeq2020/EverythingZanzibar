-- ============================================================================
-- EVERYTHING ZANZIBAR — RLS recursion fix
-- Run this ONCE in the Supabase SQL Editor, BEFORE re-running seed.sql.
-- Fixes "stack depth limit exceeded" caused by the profiles read policy
-- calling ez_role(), which itself reads profiles (infinite loop).
-- ============================================================================

-- 1) ez_role() now runs as SECURITY DEFINER → bypasses RLS when reading profiles.
create or replace function public.ez_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 2) profiles read policy no longer calls ez_role() (each user reads their own row).
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (id = auth.uid());

-- 3) confirm the recursion is gone (should return your role, or NULL if not signed in — NOT an error)
select public.ez_role() as my_role;
