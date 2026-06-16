-- Payroll settings: persisted pay schedule (frequency + next payroll date)
create table if not exists settings (
  id            int primary key default 1,
  pay_frequency text default 'biweekly',
  pay_anchor    date,
  updated_at    timestamptz default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;
alter table settings enable row level security;

create or replace function admin_settings_save(p_secret text, p_frequency text, p_anchor date)
returns json language plpgsql security definer set search_path=public as $$
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  update settings set pay_frequency=coalesce(p_frequency,pay_frequency),
    pay_anchor=coalesce(p_anchor,pay_anchor), updated_at=now() where id=1;
  return json_build_object('ok',true);
end; $$;
grant execute on function admin_settings_save(text,text,date) to anon;

-- include settings in the admin data payload
create or replace function get_admin_data(p_secret text)
returns json language plpgsql security definer set search_path=public as $$
begin
  if not _admin_ok(p_secret) then return json_build_object('error','unauthorized'); end if;
  return json_build_object(
    'employees',(select coalesce(json_agg(e),'[]'::json) from employees e),
    'jobs',     (select coalesce(json_agg(j),'[]'::json) from jobs j),
    'access',   (select coalesce(json_agg(a),'[]'::json) from access a),
    'todos',    (select coalesce(json_agg(t),'[]'::json) from todos t),
    'events',   (select coalesce(json_agg(c order by c.ts),'[]'::json) from clock_events c),
    'approvals',(select coalesce(json_agg(ap),'[]'::json) from approvals ap),
    'settings', (select row_to_json(s) from settings s where id=1)
  );
end; $$;
