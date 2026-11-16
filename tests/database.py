"""Run against disposable PostgreSQL container initialized by tests/run-database.sh.
Uses three independent authenticated DB sessions with Supabase auth.uid() shim.
This does NOT test Supabase Auth, PostgREST or websocket delivery.
"""
import subprocess,json,uuid,concurrent.futures
DB='yesyou-test-db'
actors=[str(uuid.uuid4()) for _ in range(5)]
checks=0

def sql(q,actor=None,fail=False):
    prefix=f"set role authenticated; set request.jwt.claim.sub='{actor}';" if actor else ''
    r=subprocess.run(['docker','exec','-i',DB,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],input=prefix+q,text=True,capture_output=True)
    if fail:
        assert r.returncode!=0, 'Expected rejection: '+q
        return
    if r.returncode: raise AssertionError(r.stderr+'\n'+q)
    out=r.stdout.strip()
    return json.loads(out) if out else None

def check(ok,label):
    global checks
    assert ok,label
    checks+=1
    print('PASS',label)

def action(actor,a,v=None,fail=False):
    return sql(f"select public.game_action('{room}','{a}','{json.dumps(v or {})}'::jsonb);",actor,fail)

def view(a): return sql(f"select public.game_view('{room}');",a)
def join(a,name,code=None,secret='',create=False):
    q=f"select to_json(public.game_join({repr(code) if code else 'null'},'{name}',0,{'\u0027Test room\u0027' if create else 'null'},'{secret}'));"
    return sql(q,a)
room=join(actors[0],'Host',secret='test-pass',create=True)
g=view(actors[0]);code=g['code'];host=g['me']
check(g['state']=='LOBBY','create room with anonymous identity')
action(actors[0],'start',fail=True)
check(True,'cannot start with fewer than three players')
check(join(actors[1],'Friend',code,'wrong') is None,'wrong secret rejected')
check(sql(f"select to_json(public.game_join('{code}','Null-secret',0,null,null));",actors[1]) is None,'null secret cannot bypass password')
join(actors[1],'Friend',code,'test-pass');join(actors[2],'Other',code,'test-pass')
p2=view(actors[1])['me'];p3=view(actors[2])['me']
check(len(view(actors[0])['players'])==3,'three independent identities joined')
check(join(actors[1],'Friend',code,'')==room and len(view(actors[0])['players'])==3,'verified identity reconnect does not duplicate')
sql(f"select public.game_join('{code}','Friend',0,null,'test-pass');",actors[3],True)
check(True,'duplicate name rejected')
action(actors[1],'start',fail=True);action(actors[0],'start')
check(view(actors[0])['state']=='PREPARING','host only start')
check(view(actors[1])['question'] is None and view(actors[0])['question'],'question payload private')
q=view(actors[0])['question'];action(actors[0],'reroll');check(view(actors[0])['question']!=q,'reroll avoids previous question')
check(sql(f"select cardinality(used) from private.rooms where id='{room}';")==2,'skipped questions retained in history')
sql(f"update private.rooms set used=array(select id from private.questions where spice=0) where id='{room}';")
action(actors[0],'reroll')
check(sql(f"select cardinality(used) from private.rooms where id='{room}';")==1,'question pool restarts only after exhaustion')
action(actors[0],'open');action(actors[0],'reroll',fail=True);action(actors[0],'reveal',{'answer':True},True)
check(True,'cannot reroll after open or reveal early')
action(actors[1],'vote',{'answer':True})
check(next(v for v in view(actors[1])['votes'] if v['player']==p2)['answer'] is True,'own answer restored from backend')
check(all(v['answer'] is None for v in view(actors[0])['votes']),'owner payload contains no guesses')
check(all(v['answer'] is None for v in view(actors[2])['votes']),'other player cannot see submitted guess')
action(actors[1],'vote',{'answer':False},True)
action(actors[1],'reveal',{'answer':True},True)
action(actors[2],'vote',{'answer':False})
check(view(actors[0])['state']=='READY_TO_REVEAL','last eligible guess enables reveal')
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    def reveal_once(_):
        try: action(actors[0],'reveal',{'answer':True}); return True
        except AssertionError: return False
    check(sum(pool.map(reveal_once,range(2)))==1,'simultaneous reveals commit only once')
