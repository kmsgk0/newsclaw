import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createTestDb} from '../support/helpers.js';
import {AuthService} from '../../src/server/modules/account/service.js';

test('ACC-02 password change invalidates a login whose old-password verification preceded session creation',async()=>{
  const env=await createTestDb();const auth=new AuthService(env.db);const control=await env.db.pool.connect();let held=false;
  try{
    const user=await auth.register({username:'race_reader',password:'old-correct-password'});
    await env.db.query("CREATE FUNCTION pause_session_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(981237); RETURN NEW; END $$");
    await env.db.query('CREATE TRIGGER pause_session BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION pause_session_insert()');
    await control.query('SELECT pg_advisory_lock(981237)');held=true;
    const pending=auth.login({username:'race_reader',password:'old-correct-password'}).then(value=>({value}),error=>({error}));
    const deadline=Date.now()+3000;let waiting=false;
    while(Date.now()<deadline){const row=await env.db.one<{waiting:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE 'INSERT INTO sessions%') AS waiting");if(row?.waiting){waiting=true;break;}await delay(10);}
    assert.equal(waiting,true,'Login must reach real database session insertion before password change');
    let changed=false;
    const change=auth.changePassword(user.id,{oldPassword:'old-correct-password',newPassword:'new-correct-password'}).then(()=>{changed=true;});
    const changeDeadline=Date.now()+3000;let changeObserved=false;
    while(Date.now()<changeDeadline){
      if(changed){changeObserved=true;break;}
      const row=await env.db.one<{waiting:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE users SET password_hash%') AS waiting");
      if(row?.waiting){changeObserved=true;break;}await delay(10);
    }
    assert.equal(changeObserved,true,'Password change must complete or wait for a serialized login');
    await control.query('SELECT pg_advisory_unlock(981237)');held=false;
    const result=await pending;await change;
    if('value' in result)assert.equal(await auth.authenticate(result.value.accessToken),null,'A session issued from the superseded password must not remain usable');
    else assert.ok(result.error);
  }finally{if(held)await control.query('SELECT pg_advisory_unlock(981237)');control.release();await env.cleanup();}
});
