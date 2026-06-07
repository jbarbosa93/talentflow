-- v2.10.44 — Vérification de changement d'email portail (OTP code).
create table if not exists public.portal_email_changes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  new_email text not null,
  code text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_email_changes_account on public.portal_email_changes (account_id) where used_at is null;
alter table public.portal_email_changes enable row level security;
