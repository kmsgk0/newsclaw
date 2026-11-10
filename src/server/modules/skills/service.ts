import type { Actor, AppContext } from '../../context.js';
import { forbidden, invalid, notFound } from '../../errors.js';
import { SkillsRepository, type PersonalSkill, type PublicSkill } from './repository.js';

export class SkillsService {
  readonly repository: SkillsRepository;
  constructor(ctx: Pick<AppContext, 'db'>) { this.repository = new SkillsRepository(ctx.db); }
  list() { return this.repository.list(); }
  mine(actor: Actor) { return this.repository.mine(actor.id); }
  async install(actor: Actor, id: string) {
    const skill = await this.repository.public(id);
    if (!skill || skill.status !== 'published') throw notFound();
    return this.repository.install(actor.id, skill);
  }
  async update(actor: Actor, id: string, update: Partial<Pick<PersonalSkill, 'name' | 'instructions' | 'outputFormat' | 'enabled'>>) {
    const skill = await this.repository.updatePersonal(actor.id, id, update);
    if (!skill) throw notFound();
    return skill;
  }
  async choose(actor: Actor, question: string, explicitId?: string) {
    if (explicitId) {
      const skill = await this.repository.personal(actor.id, explicitId);
      if (!skill) throw notFound();
      if (!skill.enabled) throw invalid('所选技能已停用，请先启用或取消选择');
      return skill;
    }
    const kind = /导图|mind.?map/i.test(question) ? 'mindmap' : /对比|比较|compare/i.test(question) ? 'comparison' : /双语|英文|翻译|bilingual/i.test(question) ? 'bilingual' : /简报|brief/i.test(question) ? 'brief' : /通俗|解释|解读|explain/i.test(question) ? 'explain' : null;
    if (!kind) return null;
    return (await this.mine(actor)).find(skill => skill.enabled && skill.kind === kind) ?? null;
  }
  async publish(actor: Actor, id: string, data: { description: string; example: string; status: 'draft' | 'published' }) {
    const skill = await this.repository.personal(actor.id, id);
    if (!skill) throw notFound();
    return this.repository.publish(actor.id, skill, data.description, data.example, data.status);
  }
  async updatePublic(actor: Actor, id: string, update: Partial<Pick<PublicSkill, 'name' | 'description' | 'instructions' | 'outputFormat' | 'example' | 'status'>>) {
    const skill = await this.repository.public(id);
    if (!skill) throw notFound();
    if (skill.ownerId !== actor.id && actor.role !== 'admin') throw forbidden();
    return this.repository.updatePublic(id, actor.id, update);
  }
}
