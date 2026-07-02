create extension if not exists pgcrypto;

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.variable_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  name text not null,
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prompts_user_id_updated_at_idx
  on public.prompts (user_id, updated_at desc);

create index if not exists variable_sets_user_id_updated_at_idx
  on public.variable_sets (user_id, updated_at desc);

create index if not exists variable_sets_prompt_id_idx
  on public.variable_sets (prompt_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prompts_set_updated_at on public.prompts;
create trigger prompts_set_updated_at
before update on public.prompts
for each row
execute function public.set_updated_at();

drop trigger if exists variable_sets_set_updated_at on public.variable_sets;
create trigger variable_sets_set_updated_at
before update on public.variable_sets
for each row
execute function public.set_updated_at();

alter table public.prompts enable row level security;
alter table public.variable_sets enable row level security;

drop policy if exists "Users can select own prompts" on public.prompts;
create policy "Users can select own prompts"
on public.prompts for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own prompts" on public.prompts;
create policy "Users can insert own prompts"
on public.prompts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own prompts" on public.prompts;
create policy "Users can update own prompts"
on public.prompts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own prompts" on public.prompts;
create policy "Users can delete own prompts"
on public.prompts for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select own variable sets" on public.variable_sets;
create policy "Users can select own variable sets"
on public.variable_sets for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own variable sets" on public.variable_sets;
create policy "Users can insert own variable sets"
on public.variable_sets for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.prompts
    where prompts.id = variable_sets.prompt_id
      and prompts.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own variable sets" on public.variable_sets;
create policy "Users can update own variable sets"
on public.variable_sets for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.prompts
    where prompts.id = variable_sets.prompt_id
      and prompts.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own variable sets" on public.variable_sets;
create policy "Users can delete own variable sets"
on public.variable_sets for delete
using (auth.uid() = user_id);
