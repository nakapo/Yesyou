-- Food-only codes, twenty distinct avatar choices, private preparation of the next turn.
begin;
alter table private.rooms add column if not exists next_owner uuid;
alter table private.rooms add column if not exists next_question int;
create or replace function private.food_code() returns text language plpgsql set search_path='' as $$
declare chosen text;
begin
perform pg_advisory_xact_lock(719241004);
select word into chosen from unnest(array['pizza','pasta','bread','banana','apple','milk','rice','sushi','taco','curry','mango','lemon','peach','grape','melon','pear','kiwi','lime','plum','cherry','berry','orange','coconut','papaya','guava','lychee','durian','pomelo','fig','date','avocado','apricot','olive','tomato','potato','carrot','corn','pumpkin','onion','garlic','pepper','ginger','chili','basil','bean','pea','tofu','egg','cheese','butter','cream','yogurt','bacon','steak','ham','chicken','duck','turkey','salmon','tuna','shrimp','crab','clam','squid','oyster','lobster','mussel','donut','cake','cookie','brownie','muffin','waffle','pancake','pie','tart','pudding','jelly','candy','chocolate','caramel','honey','jam','syrup','toast','bagel','bun','croissant','pretzel','cracker','popcorn','noodle','ramen','udon','soba','pho','dumpling','wonton','bao','dimsum','nacho','burrito','kebab','falafel','hummus','burger','hotdog','sandwich','salad','soup','porridge','cereal','granola','oatmeal','peanut','almond','cashew','walnut','sesame','pistachio','coffee','tea','cocoa','soda','juice','smoothie','water']::text[]) as word
where not exists(select 1 from private.rooms r where r.code=word and r.state<>'FINISHED')
order by random() limit 1;
if chosen is null then raise exception 'ตอนนี้วงเต็มทุกชื่ออาหารแล้ว ลองใหม่ภายหลัง'; end if;
-- Reuse only finished-room names; UUID-based reconnect to old summaries remains available.
update private.rooms set code='archived-'||id::text where private.rooms.code=chosen and state='FINISHED';
return chosen;
end $$;
create or replace function private.prepare_next(rid uuid) returns void language plpgsql set search_path='' as $$
declare r private.rooms; target uuid; q int;
begin
select * into r from private.rooms where id=rid;
if r.state<>'REVEALED' then return; end if;
target:=r.queue[1];
if target is null then select id into target from private.players where room=rid order by seat limit 1; end if;
if r.next_owner is not distinct from target and r.next_question is not null then return; end if;
perform private.draw(rid);
select question into q from private.rooms where id=rid;
update private.rooms set next_owner=target,next_question=q,question=r.question where id=rid;
end $$;

