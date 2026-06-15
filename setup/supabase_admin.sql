-- CrewClock — admin control functions (run in SQL Editor after supabase_schema.sql)
-- These let the admin app add/edit/delete jobs, employees, assignments, access,
-- and approvals. Every one is gated by a secret only the admin app carries, so
-- the public key can't touch them. Safe to re-run.

create or replace function _admin_ok(s text) returns boolean
language sql immutable as $$ select s = 'SN0qlfWZ4-hPdRkkWpYdWx70-2RAOZGe' $$;

create or replace function _new_token() returns text language sql as $$
  select substr(md5(random()::text||clock_timestamp()::text),1,16)
       ||substr(md5(random()::text||clock_timestamp()::text),1,16) $$;

-- Read EVERYTHING (rates, tokens, all events) — admin only.
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
    'approvals',(select coalesce(json_agg(ap),'[]'::json) from approvals ap)
  );
end; $$;

-- Jobs ----------------------------------------------------------------
create or replace function admin_job_save(p_secret text, p_id text, p_name text,
  p_address text, p_customer text, p_active boolean)
returns json language plpgsql security definer set search_path=public as $$
declare v_id text;
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  if p_id is null or p_id='' then
    v_id := 'J'||(coalesce((select max((regexp_replace(id,'\D','','g'))::int) from jobs where id ~ '^J\d+$'),99)+1);
    insert into jobs(id,name,address,customer,active) values (v_id,p_name,p_address,p_customer,coalesce(p_active,true));
  else
    v_id := p_id;
    update jobs set name=p_name,address=p_address,customer=p_customer,active=coalesce(p_active,active) where id=p_id;
  end if;
  return json_build_object('ok',true,'id',v_id);
end; $$;

create or replace function admin_job_delete(p_secret text, p_id text)
returns json language plpgsql security definer set search_path=public as $$
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  delete from access where job_id=p_id;
  delete from jobs where id=p_id;
  return json_build_object('ok',true);
end; $$;

-- Employees -----------------------------------------------------------
create or replace function admin_employee_save(p_secret text, p_id text, p_name text,
  p_rate numeric, p_active boolean, p_phone text, p_email text, p_revoked boolean)
returns json language plpgsql security definer set search_path=public as $$
declare v_id text; v_token text;
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  if p_id is null or p_id='' then
    v_id := 'E'||lpad((coalesce((select max((regexp_replace(id,'\D','','g'))::int) from employees where id ~ '^E\d+$'),0)+1)::text,3,'0');
    v_token := _new_token();
    insert into employees(id,name,token,hourly_rate,active,phone,email)
      values (v_id,p_name,v_token,coalesce(p_rate,0),coalesce(p_active,true),coalesce(p_phone,''),coalesce(p_email,''));
  else
    v_id := p_id;
    update employees set name=coalesce(p_name,name),hourly_rate=coalesce(p_rate,hourly_rate),
      active=coalesce(p_active,active),phone=coalesce(p_phone,phone),email=coalesce(p_email,email),
      token_revoked=coalesce(p_revoked,token_revoked) where id=p_id;
    select token into v_token from employees where id=p_id;
  end if;
  return json_build_object('ok',true,'id',v_id,'token',v_token);
end; $$;

create or replace function admin_employee_delete(p_secret text, p_id text)
returns json language plpgsql security definer set search_path=public as $$
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  delete from access where employee_id=p_id;
  delete from employees where id=p_id;
  return json_build_object('ok',true);
end; $$;

-- Access (who can clock into a job) -----------------------------------
create or replace function admin_access_set(p_secret text, p_employee_id text, p_job_id text, p_enabled boolean)
returns json language plpgsql security definer set search_path=public as $$
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  insert into access(employee_id,job_id,enabled) values (p_employee_id,p_job_id,coalesce(p_enabled,true))
    on conflict (employee_id,job_id) do update set enabled=excluded.enabled;
  return json_build_object('ok',true);
end; $$;

-- Assignments / notes -------------------------------------------------
create or replace function admin_todo_save(p_secret text, p_id text, p_title text, p_description text,
  p_assigned_employee_id text, p_job_id text, p_priority text, p_can_complete boolean, p_due_date text)
returns json language plpgsql security definer set search_path=public as $$
declare v_id text;
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  if p_id is null or p_id='' then
    v_id := 'T'||(coalesce((select max((regexp_replace(id,'\D','','g'))::int) from todos where id ~ '^T\d+$'),0)+1);
    insert into todos(id,title,description,assigned_employee_id,job_id,priority,can_complete,due_date)
      values (v_id,p_title,coalesce(p_description,''),coalesce(p_assigned_employee_id,''),coalesce(p_job_id,''),
              coalesce(p_priority,'medium'),coalesce(p_can_complete,true),coalesce(p_due_date,''));
  else
    v_id := p_id;
    update todos set title=p_title,description=coalesce(p_description,''),assigned_employee_id=coalesce(p_assigned_employee_id,''),
      job_id=coalesce(p_job_id,''),priority=coalesce(p_priority,priority),can_complete=coalesce(p_can_complete,can_complete),
      due_date=coalesce(p_due_date,due_date) where id=p_id;
  end if;
  return json_build_object('ok',true,'id',v_id);
end; $$;

create or replace function admin_todo_delete(p_secret text, p_id text)
returns json language plpgsql security definer set search_path=public as $$
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  delete from todos where id=p_id;
  return json_build_object('ok',true);
end; $$;

-- Time approvals ------------------------------------------------------
create or replace function admin_approval_set(p_secret text, p_shift_id text, p_employee_id text,
  p_action text, p_hours numeric, p_note text)
returns json language plpgsql security definer set search_path=public as $$
begin
  if not _admin_ok(p_secret) then return json_build_object('ok',false,'error','unauthorized'); end if;
  insert into approvals(shift_id,employee_id,action,hours,note) values (p_shift_id,p_employee_id,p_action,p_hours,coalesce(p_note,''))
    on conflict (shift_id) do update set action=excluded.action,hours=excluded.hours,note=excluded.note,created_at=now();
  return json_build_object('ok',true);
end; $$;

grant execute on function get_admin_data(text) to anon;
grant execute on function admin_job_save(text,text,text,text,text,boolean) to anon;
grant execute on function admin_job_delete(text,text) to anon;
grant execute on function admin_employee_save(text,text,text,numeric,boolean,text,text,boolean) to anon;
grant execute on function admin_employee_delete(text,text) to anon;
grant execute on function admin_access_set(text,text,text,boolean) to anon;
grant execute on function admin_todo_save(text,text,text,text,text,text,text,boolean,text) to anon;
grant execute on function admin_todo_delete(text,text) to anon;
grant execute on function admin_approval_set(text,text,text,text,numeric,text) to anon;
