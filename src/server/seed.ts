import { loadConfig } from './config.js';
import { Db } from './db.js';
import { seedSources } from './modules/news/index.js';

const config=loadConfig();
const db=new Db(config.databaseUrl,undefined,config.databasePoolMax);
try {
  await seedSources(db);
  const username=process.env.ADMIN_USERNAME;
  if(username) {
    const user=await db.one("UPDATE users SET role='admin' WHERE username=$1 RETURNING id",[username]);
    if(!user) throw new Error('Register the intended administrator before setting ADMIN_USERNAME');
    console.log('Administrator role updated');
  }
  console.log('Source configuration initialized; existing source settings preserved');
}finally{await db.close();}
