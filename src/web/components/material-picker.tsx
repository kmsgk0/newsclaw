import { useState } from "react";
import { query, useResource } from "../api";
import type {
  EventSummary,
  MaterialContext,
  NewsItem,
  Page,
  TopicSummary,
} from "../types";
import { Empty, ErrorState, Field, Loading, Pagination } from "./ui";

export const materialNames = {
  news: '新闻',
  event: '事件',
  favorites: '我的收藏',
  topic: '专题',
};

export function MaterialPicker({
  onSelect,
}: {
  onSelect: (context?: MaterialContext) => void;
}) {
  const [kind, setKind] = useState<MaterialContext['kind']>('news');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const news = useResource<Page<NewsItem>>(
    kind === 'news' ? `/news?${query({ q: search, page })}` : null,
  );
  const events = useResource<Page<EventSummary>>(
    kind === 'event' ? `/events?${query({ q: search, page })}` : null,
  );
  const topics = useResource<{ items: TopicSummary[] }>(
    kind === 'topic' ? '/topics' : null,
  );
  const resource = kind === 'news' ? news : kind === 'event' ? events : topics;
  const items =
    kind === 'news'
      ? news.data?.items.map((n) => ({
          id: n.id,
          title: n.title,
          detail: n.sourceName,
        }))
      : kind === 'event'
        ? events.data?.items.map((e) => ({
            id: e.id,
            title: e.title,
            detail: `${e.reportCount} 篇报道 · ${e.sourceCount} 个来源`,
          }))
        : topics.data?.items
            .filter((t) => !search || t.name.includes(search))
            .map((t) => ({
              id: t.id,
              title: t.name,
              detail: `${t.newsCount} 篇报道`,
            }));
  return (
    <>
      <p className="muted">选择后开始一段新会话，原会话会继续保留。</p>
      <Field label="材料范围">
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as MaterialContext['kind']);
            setSearch('');
            setTerm('');
            setPage(1);
          }}
        >
          {Object.entries(materialNames).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {kind === 'favorites' ? (
        <div className="empty-state">
          <p>使用你收藏的所有报道作为本次材料。</p>
          <button className="button primary" onClick={() => onSelect({ kind })}>
            选择我的收藏
          </button>
        </div>
      ) : (
        <>
          <form
            className="toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(term);
              setPage(1);
            }}
          >
            <input
              aria-label="查找阅读材料"
              placeholder={`搜索${materialNames[kind]}`}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
            <button className="button secondary">搜索</button>
          </form>
          {resource.loading && <Loading />}
          {resource.error && (
            <ErrorState error={resource.error} retry={resource.reload} />
          )}
          <div className="material-results">
            {items?.map((item) => (
              <button
                key={item.id}
                className="material-result"
                onClick={() => onSelect({ kind, id: item.id })}
              >
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
          </div>
          {items?.length === 0 && (
            <Empty title="没有匹配的材料">
              请调整关键词，或选择其他材料范围。
            </Empty>
          )}
          {kind !== 'topic' && (kind === 'news' ? news.data : events.data) && (
            <Pagination
              page={page}
              pageSize={(kind === 'news' ? news.data : events.data)!.pageSize}
              total={(kind === 'news' ? news.data : events.data)!.total}
              onChange={setPage}
            />
          )}
        </>
      )}
      <button className="button quiet" onClick={() => onSelect(undefined)}>
        不固定材料，跨新闻提问
      </button>
    </>
  );
}

export function MaterialName({
  context,
}: {
  context?: MaterialContext | null;
}) {
  const resource = useResource<{ title?: string; name?: string }>(
    context?.id
      ? `/${context.kind === 'news' ? 'news' : context.kind === 'event' ? 'events' : 'topics'}/${context.id}`
      : null,
  );
  return (
    <span>
      {context
        ? `${materialNames[context.kind]}${context.id ? `：${resource.data?.title ?? resource.data?.name ?? '正在读取名称'}` : ''}`
        : '跨新闻提问'}
    </span>
  );
}
