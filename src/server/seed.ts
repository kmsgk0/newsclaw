import { loadConfig } from './config.js';
import { Db } from './db.js';

const db=new Db(loadConfig().databaseUrl);
try {
  const username=process.env.ADMIN_USERNAME;
  if(username) {
    const user=await db.one("UPDATE users SET role='admin' WHERE username=$1 RETURNING id",[username]);
    if(!user) throw new Error('Register the intended administrator before setting ADMIN_USERNAME');
    console.log('Administrator role updated');
  }
}finally{await db.close();}