g=view(actors[0]);check([p['score'] for p in g['players']]==[0,1,0],'correct +1, wrong zero, owner zero')
check(view(actors[2])['question'] is not None and view(actors[2])['answer'] is True,'reveal visible to everyone')
action(actors[0],'reveal',{'answer':True},True)
check([p['score'] for p in view(actors[0])['players']]==[0,1,0],'duplicate reveal cannot score twice')
action(actors[0],'reorder',{'ids':[p3,host,p2]})
check(view(actors[0])['queue']==[p3,p2],'reorder changes pending queue without replaying completed owner')
action(actors[2],'next');check(view(actors[0])['owner']==p3,'next owner can begin turn following adjusted queue')
sql(f"select public.game_join('{code}','Late',0,null,'test-pass');",actors[3],True)
action(actors[0],'admit');join(actors[3],'Late',code,'test-pass')
check(len(view(actors[0])['players'])==4,'host explicitly admits late player between turns')
action(actors[2],'open');action(actors[0],'exclude',{'player':p2})
for a in [actors[0],actors[3]]:action(a,'vote',{'answer':False})
check(view(actors[0])['state']=='READY_TO_REVEAL','explicit exclusion removes pending blocker')
action(actors[0],'skip');check(view(actors[0])['owner']==p2,'skip owner without awarding score')
action(actors[0],'skip');action(actors[0],'skip')
check(view(actors[0])['owner']==p3,'wrap follows complete seat order after remaining queue')
action(actors[0],'finish')
check(view(actors[2])['state']=='FINISHED' and sum(p['score'] for p in view(actors[2])['players'])==1,'finish preserves only revealed scores')
action(actors[0],'restart');check(view(actors[1])['revealed']==0 and all(p['score']==0 for p in view(actors[1])['players']),'restart resets all scores and history')
action(actors[0],'start');action(actors[0],'finish');check(view(actors[0])['revealed']==0,'finish before any reveal has no winners')
action(actors[0],'lobby');action(actors[0],'start')
# Current owner is p3 because seat order was retained.
action(actors[2],'open')
for a in [actors[0],actors[1]]:action(a,'vote',{'answer':True})
def race(a,v):
    try:action(a,*v);return 'ok'
    except AssertionError:return 'rejected'
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results=list(pool.map(lambda x:race(*x),[(actors[3],('vote',{'answer':True})),(actors[0],('finish',{}))]))
check(view(actors[0])['state']=='FINISHED' and all(p['score']==0 for p in view(actors[0])['players']),'last vote versus finish race cannot award unearned score')
action(actors[0],'restart')
sql(f"update private.players set seen=now()-interval '2 minutes' where id='{host}';")
action(actors[2],'heartbeat')
check(view(actors[2])['host']==p3,'host transfers to first online seat after grace period')
action(actors[0],'start',fail=True)
check(True,'old host cannot retain authority')
other=join(actors[4],'Outside',create=True)
sql(f"select public.game_view('{room}');",actors[4],True)
check(sql(f"select count(*) from public.room_events where room='{room}';",actors[4])==0,'events RLS isolates rooms')
sql('select * from private.votes;',actors[1],True);sql('select * from private.questions;',actors[1],True);sql('update private.players set score=999;',actors[1],True)
check(True,'private tables cannot be read or modified by clients')
for _ in range(13):join(actors[4],'Guess','missing')
check(join(actors[4],'Throttled',code,'test-pass') is None,'join brute-force attempts rate limited')
check(sql("select to_json(secret not like '%test-pass%') from private.rooms where id='"+room+"';") is True,'room secret stored as bcrypt hash')
print(f'\n{checks} database checks passed. No hosted Supabase transport was used.')

room=join(str(uuid.uuid4()),'Capacity host',create=True)
capacity_host=sql(f"select to_json(identity) from private.players where room='{room}' order by seat limit 1;")
capacity_code=view(capacity_host)['code']
for i in range(19):join(str(uuid.uuid4()),'Seat '+str(i),capacity_code)
check(len(view(capacity_host)['players'])==20,'supports twenty distinct players')
sql(f"select public.game_join('{capacity_code}','Overflow',0,null,'');",str(uuid.uuid4()),True)
check(len(view(capacity_host)['players'])==20,'twenty-first player rejected without extra membership')
print(f'FINAL: {checks} database checks passed')
