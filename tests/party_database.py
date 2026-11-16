"""Integration checks for food codes, avatars and automatic private next-turn preparation."""
import subprocess,json,uuid,concurrent.futures,re
DB='yesyou-test-db'
def sql(query,actor=None,fail=False):
 prefix=f"set role authenticated;set request.jwt.claim.sub='{actor}';" if actor else ''
 p=subprocess.run(['docker','exec','-i',DB,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],input=prefix+query,text=True,capture_output=True)
 if fail:
  assert p.returncode!=0,'Expected rejection';return
 assert p.returncode==0,p.stderr
 return json.loads(p.stdout.strip()) if p.stdout.strip() else None
actors=[str(uuid.uuid4()) for _ in range(4)]
def join(a,n,code=None,avatar=0):
 return sql(f"select to_json(public.game_join({repr(code) if code else 'null'},'{n}',{avatar},{'null' if code else repr('Party test')},''));",a)
room=join(actors[0],'Host',avatar=19)
def view(a):return sql(f"select public.game_view('{room}');",a)
def act(a,action,value=None,fail=False):return sql(f"select public.game_action('{room}','{action}','{json.dumps(value or {})}');",a,fail)
code=view(actors[0])['code'];assert re.fullmatch('[a-z]+',code)
join(actors[1],'Second',code,8);join(actors[2],'Third',code,17)
assert sorted(p['avatar'] for p in view(actors[0])['players'])==[8,17,19]
sql(f"select public.game_join('{code}','Invalid',20,null,'');",actors[3],True)
pids=[view(a)['me'] for a in actors[:3]]
act(actors[0],'start');act(actors[0],'open')
act(actors[1],'vote',{'answer':True});act(actors[2],'vote',{'answer':False});act(actors[0],'reveal',{'answer':True})
next_view=view(actors[1]);assert next_view['state']=='PREPARING' and next_view['preparing_next'] and next_view['owner']==pids[1] and next_view['round']==2
assert next_view['votes']==[] and next_view['answer'] is None and next_view['question']
assert view(actors[0])['state']=='REVEALED' and view(actors[2])['state']=='REVEALED'
original_question=view(actors[0])['question']
assert 'next_question' not in view(actors[2]) and 'next_owner' not in view(actors[2])
act(actors[0],'reroll',fail=True)
q=next_view['question'];act(actors[1],'reroll');assert view(actors[1])['question']!=q
assert view(actors[0])['question']==original_question
# Reorder preparation to another player, and give the new owner a fresh question.
q=view(actors[1])['question'];act(actors[0],'reorder',{'ids':[pids[0],pids[2],pids[1]]})
assert view(actors[2])['preparing_next'] and view(actors[2])['question']!=q
assert view(actors[1])['state']=='REVEALED'
new_q=view(actors[2])['question']
act(actors[1],'open',fail=True)
act(actors[2],'open')
assert all(view(a)['state']=='GUESSING' for a in actors[:3])
assert view(actors[2])['question']==new_q and view(actors[0])['question'] is None
assert len(view(actors[2])['votes'])==2 and all(not v['answered'] for v in view(actors[2])['votes'])
act(actors[2],'reveal',{'answer':True},True)
act(actors[0],'vote',{'answer':True});act(actors[1],'vote',{'answer':True});act(actors[2],'reveal',{'answer':True})
assert sum(p['score'] for p in view(actors[0])['players'])==3
# Finishing while a next question is prepared never scores that unopened turn.
assert view(actors[1])['preparing_next'];act(actors[0],'finish')
assert view(actors[1])['state']=='FINISHED' and sum(p['score'] for p in view(actors[1])['players'])==3
sql(f"update private.rooms set state='LOBBY' where id='{room}';")
# Simultaneous creators get distinct whole-word codes.
def create(_):
 a=str(uuid.uuid4());rid=join(a,'New host');g=sql(f"select public.game_view('{rid}');",a);return rid,g['code']
with concurrent.futures.ThreadPoolExecutor(6) as pool:rooms=list(pool.map(create,range(12)))
assert len({c for _,c in rooms})==12 and all(re.fullmatch('[a-z]+',c) for _,c in rooms)
# Exhaust the free-word pool so one finished word must be reclaimed.
food_sql=open('supabase/migrations/202611170004_party_flow.sql').read().split('unnest(array[')[1].split(']::text[]')[0]
sql(f"insert into private.rooms(code,name,host) select w,'Occupied',gen_random_uuid() from unnest(array[{food_sql}]) w where not exists(select 1 from private.rooms r where r.code=w);")
sql(f"update private.rooms set state='LOBBY' where code in ({food_sql}) and id<>'{room}';")
sql(f"update private.rooms set state='FINISHED' where id='{room}';")
new_room,new_code=create(0)
assert new_code==code,'Only the finished room should be available for reuse'
assert view(actors[0])['code'].startswith('archived-')
act(actors[0],'restart',fail=True) # All words now active; no corrupt room restart.
assert view(actors[0])['state']=='FINISHED'
print('PASS party flow: food-word uniqueness/reuse/exhaustion, avatars 0–19, automatic private preview, reroll/reorder authorization, next-turn snapshot, early reveal rejection and scoring')
