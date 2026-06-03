-- v2.10.26 — Messages riches affichés DANS l'app candidat (modal + animation festive).
-- Accès service role uniquement (RLS active, aucune policy) comme les tables portail sensibles.

create table if not exists public.inapp_messages (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  title text not null,
  body text not null,
  image_url text,
  animation text not null default 'none',  -- none|confetti|hearts|fireworks|snow|stars
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists idx_inapp_messages_candidate_unseen
  on public.inapp_messages (candidate_id) where seen_at is null;

alter table public.inapp_messages enable row level security;

comment on table public.inapp_messages is 'Messages riches affichés DANS l app candidat (modal + animation). Accès service role uniquement.';
