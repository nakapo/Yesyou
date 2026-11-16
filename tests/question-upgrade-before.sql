-- Start a round with the original pool to verify the data migration is non-destructive.
create table private.upgrade_fixture(room uuid, identity uuid, question int, text text);
do $$declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); rid uuid; code text; begin
perform set_config('request.jwt.claim.sub',a::text,true);
rid:=public.game_join(null,'Upgrade host',0,'Migration test','');
select x.code into code from private.rooms x where id=rid;
perform set_config('request.jwt.claim.sub',b::text,true);
perform public.game_join(code,'Second',0,null,'');
perform set_config('request.jwt.claim.sub',c::text,true);
perform public.game_join(code,'Third',0,null,'');
perform set_config('request.jwt.claim.sub',a::text,true);
perform public.game_action(rid,'start');
insert into private.upgrade_fixture select rid,a,r.question,q.text from private.rooms r join private.questions q on q.id=r.question where r.id=rid;
end $$;
