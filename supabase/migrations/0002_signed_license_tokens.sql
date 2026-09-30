alter table public.subscriptions
  add column if not exists license_token text;

comment on column public.subscriptions.license_token is
  'Ed25519-signed license claims. Clients must verify the signature and machine binding before applying any subscription state.';

create table if not exists public.license_issuance_audit (
  id bigint generated always as identity primary key,
  issuer_user_id uuid not null,
  machine_id text not null,
  created_at timestamptz not null default now()
);

comment on table public.license_issuance_audit is
  'Private audit records and per-operator rate-limit state for license issuance.';

alter table public.license_issuance_audit enable row level security;
revoke all on public.license_issuance_audit from public, anon, authenticated;

create or replace function public.reserve_license_issue(
  p_issuer_user_id uuid,
  p_machine_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_issuer_user_id::text, 0)
  );

  select count(*)::integer into recent_count
  from public.license_issuance_audit
  where issuer_user_id = p_issuer_user_id
    and created_at > now() - interval '1 minute';

  if recent_count >= 10 then
    return false;
  end if;

  insert into public.license_issuance_audit (issuer_user_id, machine_id)
  values (p_issuer_user_id, p_machine_id);
  return true;
end;
$$;

revoke all on function public.reserve_license_issue(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_license_issue(uuid, text)
  to service_role;
