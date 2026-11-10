import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { AppContext } from './context.js';
import { AuthService } from './modules/account/service.js';
import { registerAuth } from './modules/account/index.js';
import { AppError, forbidden } from './errors.js';
import { registerTasks } from './runtime/routes.js';
import { inputErrors } from './validation-errors.js';

export async function createBaseApp(ctx:AppContext) {
  const app=Fastify({genReqId:()=>randomUUID(),loggerInstance:ctx.logger as FastifyBaseLogger,disableRequestLogging:true,ajv:{customOptions:{removeAdditional:false,coerceTypes:true}}});
  await app.register(cookie);
  const envelope={type:'object',properties:{code:{type:'string'},message:{type:'string'},data:{},requestId:{type:'string'}}};
  await app.register(swagger,{openapi:{info:{title:'NewsClaw API',version:ctx.config.version},components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}}},transform:({schema,url,route})=>({url,schema:{...schema,security:route.config?.public?[]:[{bearerAuth:[]}],response:schema.response??{200:envelope,400:envelope,401:envelope,403:envelope,404:envelope,409:envelope,503:envelope}}})});
  await app.register(swaggerUi,{routePrefix:'/docs/api'});
  app.decorateRequest('actor',null);app.decorateRequest('sessionId',null);
  const auth=new AuthService(ctx.db);
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
    ctx.logger.info({requestId:req.id,actorId:req.actor?.id??'anonymous',method:req.method,path:req.url.split('?')[0],result:reply.statusCode,durationMs:reply.elapsedTime},'Request finished');
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
  await registerAuth(app,ctx);await registerTasks(app,ctx);
  return app;
}
