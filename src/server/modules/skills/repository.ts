import type { Db } from '../../db.js';

export type SkillKind = 'explain' | 'comparison' | 'brief' | 'mindmap' | 'bilingual';
export interface PublicSkill {
  id: string; slug: string | null; ownerId: string | null; kind: SkillKind; name: string; description: string;
  instructions: string; outputFormat: string; example: string; status: 'draft' | 'published' | 'unlisted';
}
export interface PersonalSkill {
  id: string; templateId: string; kind: SkillKind; name: string; instructions: string; outputFormat: string;
  enabled: boolean; publication: { id: string; status: string; description: string; example: string } | null;
}
const publicColumns = `id,slug,owner_id AS "ownerId",kind,name,description,instructions,output_format AS "outputFormat",example,status`;
const personalColumns = `u.id,u.template_id AS "templateId",u.kind,u.name,u.instructions,u.output_format AS "outputFormat",u.enabled,
  (SELECT json_build_object('id',s.id,'status',s.status,'description',s.description,'example',s.example) FROM skills s WHERE s.personal_source_id=u.id) AS publication`;
export class SkillsRepository {
  constructor(private db: Db) {}
  list() { return this.db.query<PublicSkill>(`SELECT ${publicColumns} FROM skills WHERE status='published' ORDER BY created_at,id`); }
  all() { return this.db.query<PublicSkill>(`SELECT ${publicColumns} FROM skills ORDER BY updated_at DESC,id`); }
  public(id: string) { return this.db.one<PublicSkill>(`SELECT ${publicColumns} FROM skills WHERE id=$1`, [id]); }
  mine(userId: string) { return this.db.query<PersonalSkill>(`SELECT ${personalColumns} FROM user_skills u WHERE user_id=$1 ORDER BY u.created_at,u.id`, [userId]); }
  personal(userId: string, id: string) { return this.db.one<PersonalSkill>(`SELECT ${personalColumns} FROM user_skills u WHERE u.id=$1 AND u.user_id=$2`, [id, userId]); }
  async install(userId: string, skill: PublicSkill) {
    await this.db.query(`INSERT INTO user_skills(user_id,template_id,kind,name,instructions,output_format) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,template_id) DO NOTHING`, [userId, skill.id, skill.kind, skill.name, skill.instructions, skill.outputFormat]);
    return this.db.one<PersonalSkill>(`SELECT ${personalColumns} FROM user_skills u WHERE u.user_id=$1 AND u.template_id=$2`, [userId, skill.id]);
  }
  async updatePersonal(userId: string, id: string, update: Partial<Pick<PersonalSkill, 'name' | 'instructions' | 'outputFormat' | 'enabled'>>) {
    const result = await this.db.one(`UPDATE user_skills SET name=COALESCE($3,name),instructions=COALESCE($4,instructions),output_format=COALESCE($5,output_format),enabled=COALESCE($6,enabled),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id`, [id, userId, update.name, update.instructions, update.outputFormat, update.enabled]);
    return result ? this.personal(userId, id) : undefined;
  }
  async publish(userId: string, skill: PersonalSkill, description: string, example: string, status: string) {
    const row = await this.db.one<{ id: string }>(`INSERT INTO skills(owner_id,personal_source_id,kind,name,description,instructions,output_format,example,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(personal_source_id) WHERE personal_source_id IS NOT NULL DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,instructions=EXCLUDED.instructions,output_format=EXCLUDED.output_format,example=EXCLUDED.example,status=EXCLUDED.status,updated_at=now() RETURNING id`, [userId, skill.id, skill.kind, skill.name, description, skill.instructions, skill.outputFormat, example, status]);
    return this.public(row!.id);
  }
  async updatePublic(id: string, actorId: string, update: Partial<Pick<PublicSkill, 'name' | 'description' | 'instructions' | 'outputFormat' | 'example' | 'status'>>) {
    return this.db.tx(async tx => {
      await tx.query(`UPDATE skills SET name=COALESCE($2,name),description=COALESCE($3,description),instructions=COALESCE($4,instructions),output_format=COALESCE($5,output_format),example=COALESCE($6,example),status=COALESCE($7,status),updated_at=now() WHERE id=$1`, [id, update.name, update.description, update.instructions, update.outputFormat, update.example, update.status]);
      await tx.query(`INSERT INTO management_actions(actor_id,action,object_id,result) VALUES($1,'skill.update',$2,'succeeded')`, [actorId, id]);
      return new SkillsRepository(tx).public(id);
    });
  }
}