create or replace function public.game_join(p_code text default null,p_name text default '',p_avatar int default 0,p_room_name text default null,p_secret text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare r private.rooms; pid uuid; n int; a private.attempts;
begin
if auth.uid() is null then raise exception 'กรุณาเชื่อมต่อใหม่'; end if;
if length(coalesce(p_secret,''))>64 then raise exception 'รหัสลับยาวได้ไม่เกิน 64 ตัวอักษร'; end if;
if length(trim(p_name)) not between 1 and 24 or p_avatar not between 0 and 19 then raise exception 'ชื่อเล่นต้องยาว 1–24 ตัวอักษร'; end if;
insert into private.attempts(identity,last_attempt,tries) values(auth.uid(),now(),1) on conflict(identity) do update set tries=case when private.attempts.last_attempt < now()-interval '1 minute' then 1 else private.attempts.tries+1 end,last_attempt=now() returning * into a;
if a.tries>12 then return null; end if;
if p_room_name is not null then
if length(trim(p_room_name)) not between 1 and 40 then raise exception 'ชื่อวงต้องยาว 1–40 ตัวอักษร'; end if;
select count(*) into n from private.players p join private.rooms x on x.id=p.room where p.identity=auth.uid() and x.state<>'FINISHED';
if n>=5 then raise exception 'คุณมีห้องที่ยังเปิดอยู่มากเกินไป'; end if;
pid:=gen_random_uuid();
insert into private.rooms(code,name,host,secret) values(private.food_code(),trim(p_room_name),pid,case when p_secret<>'' then extensions.crypt(p_secret,extensions.gen_salt('bf')) end) returning * into r;
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
perform private.prepare_next(r.id);
update public.room_events set version=version+1 where room=r.id;
end if;
return r.id;
exception when unique_violation then raise exception 'ชื่อเล่นนี้มีคนใช้ในวงแล้ว ลองชื่อใหม่';
end $$;

create or replace function public.game_action(p_room uuid,p_action text,p_value jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
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
update private.rooms set code=case when code like 'archived-%' then private.food_code() else code end,state='LOBBY',round=0,owner=null,answer=null,question=null,used='{}',queue='{}',revealed=0,admitting=false,next_owner=null,next_question=null where id=p_room;
elsif p_action='start' and r.state='LOBBY' then
select array_agg(id order by seat) into ids from private.players where room=p_room;
if cardinality(ids)<3 then raise exception 'ต้องมีผู้เล่นอย่างน้อย 3 คน'; end if;
update private.rooms set state='PREPARING',round=1,owner=ids[1],queue=ids[2:],admitting=false where id=p_room;
perform private.draw(p_room);
elsif p_action='reroll' and r.state='REVEALED' and p.id=r.next_owner then
update private.rooms set next_question=null where id=p_room;
perform private.prepare_next(p_room);
elsif p_action='open' and r.state='REVEALED' and p.id=r.next_owner then
ids:=r.queue;
if cardinality(ids)=0 then select array_agg(id order by seat) into ids from private.players where room=p_room; end if;
update private.rooms set owner=ids[1],queue=ids[2:],question=r.next_question,next_owner=null,next_question=null,state='GUESSING',round=round+1,answer=null,admitting=false where id=p_room;
insert into private.votes(room,round,player) select p_room,r.round+1,id from private.players where room=p_room and id<>r.next_owner;
r.round:=r.round+1;
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
update private.rooms set owner=ids[1],queue=ids[2:],state='PREPARING',round=round+1,answer=null,admitting=false,next_owner=null,next_question=null where id=p_room;
if r.state='REVEALED' and r.next_owner=ids[1] and r.next_question is not null then
update private.rooms set question=r.next_question where id=p_room;
else perform private.draw(p_room); end if;
elsif p_action='finish' and r.state not in ('LOBBY','FINISHED') then update private.rooms set state='FINISHED',admitting=false,next_owner=null,next_question=null where id=p_room;
elsif p_action='reorder' and r.state in ('LOBBY','PREPARING','REVEALED') then
select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_value->'ids');
select array_agg(id order by id) into oldids from private.players where room=p_room;
if cardinality(ids)<>cardinality(oldids) or (select array_agg(x order by x) from unnest(ids) x)<>oldids then raise exception 'ลำดับผู้เล่นไม่ถูกต้อง'; end if;
update private.players x set seat=t.ord from unnest(ids) with ordinality t(id,ord) where x.id=t.id;
-- Reorder only players still pending in this lap; never replay an already completed seat.
update private.rooms set queue=array(select x from unnest(ids) x where x=any(r.queue)) where id=p_room and state<>'LOBBY';
else raise exception 'ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน'; end if;
if exists(select 1 from private.rooms where id=p_room and state='GUESSING') and not exists(select 1 from private.votes where room=p_room and round=r.round and answer is null and not excluded) then update private.rooms set state='READY_TO_REVEAL' where id=p_room; end if;
perform private.prepare_next(p_room);
update public.room_events set version=version+1 where room=p_room;
end $$;

create or replace function public.game_view(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.rooms;p private.players; result jsonb; ids uuid[];
begin
select * into r from private.rooms where id=p_room for share;
select * into p from private.players where room=p_room and identity=auth.uid();
if p.id is null then raise exception 'คุณไม่ได้อยู่ในวงนี้'; end if;
result:=jsonb_build_object('version',(select version from public.room_events where room=p_room),'id',r.id,'code',r.code,'name',r.name,'host',r.host,'state',r.state,'round',r.round,'owner',r.owner,'me',p.id,'spicy',r.spicy,'admitting',r.admitting,'queue',r.queue,'revealed',r.revealed,'answer',case when r.state='REVEALED' then r.answer end,'question',case when p.id=r.owner or r.state='REVEALED' then (select text from private.questions where id=r.question) end,'players',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'avatar',avatar,'seat',seat,'joined',joined,'score',score,'online',seen>now()-interval '35 seconds') order by seat) from private.players where room=p_room),'votes',coalesce((select jsonb_agg(jsonb_build_object('player',player,'answered',answer is not null,'excluded',excluded,'answer',case when player=p.id or r.state='REVEALED' then answer end)) from private.votes where room=p_room and round=r.round),'[]'::jsonb));
if r.state='REVEALED' and p.id=r.next_owner and r.next_question is not null then
ids:=r.queue;
if cardinality(ids)=0 then select array_agg(id order by seat) into ids from private.players where room=p_room; end if;
result:=result||jsonb_build_object('state','PREPARING','round',r.round+1,'owner',r.next_owner,'question',(select text from private.questions where id=r.next_question),'answer',null,'votes','[]'::jsonb,'queue',ids[2:],'preparing_next',true);
end if;
return result;
end $$;

-- Existing games paused on a reveal also receive a next-turn preview.
do $$declare rid uuid; begin
for rid in select id from private.rooms where state='REVEALED' for update loop
perform private.prepare_next(rid);
update public.room_events set version=version+1 where room=rid;
end loop;
end $$;
revoke execute on function private.food_code(),private.prepare_next(uuid) from public,anon,authenticated;
commit;
