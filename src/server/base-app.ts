import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { AppContext } from './context.js';
import { AuthService } from './modules/account/service.js';
import { CsrfService } from './modules/account/csrf.js';
import { registerAuth } from './modules/account/index.js';
import { AppError, forbidden } from './errors.js';
import { registerTasks } from './runtime/routes.js';
import { inputErrors } from './validation-errors.js';
import { metrics } from './runtime/metrics.js';
import { z } from 'zod';

export async function createBaseApp(ctx:AppContext) {
  const app=Fastify({genReqId:()=>randomUUID(),loggerInstance:ctx.logger as FastifyBaseLogger,disableRequestLogging:true,ajv:{customOptions:{removeAdditional:false,coerceTypes:true}}});
  await app.register(cookie);
  const envelope={type:'object',properties:{code:{type:'string'},message:{type:'string'},data:{},requestId:{type:'string'}}};
  await app.register(swagger,{openapi:{info:{title:'NewsClaw API',version:ctx.config.version},components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}}},transform:({schema,url,route})=>({url,schema:{...schema,security:route.config?.public?[]:[{bearerAuth:[]}],response:schema?.response??{200:envelope,400:envelope,401:envelope,403:envelope,404:envelope,409:envelope,503:envelope}}})});
  await app.register(swaggerUi,{routePrefix:'/docs/api'});
  app.decorateRequest('actor',null);app.decorateRequest('sessionId',null);
  const auth=new AuthService(ctx.db),csrf=new CsrfService(ctx.db);
  app.addHook('onRequest',async req=>{
    if(!req.url.startsWith('/api/v1')) return;
    const token=/^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization??'')?.[1];
    if(token) {
      const session=await auth.authenticate(token);
      if(session){req.actor=session.actor;req.sessionId=session.sessionId;}
    }
    if(!req.routeOptions.config.public&&!req.actor) throw new AppError(401,'UNAUTHENTICATED','请登录后继续');
    if(req.routeOptions.config.admin&&req.actor?.role!=='admin') throw forbidden();
    const origin=req.headers.origin;
    const permitted=[ctx.config.appOrigin];
    if(ctx.config.nodeEnv!=='production') permitted.push('http://localhost:5175','http://127.0.0.1:5175');
    if(origin&&!['GET','HEAD','OPTIONS'].includes(req.method)&&!permitted.includes(origin)) throw new AppError(403,'FORBIDDEN','请求来源无效');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const refresh=req.routeOptions.url==='/api/v1/auth/refresh' && req.cookies.newsclaw_refresh;
      const sessionId=refresh ? await auth.refreshSessionId(refresh) : (origin ? req.sessionId : null);
      if(refresh && !sessionId) throw new AppError(401,'UNAUTHENTICATED','请重新登录');
      if(sessionId) await csrf.consume(sessionId,req.headers['x-csrf-token']);
    }
  });
  app.addHook('onSend',async(req,reply,payload)=>{
    if(!req.url.startsWith('/api/v1')||reply.getHeader('content-type')?.toString().includes('text/event-stream')||req.routeOptions.config.rawResponse) return payload;
    if(typeof payload!=='string' && payload!==null && payload!==undefined) return payload;
    const data=typeof payload==='string'?JSON.parse(payload):null;
    if(data&&typeof data==='object'&&'code' in data&&'requestId' in data) return payload;
    reply.type('application/json; charset=utf-8');
    return JSON.stringify({code:'OK',message:'成功',data,requestId:req.id});
  });
  app.addHook('onResponse',async(req,reply)=>{
    const route=req.routeOptions.url ?? 'unmatched';
    const params=req.params as { id?: unknown } | undefined;
    const id=typeof params?.id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id) ? params.id : null;
    metrics.request(req.method,route,reply.statusCode,reply.elapsedTime);
    ctx.logger.info({requestId:req.id,actorId:req.actor?.id??'anonymous',method:req.method,path:route,operation:`${req.method} ${route}`,objectId:id,skillId:route.includes('/skills/')?id:null,usage:null,result:reply.statusCode,durationMs:reply.elapsedTime},'Request finished');
    if(req.url.startsWith('/api/v1')) {
      try {
        await ctx.db.query('INSERT INTO request_audit(request_id,actor_id,method,route,status,object_id,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',[req.id,req.actor?.id??null,req.method,route,reply.statusCode,id,reply.elapsedTime]);
      } catch {
        ctx.logger.error({requestId:req.id,module:'audit',result:'write-failed'},'Audit record could not be saved');
      }
    }
  });
  app.setErrorHandler((error,req,reply)=>{
    const failure=error as {code?:string;message?:string;validation?:unknown};
    let status=500,code='INTERNAL_ERROR',message='操作暂未完成，请稍后重试';
    const fieldErrors=inputErrors(error);
    if(error instanceof AppError){status=error.status;code=error.code;message=error.message;}
    else if(fieldErrors){status=400;code='INVALID_INPUT';message=Object.values(fieldErrors).join('；');}
    else if(['FST_ERR_CTP_INVALID_JSON_BODY','FST_ERR_CTP_EMPTY_JSON_BODY'].includes(failure.code??'')){status=400;code='INVALID_INPUT';message='请求内容不是有效的 JSON';}
    else if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P01','57P03','53300'].includes(failure.code??'')||/Connection terminated|connection timeout/i.test(failure.message??'')){status=503;code='DEPENDENCY_UNAVAILABLE';message='数据库或外部服务暂不可用';}
    else if(failure.code==='23505'){status=409;code='CONFLICT';message='内容已存在或状态冲突';}
    else if(failure.code==='22P02'){status=400;code='INVALID_INPUT';message='对象标识或参数格式不正确';}
    ctx.logger.warn({requestId:req.id,code,result:status,message},'Request failed');
    reply.code(status).send({code,message,data:fieldErrors?{fieldErrors}:null,requestId:req.id});
  });
  app.get('/live',{config:{public:true}},async()=>({status:'alive',version:ctx.config.version}));
  app.get('/health',{config:{public:true}},async(_req,reply)=>{
    const results=await Promise.allSettled([ctx.db.query('SELECT 1'),Promise.race([ctx.tasks.queue.getJobCounts('waiting'),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('Redis timeout')),1500);t.unref();})])]);
    const healthy=results.every(r=>r.status==='fulfilled');reply.code(healthy?200:503);
    return {status:healthy?'ready':'unavailable',version:ctx.config.version,time:new Date().toISOString(),dependencies:{database:results[0].status==='fulfilled',queue:results[1].status==='fulfilled'}};
  });
  app.get('/api/v1/openapi.json',{config:{public:true,rawResponse:true}},async()=>app.swagger());
  const auditQuery=z.object({requestId:z.string().uuid().optional(),actorId:z.string().uuid().optional(),status:z.coerce.number().int().min(100).max(599).optional(),from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(10000).default(0)}).strict();
  app.get('/api/v1/admin/audit',{config:{admin:true},schema:{tags:['管理'],querystring:z.toJSONSchema(auditQuery,{target:'draft-7'})}},async req=>{
    const {requestId,actorId,status,from,to,limit,offset}=auditQuery.parse(req.query);
    if(from && to && Date.parse(from)>Date.parse(to)) throw new AppError(400,'INVALID_INPUT','开始时间不能晚于结束时间');
    const items=await ctx.db.query('SELECT request_id,occurred_at,actor_id,method,route,status,object_id,duration_ms FROM request_audit WHERE ($1::uuid IS NULL OR request_id=$1::uuid) AND ($2::uuid IS NULL OR actor_id=$2::uuid) AND ($3::integer IS NULL OR status=$3::integer) AND ($4::timestamptz IS NULL OR occurred_at >= $4::timestamptz) AND ($5::timestamptz IS NULL OR occurred_at <= $5::timestamptz) ORDER BY occurred_at DESC,request_id DESC LIMIT $6 OFFSET $7',[requestId??null,actorId??null,status??null,from??null,to??null,limit,offset]);
    return {items};
  });
  const skillAuditQuery=z.object({actorId:z.string().uuid().optional(),skillId:z.string().uuid().optional(),requestId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional(),from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(10000).default(0)}).strict();
  app.get('/api/v1/admin/skill-audit',{config:{admin:true},schema:{tags:['管理'],querystring:z.toJSONSchema(skillAuditQuery,{target:'draft-7'})}},async req=>{
    const {actorId,skillId,requestId,from,to,limit,offset}=skillAuditQuery.parse(req.query);
    if(from && to && Date.parse(from)>Date.parse(to)) throw new AppError(400,'INVALID_INPUT','开始时间不能晚于结束时间');
    const items=await ctx.db.query(`SELECT id,occurred_at,request_id,actor_id,operation,object_id,message_id,skill_id,result,error_code,input_tokens,output_tokens,total_tokens,duration_ms FROM skill_audit WHERE ($1::uuid IS NULL OR actor_id=$1::uuid) AND ($2::uuid IS NULL OR skill_id=$2::uuid) AND ($3::text IS NULL OR request_id=$3) AND ($4::timestamptz IS NULL OR occurred_at >= $4::timestamptz) AND ($5::timestamptz IS NULL OR occurred_at <= $5::timestamptz) ORDER BY occurred_at DESC,id DESC LIMIT $6 OFFSET $7`,[actorId??null,skillId??null,requestId??null,from??null,to??null,limit,offset]);
    return {items};
  });
  await registerAuth(app,ctx);await registerTasks(app,ctx);
  return app;
}
