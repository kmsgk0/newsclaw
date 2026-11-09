import { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { TaskHandler } from '../../runtime/tasks.js';
import { notFound, unavailable } from '../../errors.js';
import { NewsService } from '../news/service.js';
import type { NewsItem } from '../news/types.js';
import { readingMaterials, selectLabeledSources, sourceLabelsSchema } from '../news/materials.js';
import { EditorRepository, type Activity, type EditorProfile, type Memory } from './repository.js';
import { citationsFor, validateCitations } from './service.js';

const dailySchema = z.object({ content: z.string().min(1), sourceLabels: sourceLabelsSchema.min(1) }).strict();
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
      instructions: '按用户明确兴趣和相关记忆选择当日材料，使用编辑风格写中文导读，说明新闻与兴趣的关系。直接从具体新闻开始，不加问候或称呼。兴趣为空时采用当日精选，并提示可以补充兴趣。保留必要背景，所有新闻事实用提供的 [N1] 形式引用，sourceLabels 只填写实际选中材料的编号，例如 N1。',
      date, profile: { editorName:profile.name,style:profile.style,interests:profile.interests }, memories, materials: readingMaterials(news),
    }, dailySchema, run.signal);
    const sources = selectLabeledSources(candidates,result.value.sourceLabels);
    if (!sources.length) throw unavailable('日报缺少可核对来源');
    validateCitations(result.value.content, sources);
    const content = !profile.interests && !memories.length
      ? `本期采用当日精选。你可以在编辑设置中补充兴趣，获得更贴合关注方向的导读。\n\n${result.value.content}`
      : result.value.content;
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
