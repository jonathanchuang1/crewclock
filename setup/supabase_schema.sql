-- ============================================================
-- CrewClock — Supabase database setup
-- Paste this whole file into Supabase ▸ SQL Editor ▸ New query ▸ Run.
-- It creates the tables, locks them down, and adds the two safe
-- functions the employee phones use. Admin uses the service key.
-- Safe to re-run.
-- ============================================================

create table if not exists employees (
  id            text primary key,
  name          text not null default '',
  token         text unique not null,
  token_revoked boolean not null default false,
  hourly_rate   numeric not null default 0,
  active        boolean not null default true,
  phone         text default '',
  email         text default '',
  timezone      text default 'America/Los_Angeles',
  created_at    timestamptz not null default now()
);

create table if not exists jobs (
  id         text primary key,
  name       text not null default '',
  address    text default '',
  customer   text default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists access (
  employee_id text not null,
  job_id      text not null,
  enabled     boolean not null default true,
  primary key (employee_id, job_id)
);

create table if not exists todos (
  id                   text primary key,
  title                text not null default '',
  description          text default '',
  assigned_employee_id text default '',
  job_id               text default '',
  priority             text default 'medium',
  status               text default 'open',
  can_complete         boolean not null default true,
  due_date             text default '',
  created_at           timestamptz not null default now()
);

create table if not exists clock_events (
  id            uuid primary key default gen_random_uuid(),
  employee_id   text,
  employee_name text,
  event_type    text,         -- clock_in | clock_out | change_job | add_note
  job_id        text default '',
  job_name      text default '',
  job_address   text default '',
  note          text default '',
  ts            timestamptz not null default now(),
  device        text default ''
);

create table if not exists approvals (
  shift_id     text primary key,   -- the clock-in event that started the shift
  employee_id  text,
  action       text,               -- approved | denied
  hours        numeric,            -- payable hours (auto-computed from edited times)
  note         text default '',
  edited_start timestamptz,        -- admin-corrected clock-in (optional)
  edited_end   timestamptz,        -- admin-corrected clock-out (optional)
  created_at   timestamptz not null default now()
);

-- ---- lock everything down: no direct table access for the public key ----
alter table employees    enable row level security;
alter table jobs         enable row level security;
alter table access       enable row level security;
alter table todos        enable row level security;
alter table clock_events enable row level security;
alter table approvals    enable row level security;
-- (no policies = the public/anon key can't read or write tables directly.
--  The admin app uses the service key, which bypasses RLS.)

-- ---- the only two things the employee phones can do ----

-- Look up everything one employee is allowed to see, by their token.
create or replace function get_profile(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare e employees%rowtype;
begin
  select * into e from employees where token = p_token;
  if not found       then return json_build_object('error','unknown');  end if;
  if e.token_revoked then return json_build_object('error','revoked');  end if;
  if not e.active    then return json_build_object('error','inactive'); end if;
  return json_build_object(
    'profile', json_build_object('employee_id', e.id, 'employee_name', e.name, 'timezone', e.timezone),
    -- everyone can clock into any active job (per-job access not enforced for now)
    'jobs', (select coalesce(json_agg(json_build_object(
                'job_id', j.id, 'job_name', j.name, 'job_address', j.address, 'customer_name', j.customer)
             ), '[]'::json)
             from jobs j where j.active),
    'myTodos', (select coalesce(json_agg(json_build_object(
                  'todo_id', id, 'title', title, 'description', description, 'job_id', job_id,
                  'assigned_employee_id', assigned_employee_id, 'priority', priority,
                  'status', status, 'can_complete', can_complete, 'due_date', due_date)), '[]'::json)
                from todos where assigned_employee_id = e.id and status in ('open','in_progress')),
    'jobTodos', (select coalesce(json_agg(json_build_object(
                  'todo_id', id, 'title', title, 'description', description, 'job_id', job_id,
                  'assigned_employee_id', assigned_employee_id, 'priority', priority,
                  'status', status, 'can_complete', can_complete, 'due_date', due_date)), '[]'::json)
                from todos where job_id <> '' and status in ('open','in_progress'))
  );
end; $$;

-- Record a clock event (clock in/out/change job/note), validated by token.
create or replace function submit_event(
  p_token text, p_event_type text,
  p_job_id text default '', p_job_name text default '',
  p_job_address text default '', p_note text default '', p_device text default '')
returns json language plpgsql security definer set search_path = public as $$
declare e employees%rowtype; j jobs%rowtype;
begin
  select * into e from employees where token = p_token;
  if not found or e.token_revoked or not e.active then
    return json_build_object('ok', false, 'error', 'denied');
  end if;
  -- can't clock into / switch to a closed (inactive or deleted) job
  if p_event_type in ('clock_in','change_job') and coalesce(p_job_id,'') <> '' then
    select * into j from jobs where id = p_job_id;
    if not found or not j.active then
      return json_build_object('ok', false, 'error', 'job_closed');
    end if;
  end if;
  insert into clock_events(employee_id, employee_name, event_type, job_id, job_name, job_address, note, device)
  values (e.id, e.name, p_event_type, p_job_id, p_job_name, p_job_address, p_note, p_device);
  return json_build_object('ok', true);
end; $$;

grant execute on function get_profile(text) to anon;
grant execute on function submit_event(text,text,text,text,text,text,text) to anon;

-- ---- sample data so it works the moment you connect (replace later) ----
insert into employees (id,name,token,hourly_rate,active,phone) values
  ('E001','Alex Rivera','1AF75ymkw8ASGmQY37QwiDTYwsAtSYmd',28.5,true,'555-0101'),
  ('E002','Sam Carter','z9OY5Sb2-eBYzArXiTs9UEJwl5x1qC7j',24,true,'555-0102')
on conflict (id) do nothing;

insert into jobs (id,name,address,customer,active) values
  ('J100','Maple St Water Damage','412 Maple St, Springfield','Janet Cole',true),
  ('J101','Oak Ave Mold Remediation','88 Oak Ave, Springfield','Rodriguez Family',true),
  ('J102','Downtown Office Fire','1200 Center Blvd, Suite 4','Hartwell LLC',true)
on conflict (id) do nothing;

insert into access (employee_id,job_id,enabled) values
  ('E001','J100',true),('E001','J101',true),('E002','J100',true),('E002','J102',true)
on conflict do nothing;

insert into todos (id,title,description,assigned_employee_id,job_id,priority,can_complete) values
  ('T1','Photograph all affected rooms','Wide + detail shots before extraction.','E001','J100','high',true),
  ('T2','Set up 3 air movers in basement','','','J100','medium',true)
on conflict (id) do nothing;
