import type { Db } from '../../db.js';
import type { RequestAuditFilters, SkillAuditFilters } from './schemas.js';
interface RequestAuditRecord {
  requestId: string;
  actorId: string | null;
  method: string;
  route: string;
  status: number;
  objectId: string | null;
  durationMs: number;
}
export class AuditRepository {
  constructor(private db: Db) { }
  async recordRequest(record: RequestAuditRecord) {
    await this.db.query('INSERT INTO request_audit(request_id,actor_id,method,route,status,object_id,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)', [record.requestId, record.actorId, record.method, record.route, record.status, record.objectId, record.durationMs]);
  }
  async requests(filters: RequestAuditFilters) {
    const { requestId, actorId, status, from, to, limit, offset } = filters;
    const items = await this.db.query('SELECT request_id,occurred_at,actor_id,method,route,status,object_id,duration_ms FROM request_audit WHERE ($1::uuid IS NULL OR request_id=$1::uuid) AND ($2::uuid IS NULL OR actor_id=$2::uuid) AND ($3::integer IS NULL OR status=$3::integer) AND ($4::timestamptz IS NULL OR occurred_at >= $4::timestamptz) AND ($5::timestamptz IS NULL OR occurred_at <= $5::timestamptz) ORDER BY occurred_at DESC,request_id DESC LIMIT $6 OFFSET $7', [requestId ?? null, actorId ?? null, status ?? null, from ?? null, to ?? null, limit, offset]);
    return { items };
  }
  async skills(filters: SkillAuditFilters) {
    const { actorId, skillId, requestId, from, to, limit, offset } = filters;
    const items = await this.db.query(`SELECT id,occurred_at,request_id,actor_id,operation,object_id,message_id,skill_id,result,error_code,input_tokens,output_tokens,total_tokens,duration_ms FROM skill_audit WHERE ($1::uuid IS NULL OR actor_id=$1::uuid) AND ($2::uuid IS NULL OR skill_id=$2::uuid) AND ($3::text IS NULL OR request_id=$3) AND ($4::timestamptz IS NULL OR occurred_at >= $4::timestamptz) AND ($5::timestamptz IS NULL OR occurred_at <= $5::timestamptz) ORDER BY occurred_at DESC,id DESC LIMIT $6 OFFSET $7`, [actorId ?? null, skillId ?? null, requestId ?? null, from ?? null, to ?? null, limit, offset]);
    return { items };
  }
}
