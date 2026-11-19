import type { Db } from '../../db.js';
import { AppError, notFound, invalid } from '../../errors.js';
import type { Citation } from '../editor/repository.js';

export interface AnswerFeedback {category:'helpful'|'inaccurate'|'unsupported_citation';sourceLabel:string|null;note:string;updatedAt:Date}
export interface FeedbackInput {category:AnswerFeedback['category'];sourceLabel?:string;note?:string}
const columns=`category,source_label AS "sourceLabel",note,updated_at AS "updatedAt"`;
export class FeedbackRepository {
  constructor(private db:Db) {}
  private async owned(db:Db,userId:string,messageId:string,lock=false) {
    const message=await db.one<{role:string;status:string;sources:Citation[]}>(`SELECT m.role,m.status,m.sources FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.user_id=$2${lock?' FOR SHARE OF m':''}`,[messageId,userId]);
    if(!message) throw notFound();
    return message;
  }
  async read(userId:string,messageId:string) {
    await this.owned(this.db,userId,messageId);
    return (await this.db.one<AnswerFeedback>(`SELECT ${columns} FROM answer_feedback WHERE message_id=$1 AND user_id=$2`,[messageId,userId]))??null;
  }
  async save(userId:string,messageId:string,input:FeedbackInput) {
    return this.db.tx(async db=>{
      const message=await this.owned(db,userId,messageId,true);
      if(message.role!=='assistant'||message.status!=='completed') throw new AppError(409,'CONFLICT','只能反馈已完成的编辑回答');
      const source=input.sourceLabel?message.sources.find(item=>item.label===input.sourceLabel):undefined;
      if(input.category==='unsupported_citation'?!source:input.sourceLabel!==undefined) throw invalid('请选择当前回答中的引用，仅引用问题需要选择来源');
      return db.one<AnswerFeedback>(`INSERT INTO answer_feedback(message_id,user_id,category,source_label,news_id,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(message_id) DO UPDATE SET category=EXCLUDED.category,source_label=EXCLUDED.source_label,news_id=EXCLUDED.news_id,note=EXCLUDED.note,updated_at=now() RETURNING ${columns}`,[messageId,userId,input.category,source?.label??null,source?.id??null,input.note??'']);
    });
  }
  async remove(userId:string,messageId:string) {
    return this.db.tx(async db=>{
      await this.owned(db,userId,messageId,true);
      await db.query('DELETE FROM answer_feedback WHERE message_id=$1 AND user_id=$2',[messageId,userId]);
      return {deleted:true};
    });
  }
  async aggregate() {
    return this.db.tx(async db=>({
      categories:await db.query<{category:AnswerFeedback['category'];count:number}>('SELECT category,count(*)::int AS count FROM answer_feedback GROUP BY category ORDER BY category'),
      sources:await db.query<{newsId:string;title:string;url:string;count:number}>(`SELECT n.id AS "newsId",n.title,n.url,count(*)::int AS count FROM answer_feedback f JOIN news n ON n.id=f.news_id WHERE f.category='unsupported_citation' GROUP BY n.id ORDER BY count DESC,n.id LIMIT 50`),
    }));
  }
}
