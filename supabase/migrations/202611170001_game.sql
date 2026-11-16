create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
create table private.rooms(id uuid primary key default gen_random_uuid(),code text unique not null,name text not null,host uuid not null,state text not null default 'LOBBY',round int not null default 0,owner uuid,question int,answer boolean,spicy boolean default false,admitting boolean default false,secret text,used int[] default '{}',queue uuid[] default '{}',revealed int default 0);
create table private.players(id uuid primary key default gen_random_uuid(),room uuid not null references private.rooms on delete cascade,identity uuid not null, name text not null,avatar int not null default 0,seat int not null,joined bigint generated always as identity,score int not null default 0,seen timestamptz not null default now(),unique(room,identity));
create unique index player_names on private.players(room,lower(name));
create table private.questions(id int primary key,category text not null,text text not null,spice int not null default 0);
create table private.votes(room uuid references private.rooms on delete cascade,round int,player uuid references private.players,answer boolean,excluded boolean default false,primary key(room,round,player));
create table private.attempts(identity uuid primary key,last_attempt timestamptz,tries int default 0);
-- No private tables are exposed through PostgREST or realtime. Only the invalidation version is public.
create table public.room_events(room uuid primary key,version bigint default 0);
alter table public.room_events enable row level security;
create function private.member(r uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from private.players where room=r and identity=auth.uid())$$;
create policy member_events on public.room_events for select to authenticated using(private.member(room));
grant usage on schema private to authenticated;
grant execute on function private.member(uuid) to authenticated;
revoke all on all tables in schema private from anon,authenticated;
create function public.game_join(p_code text default null,p_name text default '',p_avatar int default 0,p_room_name text default null,p_secret text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare r private.rooms; pid uuid; n int; a private.attempts;
begin
if auth.uid() is null then raise exception 'กรุณาเชื่อมต่อใหม่'; end if;
if length(coalesce(p_secret,''))>64 then raise exception 'รหัสลับยาวได้ไม่เกิน 64 ตัวอักษร'; end if;
if length(trim(p_name)) not between 1 and 24 or p_avatar not between 0 and 7 then raise exception 'ชื่อเล่นต้องยาว 1–24 ตัวอักษร'; end if;
insert into private.attempts(identity,last_attempt,tries) values(auth.uid(),now(),1) on conflict(identity) do update set tries=case when private.attempts.last_attempt < now()-interval '1 minute' then 1 else private.attempts.tries+1 end,last_attempt=now() returning * into a;
if a.tries>12 then return null; end if;
if p_room_name is not null then
if length(trim(p_room_name)) not between 1 and 40 then raise exception 'ชื่อวงต้องยาว 1–40 ตัวอักษร'; end if;
select count(*) into n from private.players p join private.rooms x on x.id=p.room where p.identity=auth.uid() and x.state<>'FINISHED';
if n>=5 then raise exception 'คุณมีห้องที่ยังเปิดอยู่มากเกินไป'; end if;
pid:=gen_random_uuid();
insert into private.rooms(code,name,host,secret) values((array['pizza','pasta','bread','banana','apple','milk'])[1+floor(random()*6)::int]||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,6),trim(p_room_name),pid,case when p_secret<>'' then extensions.crypt(p_secret,extensions.gen_salt('bf')) end) returning * into r;
insert into private.players(id,room,identity,name,avatar,seat) values(pid,r.id,auth.uid(),trim(p_name),p_avatar,1);
insert into public.room_events(room) values(r.id);
else
select * into r from private.rooms where code=lower(trim(p_code)) for update;
if r.id is null then return null; end if;
select id into pid from private.players where room=r.id and identity=auth.uid();
if pid is not null then return r.id; end if;
if r.secret is not null and extensions.crypt(coalesce(p_secret,''),r.secret) is distinct from r.secret then return null; end if;
if r.state<>'LOBBY' and not (r.admitting and r.state in ('PREPARING','REVEALED')) then raise exception 'วงนี้เริ่มแล้ว รอ Host เปิดรับระหว่างตา'; end if;
select count(*) into n from private.players where room=r.id;
if n>=20 then raise exception 'วงเต็มแล้ว (20 คน)'; end if;
insert into private.players(room,identity,name,avatar,seat) values(r.id,auth.uid(),trim(p_name),p_avatar,n+1);
update private.rooms set queue=array_append(queue,(select id from private.players where room=r.id and identity=auth.uid())) where id=r.id and state<>'LOBBY';
update public.room_events set version=version+1 where room=r.id;
end if;
return r.id;
exception when unique_violation then raise exception 'ชื่อเล่นนี้มีคนใช้ในวงแล้ว ลองชื่อใหม่';
end $$;
create function private.draw(rid uuid) returns void language plpgsql set search_path='' as $$
declare q int; r private.rooms;
begin
select * into r from private.rooms where id=rid;
select id into q from private.questions where (spice=0 or r.spicy) and not(id=any(r.used)) order by random() limit 1;
if q is null then
update private.rooms set used='{}' where id=rid;
select id into q from private.questions where (spice=0 or r.spicy) and id is distinct from r.question order by random() limit 1;
end if;
if q is null then raise exception 'คลังคำถามยังไม่พร้อม'; end if;
update private.rooms set question=q,used=array_append(used,q) where id=rid;
end $$;
create function public.game_action(p_room uuid,p_action text,p_value jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare r private.rooms; p private.players; target uuid; ids uuid[]; oldids uuid[]; n int;
begin
select * into r from private.rooms where id=p_room for update;
select * into p from private.players where room=p_room and identity=auth.uid();
if p.id is null then raise exception 'คุณไม่ได้อยู่ในวงนี้'; end if;
update private.players set seen=now() where id=p.id;
if p_action='heartbeat' then
if exists(select 1 from private.players where id=r.host and seen<now()-interval '60 seconds') then
select id into target from private.players where room=p_room and seen>now()-interval '25 seconds' order by seat limit 1;
if target is not null then
update private.rooms set host=target where id=p_room;
update public.room_events set version=version+1 where room=p_room;
end if;
end if;
return;
end if;
if p_action in ('start','finish','restart','lobby','reorder','admit','exclude','skip','spicy') and p.id<>r.host then raise exception 'เฉพาะ Host เท่านั้น'; end if;
if p_action='spicy' and r.state='LOBBY' then update private.rooms set spicy=(p_value->>'enabled')::boolean where id=p_room;
elsif p_action='admit' and r.state in ('PREPARING','REVEALED') then update private.rooms set admitting=not admitting where id=p_room;
elsif p_action in ('restart','lobby') and r.state='FINISHED' then
update private.players set score=0 where room=p_room;
delete from private.votes where room=p_room;
update private.rooms set state='LOBBY',round=0,owner=null,answer=null,question=null,used='{}',queue='{}',revealed=0,admitting=false where id=p_room;
elsif p_action='start' and r.state='LOBBY' then
select array_agg(id order by seat) into ids from private.players where room=p_room;
if cardinality(ids)<3 then raise exception 'ต้องมีผู้เล่นอย่างน้อย 3 คน'; end if;
update private.rooms set state='PREPARING',round=1,owner=ids[1],queue=ids[2:],admitting=false where id=p_room;
perform private.draw(p_room);
elsif p_action='reroll' and r.state='PREPARING' and p.id=r.owner then perform private.draw(p_room);
elsif p_action='open' and r.state='PREPARING' and p.id=r.owner then
insert into private.votes(room,round,player) select p_room,r.round,id from private.players where room=p_room and id<>r.owner;
update private.rooms set state='GUESSING',admitting=false where id=p_room;
elsif p_action='vote' and r.state='GUESSING' and p.id<>r.owner and jsonb_typeof(p_value->'answer')='boolean' then
update private.votes set answer=(p_value->>'answer')::boolean where room=p_room and round=r.round and player=p.id and answer is null and not excluded;
if not found then raise exception 'ส่งคำตอบแล้ว หรือไม่มีสิทธิ์ทายในตานี้'; end if;
elsif p_action='exclude' and r.state='GUESSING' then
update private.votes set excluded=true where room=p_room and round=r.round and player=(p_value->>'player')::uuid and answer is null;
elsif p_action='reveal' and r.state='READY_TO_REVEAL' and p.id=r.owner and jsonb_typeof(p_value->'answer')='boolean' then
update private.rooms set state='REVEALED',answer=(p_value->>'answer')::boolean,revealed=revealed+1 where id=p_room;
update private.players x set score=score+1 from private.votes v where v.room=p_room and v.round=r.round and v.player=x.id and not v.excluded and v.answer=(p_value->>'answer')::boolean;
elsif (p_action='next' and r.state='REVEALED' and (p.id in (r.host,r.owner) or p.id=coalesce(r.queue[1],(select id from private.players where room=p_room order by seat limit 1)))) or (p_action='skip' and r.state in ('PREPARING','GUESSING','READY_TO_REVEAL')) then
ids:=r.queue;
if cardinality(ids)=0 then select array_agg(id order by seat) into ids from private.players where room=p_room; end if;
update private.rooms set owner=ids[1],queue=ids[2:],state='PREPARING',round=round+1,answer=null,admitting=false where id=p_room;
perform private.draw(p_room);
elsif p_action='finish' and r.state not in ('LOBBY','FINISHED') then update private.rooms set state='FINISHED',admitting=false where id=p_room;
elsif p_action='reorder' and r.state in ('LOBBY','PREPARING','REVEALED') then
select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_value->'ids');
select array_agg(id order by id) into oldids from private.players where room=p_room;
if cardinality(ids)<>cardinality(oldids) or (select array_agg(x order by x) from unnest(ids) x)<>oldids then raise exception 'ลำดับผู้เล่นไม่ถูกต้อง'; end if;
update private.players x set seat=t.ord from unnest(ids) with ordinality t(id,ord) where x.id=t.id;
-- Reorder only players still pending in this lap; never replay an already completed seat.
update private.rooms set queue=array(select x from unnest(ids) x where x=any(r.queue)) where id=p_room and state<>'LOBBY';
else raise exception 'ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน'; end if;
if exists(select 1 from private.rooms where id=p_room and state='GUESSING') and not exists(select 1 from private.votes where room=p_room and round=r.round and answer is null and not excluded) then update private.rooms set state='READY_TO_REVEAL' where id=p_room; end if;
update public.room_events set version=version+1 where room=p_room;
end $$;
create function public.game_view(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.rooms;p private.players; result jsonb;
begin
select * into r from private.rooms where id=p_room for share;
select * into p from private.players where room=p_room and identity=auth.uid();
if p.id is null then raise exception 'คุณไม่ได้อยู่ในวงนี้'; end if;
result:=jsonb_build_object('version',(select version from public.room_events where room=p_room),'id',r.id,'code',r.code,'name',r.name,'host',r.host,'state',r.state,'round',r.round,'owner',r.owner,'me',p.id,'spicy',r.spicy,'admitting',r.admitting,'queue',r.queue,'revealed',r.revealed,'answer',case when r.state='REVEALED' then r.answer end,'question',case when p.id=r.owner or r.state='REVEALED' then (select text from private.questions where id=r.question) end,'players',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'avatar',avatar,'seat',seat,'joined',joined,'score',score,'online',seen>now()-interval '35 seconds') order by seat) from private.players where room=p_room),'votes',coalesce((select jsonb_agg(jsonb_build_object('player',player,'answered',answer is not null,'excluded',excluded,'answer',case when player=p.id or r.state='REVEALED' then answer end)) from private.votes where room=p_room and round=r.round),'[]'::jsonb));
return result;
end $$;
revoke execute on all functions in schema private from public;
grant execute on function private.member(uuid) to authenticated;
revoke execute on function public.game_join(text,text,int,text,text),public.game_action(uuid,text,jsonb),public.game_view(uuid) from public,anon;
grant execute on function public.game_join(text,text,int,text,text),public.game_action(uuid,text,jsonb),public.game_view(uuid) to authenticated;
do $$begin alter publication supabase_realtime add table public.room_events; exception when duplicate_object then null; end$$;
grant select on public.room_events to authenticated;
-- Defense in depth; security-definer functions are owned by the migration owner.
alter table private.rooms enable row level security;
alter table private.players enable row level security;
alter table private.questions enable row level security;
alter table private.votes enable row level security;
alter table private.attempts enable row level security;
