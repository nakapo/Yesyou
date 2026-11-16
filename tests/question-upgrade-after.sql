do $$declare f private.upgrade_fixture; q int; begin
select * into f from private.upgrade_fixture;
perform set_config('request.jwt.claim.sub',f.identity::text,true);
if public.game_view(f.room)->>'question' is distinct from f.text then raise exception 'Migration changed an in-flight question'; end if;
if (select count(*) from private.questions where active)<>498 then raise exception 'Wrong active question count'; end if;
if exists(select 1 from private.questions where id<1001 and active) then raise exception 'Legacy pool still active'; end if;
perform public.game_action(f.room,'reroll');
select question into q from private.rooms where id=f.room;
if q<1001 or not exists(select 1 from private.questions where id=q and active and spice=0) then raise exception 'Draw did not use new default pool'; end if;
raise notice 'PASS: existing round preserved, 498 active questions, legacy rows retired, next draw uses new default pool';
end $$;
drop table private.upgrade_fixture;
