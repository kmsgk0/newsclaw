import { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { TaskHandler } from '../../runtime/tasks.js';
import { notFound, unavailable } from '../../errors.js';
import { NewsService } from '../news/service.js';
import type { NewsItem } from '../news/types.js';
import { readingMaterials, selectLabeledSources, sourceLabelsSchema } from '../news/materials.js';
import { EditorRepository, type Activity, type EditorProfile, type Memory } from './repository.js';
import { citationsFor, validateCitations } from './service.js';

export const personalDigestSchema = z.object({
  content: z.string().min(1), sourceLabels: sourceLabelsSchema.min(1),
  interestMatches: z.array(z.object({ sourceLabel: z.string(), preference: z.string().trim().min(1), quote: z.string().trim().min(1) }).strict()).default([]),
}).strict();
export const personalDigestInstructions = '按用户明确兴趣和相关记忆选择当日材料，用编辑风格写中文新闻导读。content 仅整理报道事实，不包含兴趣分析、建议或关注理由段落。准确保留消息来源、条件和不确定性，考虑、可能或条件性的事项不能写成已决定或已发生；只使用材料已披露的计划、日期、用途及效果，不从人事、职责或行业常识补写技术路线和确定因果。直接从具体新闻开始，保留必要背景，使用自然段及必要的小标题，事实用 [N1] 形式引用。sourceLabels 只填写实际选中材料的编号。兴趣关联仅通过 interestMatches 提供：sourceLabel 为已选材料编号，preference 逐字摘取 profile.interests 或 memories 中实际偏好的短语，quote 逐字摘取相应材料 content 中能体现关联的原文片段，不改写原文、不把推断放进 quote。关联说明由宿主生成。没有偏好或找不到直接原文依据时，interestMatches 返回空数组。';

export function renderPersonalDigest(value: z.infer<typeof personalDigestSchema>, preferences: string[], materials: { label: string; content: string }[]) {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  const literal = (text: string) => text.replace(/[\\`*_{}[\]<>]/g, '\\$&');
  const matches = value.interestMatches.map(match => {
    const material = materials.find(item => item.label === match.sourceLabel && value.sourceLabels.includes(item.label));
    if (!material || !normalize(material.content).includes(normalize(match.quote))
      || !preferences.some(preference => normalize(preference).includes(normalize(match.preference)))) {
      throw unavailable('日报兴趣关联缺少可核对依据');
    }
    return `- 关注“${literal(match.preference)}”：报道提到“${literal(normalize(match.quote))}” [${match.sourceLabel}]。`;
  });
  return value.content + (matches.length ? `\n\n### 关注关联\n\n${matches.join('\n')}` : '');
}
const journalSchema = z.object({ content: z.string().min(1), sourceLabels: sourceLabelsSchema, memories: z.array(z.object({ key: z.string().trim().min(1).max(100), content: z.string().trim().min(1).max(2000) }).strict()) }).strict();
interface DailySnapshot { profile: EditorProfile; memories: Memory[]; news: NewsItem[] }
interface JournalSnapshot { profile: EditorProfile; activities: Activity[]; news: NewsItem[]; questions: unknown[]; end: string }
export async function prepareJournalInput(ctx: AppContext, ownerId: string, date: string) {
  const repository = new EditorRepository(ctx.db), newsService = new NewsService(ctx);
  const profile = await repository.profile(ownerId); if (!profile) throw notFound();
  const end = (await repository.activityEnd(ownerId))?.end ?? '0';
  const activities = await repository.activities(ownerId, profile.activityCursor, end);
  const newsIds = new Set<string>(), messageIds: string[] = [];
  for (const activity of activities) {
    if (activity.newsId) newsIds.add(activity.newsId);
    for (const id of z.array(z.string().uuid()).catch([]).parse(activity.data.sourceIds)) newsIds.add(id);
    const messageId = z.string().uuid().safeParse(activity.data.messageId); if (messageId.success) messageIds.push(messageId.data);
  }
  const news: NewsItem[] = [];
  for (const id of newsIds) {
    try { news.push(await newsService.get(id)); } catch (error) {
      if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error;
    }
  }
  const snapshot: JournalSnapshot = { profile, activities, news, questions: await repository.questionActivities(ownerId, messageIds), end };
  return { date: z.iso.date().parse(date), activityEnd: end, snapshot, memories: await repository.memories(ownerId) };
}
export async function preparePersonalDailyInput(ctx: AppContext, ownerId: string, date: string) {
  const repository = new EditorRepository(ctx.db), newsService = new NewsService(ctx);
  const profile = await repository.profile(ownerId); if (!profile) throw notFound();
  const records = await repository.dailyNews(z.iso.date().parse(date));
  const snapshot: DailySnapshot = { profile, memories: await repository.memories(ownerId), news: await Promise.all(records.map(row => newsService.get(row.id))) };
  return { date, snapshot };
}
export function createEditorHandlers(ctx: AppContext): { daily: TaskHandler; journal: TaskHandler } {
  const repository = new EditorRepository(ctx.db);
  const daily: TaskHandler = async (task, run) => {
    if (!task.owner_id) throw notFound();
    const userId = task.owner_id, date = z.iso.date().parse(task.input.date);
    const snapshot = task.input.snapshot as DailySnapshot;
    if (!snapshot || snapshot.profile.userId !== userId) throw notFound();
    const { profile, memories, news } = snapshot;
    if (!news.length) return { commit: async () => ({ date, status: 'empty', message: '当日暂无可用新闻' }) };
    const candidates = citationsFor(news);
    const result = await ctx.model.json('personal-digest', {
      instructions: personalDigestInstructions,
      date, profile: { editorName:profile.name,style:profile.style,interests:profile.interests }, memories, materials: readingMaterials(news),
    }, personalDigestSchema, run.signal);
    const sources = selectLabeledSources(candidates,result.value.sourceLabels);
    if (!sources.length) throw unavailable('日报缺少可核对来源');
    validateCitations(result.value.content, sources);
    const rendered = renderPersonalDigest(result.value, [profile.interests, ...memories.map(memory => memory.content)], readingMaterials(news));
    const content = !profile.interests && !memories.length
      ? `本期采用当日精选。你可以在编辑设置中补充兴趣，获得更贴合关注方向的导读。\n\n${rendered}`
      : rendered;
    ctx.logger.info({ module: 'editor', taskId: task.id, actorId: userId, operation: 'personal-digest', result: 'generated', usage: result.usage }, 'editor.digest');
    return { commit: async tx => {
      const saved = await new EditorRepository(tx).saveDigest(userId, date, content, sources, task.created_at, task.id);
      return { digestId: saved!.id, date };
    } };
  };
  const journal: TaskHandler = async (task, run) => {
    if (!task.owner_id) throw notFound();
    const userId = task.owner_id, date = z.iso.date().parse(task.input.date), end = z.string().regex(/^\d+$/).parse(task.input.activityEnd);
    const current = await repository.profile(userId); if (!current) throw notFound();
    if (BigInt(current.activityCursor) >= BigInt(end)) return { commit: async () => ({ skipped: true, date }) };
    const snapshot = task.input.snapshot as JournalSnapshot;
    if (!snapshot || snapshot.profile.userId !== userId) throw notFound();
    if (!snapshot.activities.length) return { commit: async () => ({ skipped: true, date }) };
    const sources = citationsFor(snapshot.news);
    const result = await ctx.model.json('reading-journal', {
      instructions: `只整理本批新增活动，写一篇简短中文阅读手记。阅读、收藏和提问分别按实际活动记录描述，不把阅读或收藏称为已经讨论。${snapshot.questions.length ? '已讨论问题仅来自 questions 中实际问答。' : '本批没有对话，省略已讨论问题，只整理阅读内容和有材料依据的跟进线索。'} 使用自然段和必要的小标题。新闻事实引用给定 [N1] 材料，sourceLabels 只填写实际引用的材料编号，例如 N1。memories 只补充持续偏好；使用稳定主题 key，例如 response-style、interest-company，不能推翻编辑明确兴趣或已有手动偏好。没有证据的偏好不要推断。`,
      date, profile: { editorName:snapshot.profile.name,style:snapshot.profile.style,interests:snapshot.profile.interests }, memories: task.input.memories, activities: snapshot.activities, questions: snapshot.questions,
      materials: readingMaterials(snapshot.news),
    }, journalSchema, run.signal);
    const selectedSources = selectLabeledSources(sources,result.value.sourceLabels);
    validateCitations(result.value.content, selectedSources);
    ctx.logger.info({ module: 'editor', taskId: task.id, actorId: userId, operation: 'reading-journal', result: 'generated', usage: result.usage }, 'editor.journal');
    return { commit: async tx => new EditorRepository(tx).saveJournal(userId, date, snapshot.profile.activityCursor, end, snapshot.profile.memoryRevision, result.value.content, selectedSources, result.value.memories) };
  };
  return { daily, journal };
}
