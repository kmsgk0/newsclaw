import {
  ArrowRight,
  Bookmark,
  ChevronLeft,
  FolderPlus,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { api, operationId, useOperation, useResource } from "../api";
import { useAuth } from "../auth";
import { ReadingEditor } from "../components/chat";
import { Prose, SourceLink } from "../components/content";
import { contentUpdateState } from "../components/news";
import { TaskWatch } from "../components/task-status";
import { TopicDestination } from "../components/topic-destination";
import {
  Empty,
  ErrorState,
  Feedback,
  formatDate,
  Loading,
  Modal,
  Tabs,
} from "../components/ui";
import type { NewsItem, Task } from "../types";

export function NewsPage() {
  const { id } = useParams();
  const auth = useAuth();
  const location = useLocation();
  const resource = useResource<NewsItem>(auth.ready ? `/news/${id}` : null);
  const [mode, setMode] = useState('original');
  const [showEditor, setShowEditor] = useState(false);
  const [adding, setAdding] = useState(false);
  const favorite = useOperation();
  const reprocess = useOperation();
  const [task, setTask] = useState<Task | null>(null);
  const [readError, setReadError] = useState<Error | null>(null);
  useEffect(() => {
    if (auth.user && id)
      api(`/news/${id}/read`, 'POST', {}).catch(setReadError);
  }, [id, auth.user]);
  useEffect(() => {
    setMode('original');
    setShowEditor(false);
  }, [id]);
  if (!auth.ready || (resource.loading && !resource.data)) return <Loading />;
  if (!resource.data)
    return resource.error ? (
      <ErrorState error={resource.error} retry={resource.reload} />
    ) : null;
  const news = resource.data;
  const state = location.state as { from?: string; fromLabel?: string } | null;
  const back =
    state?.from?.startsWith('/') && !state.from.startsWith('//')
      ? state.from
      : '/';
  return (
    <>
      <Link className="text-link back-link" to={back}>
        <ChevronLeft size={14} />
        {state?.fromLabel ?? '返回资讯中心'}
      </Link>
      <div className={`read-layout ${showEditor ? 'with-editor' : ''}`}>
        <article className="panel article">
          <div className="news-meta">
            <span className="tag">{news.domain || '资讯'}</span>
            <span>{news.sourceName}</span>
            {news.contentScope === 'summary' && (
              <span className="tag gold">
                {news.processing?.material === 'title-only'
                  ? '来源仅提供标题'
                  : '来源仅提供摘要'}
              </span>
            )}
          </div>
          <h1>{news.title}</h1>
          <div className="article-meta">
            <time>
              {news.publishedAt
                ? formatDate(news.publishedAt, true)
                : '未提供发布时间'}
            </time>
            <SourceLink href={news.url}>查看原文</SourceLink>
            {news.eventId && (
              <Link className="text-link" to={`/events/${news.eventId}`}>
                查看事件
                <ArrowRight size={13} />
              </Link>
            )}
          </div>
          <div className="article-actions">
            <button
              className="button primary"
              onClick={() => setShowEditor(!showEditor)}
            >
              <MessageCircle size={16} />
              {showEditor ? '收起编辑' : '询问编辑'}
            </button>
            <button
              className="button secondary"
              onClick={() => setShowEditor(true)}
            >
              <Sparkles size={15} />
              使用技能
            </button>
            {auth.user ? (
              <>
                <button
                  className="button secondary"
                  disabled={favorite.busy}
                  onClick={() =>
                    favorite.run(
                      () =>
                        api<{ favorite: boolean }>(
                          `/news/${id}/favorite`,
                          news.favorite ? 'DELETE' : 'POST',
                        ),
                      (value) =>
                        resource.setData({ ...news, favorite: value.favorite }),
                    )
                  }
                >
                  <Bookmark
                    size={15}
                    fill={news.favorite ? 'currentColor' : 'none'}
                  />
                  {news.favorite ? '已收藏' : '收藏'}
                </button>
                <button
                  className="button secondary"
                  onClick={() => setAdding(true)}
                >
                  <FolderPlus size={15} />
                  加入专题
                </button>
              </>
            ) : (
              <Link
                className="button secondary"
                to={`/login?returnTo=${encodeURIComponent(`/news/${id}`)}`}
              >
                登录后收藏
              </Link>
            )}
          </div>
          <Feedback operation={favorite} />
          {readError && (
            <ErrorState
              error={readError}
              retry={() => {
                setReadError(null);
                api(`/news/${id}/read`, 'POST', {}).catch(setReadError);
              }}
            />
          )}
          {news.summary && news.processing?.material !== 'title-only' && (
            <section className="article-summary">
              <h2>
                摘要 <span>AI 整理</span>
              </h2>
              <Prose>{news.summary}</Prose>
            </section>
          )}
          {news.processing?.stale === true && (
            <p className="inline-notice">
              {
                {
                  failed: '本次内容整理未完成，以下保留上次成功生成的结果。',
                  active: '正在更新内容，以下保留上次成功生成的结果。',
                  retained: '以下保留上次成功生成的内容。',
                }[contentUpdateState(news)]
              }
            </p>
          )}
          <Tabs
            value={mode}
            options={[
              { value: 'original', label: '来源内容' },
              { value: 'translation', label: '中文译文' },
            ]}
            onChange={setMode}
          />
          {mode === 'original' ? (
            news.content ? (
              <Prose>{news.content}</Prose>
            ) : (
              <Empty
                title="暂未取得正文"
                action={<SourceLink href={news.url}>前往来源网站</SourceLink>}
              >
                目前只取得标题。
              </Empty>
            )
          ) : news.translation ? (
            <>
              <p className="content-meta translation-label">
                AI 翻译 · 可切换来源内容对照阅读
              </p>
              <Prose>{news.translation}</Prose>
            </>
          ) : news.language === 'zh' ? (
            <>
              <p className="content-meta translation-label">来源内容已是中文</p>
              <Prose>{news.content}</Prose>
            </>
          ) : (
            <Empty
              title={
                news.processing?.translation === 'failed'
                  ? '译文处理未完成'
                  : '译文正在准备'
              }
              action={
                <button
                  className="button secondary small"
                  onClick={() => setMode('original')}
                >
                  阅读来源内容
                </button>
              }
            >
              {news.processing?.translation === 'failed'
                ? '原文仍然可读，可以稍后刷新查看译文。'
                : '翻译完成后会显示在这里。'}
            </Empty>
          )}
          {auth.user?.role === 'admin' && (
            <details className="processing-details">
              <summary>内容处理状态</summary>
              <div className="processing-steps">
                {[
                  ['source', '来源正文'],
                  ['summary', '摘要'],
                  ['translation', '翻译'],
                  ['index', '索引'],
                ].map(([key, label]) => (
                  <span key={key}>
                    {label}：
                    {{
                      pending: '等待',
                      running: '进行中',
                      succeeded: '完成',
                      failed: '失败',
                      not_needed: '无需处理',
                    }[String(news.processing?.[key])] ?? '未处理'}
                  </span>
                ))}
              </div>
              {typeof news.processing?.error === 'string' && (
                <p className="field-error">{news.processing.error}</p>
              )}
              <Feedback operation={reprocess} />
              <button
                className="button secondary small"
                disabled={reprocess.busy}
                onClick={() =>
                  reprocess.run(
                    () =>
                      api<Task>(`/admin/news/${id}/reprocess`, 'POST', {
                        operationId: operationId(),
                      }),
                    setTask,
                  )
                }
              >
                重新处理报道
              </button>
              {task && <TaskWatch task={task} onComplete={resource.reload} />}
            </details>
          )}
        </article>
        {showEditor && (
          <ReadingEditor
            context={{ kind: 'news', id }}
            onClose={() => setShowEditor(false)}
          />
        )}
      </div>
      <Modal open={adding} title="加入专题" onClose={() => setAdding(false)}>
        {adding && (
          <TopicDestination
            save={(topicId) =>
              api(`/topics/${topicId}/news`, 'POST', { newsId: id })
            }
          />
        )}
      </Modal>
    </>
  );
}
