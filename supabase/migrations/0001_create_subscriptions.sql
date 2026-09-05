-- =============================================================================
-- Cloud licensing: subscription registry (Supabase / PostgreSQL)
--
-- The desktop POS keeps ALL business data (products, sales, inventory,
-- payroll) exclusively in the local SQLite database (`pos.db`). This table is
-- the ONLY cloud resource the client touches, and it is read-only for the
-- public anon key: the client can fetch its own subscription state but can
-- never alter its expiry date or status.
--
-- Vendor workflow: insert/update one row per licensed machine from the
-- Supabase dashboard or via the service-role key after a purchase/renewal.
-- =============================================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null,
  client_name text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'EXPIRED', 'BLOCKED')),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'One row per licensed machine. Clients read their own row with the anon key; writes are vendor-side only.';

-- One subscription per machine. The unique constraint doubles as the lookup
-- index used by the client query: WHERE machine_id = <fingerprint>.
create unique index if not exists subscriptions_machine_id_key
  on public.subscriptions (machine_id);

create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

-- Keep updated_at fresh on every vendor-side edit.
create or replace function public.set_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_subscriptions_updated_at();

-- =============================================================================
-- Row Level Security
--
-- RLS is enabled and the ONLY policy grants SELECT to the anon role. With no
-- INSERT / UPDATE / DELETE policies, the anon key can never create rows or
-- tamper with an expiry date — even if the desktop app is modified. Rows are
-- addressed by machine_id: the client filters with
-- `.eq('machine_id', fingerprint)`.
--
-- Note: the anon key ships inside the desktop binary, so it cannot be bound
-- to a specific machine at the database level; SELECT is therefore open to
-- the (non-sensitive) subscription rows, while writes stay vendor-only.
-- =============================================================================

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions are readable by anon"
  on public.subscriptions;
create policy "subscriptions are readable by anon"
  on public.subscriptions
  for select
  to anon
  using (true);
