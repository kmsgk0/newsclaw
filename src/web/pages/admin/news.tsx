import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, operationId, query, useOperation, useResource } from "../../api";
import { TaskWatch } from "../../components/task-status";
import {
  Empty,
  ErrorState,
  Feedback,
  Field,
  Loading,
  Modal,
  Pagination,
  today,
} from "../../components/ui";
import type { EventSummary, NewsItem, Page, Task } from "../../types";


export function NewsManagement() {
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const news = useResource<Page<NewsItem>>(
    `/admin/news?${query({ page, q: search })}`,
  );
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [eventId, setEventId] = useState('');
  const [eventTerm, setEventTerm] = useState('');
  const events = useResource<Page<EventSummary>>(
    editing ? `/events?${query({ q: eventTerm, pageSize: 100 })}` : null,
  );
  const [date, setDate] = useState(today());
  const operation = useOperation();
  const digest = useOperation();
  const [task, setTask] = useState<Task | null>(null);
  const [articleTask, setArticleTask] = useState<Task | null>(null);
  return (
    <>
      <section className="panel admin-digest">
        <h2>全站日报</h2>
        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            void digest.run(
              () =>
                api<Task>('/admin/digests', 'POST', {
                  date,
                  operationId: operationId(),
                }),
              setTask,
            );
          }}
        >
          <input
            type="date"
            className="date-input"
            required
            aria-label="全站日报日期"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <button className="button secondary" disabled={digest.busy}>
            <RefreshCw size={14} />
            生成日报
          </button>
          <Link className="text-link" to={`/?view=daily&date=${date}`}>
            查看该日日报
          </Link>
        </form>
        <Feedback operation={digest} />
        {task && <TaskWatch task={task} />}
      </section>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(term);
          setPage(1);
        }}
      >
        <input
          value={term}
          aria-label="搜索待管理新闻"
          placeholder="搜索新闻标题或内容"
          onChange={(event) => setTerm(event.target.value)}
        />
        <button className="button secondary">搜索</button>
      </form>
      <Feedback operation={operation} />
      {articleTask && <TaskWatch task={articleTask} onComplete={news.reload} />}
      {news.loading && !news.data && <Loading />}
      {news.error && <ErrorState error={news.error} retry={news.reload} />}
      {news.data && (
        <>
          <section className="panel table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>报道</th>
                  <th>来源与状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {news.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/news/${item.id}`}>{item.title}</Link>
                    </td>
                    <td>
                      {item.sourceName}
                      <small>
                        {Object.entries(item.processing ?? {})
                          .filter(
                            ([key, value]) =>
                              [
                                'source',
                                'summary',
                                'translation',
                                'index',
                              ].includes(key) && value === 'failed',
                          )
                          .map(
                            ([key]) =>
                              ({
                                source: '正文失败',
                                summary: '摘要失败',
                                translation: '翻译失败',
                                index: '索引失败',
                              })[key],
                          )
                          .join(' · ') || '可读取'}
                      </small>
                      {typeof item.processing?.error === 'string' && (
                        <small className="source-error">
                          {item.processing.error}
                        </small>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="button secondary small"
                          onClick={() => {
                            setEditing(item);
                            setEventId(item.eventId ?? '');
                            setEventTerm('');
                          }}
                        >
                          {item.eventId ? '修正事件' : '关联事件'}
                        </button>
                        <button
                          className="button secondary small"
                          disabled={operation.busy}
                          onClick={() =>
                            operation.run(
                              () =>
                                api<Task>(
                                  `/admin/news/${item.id}/reprocess`,
                                  'POST',
                                  { operationId: operationId() },
                                ),
                              setArticleTask,
                            )
                          }
                        >
                          重新处理
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!news.data.items.length && <Empty title="没有匹配的报道" />}
          </section>
          <Pagination
            page={page}
            pageSize={news.data.pageSize}
            total={news.data.total}
            onChange={setPage}
          />
        </>
      )}
      <Modal
        open={!!editing}
        title="修正事件归属"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void operation.run(
                () =>
                  api(`/admin/news/${editing.id}/event`, 'PATCH', {
                    eventId: eventId || null,
                  }),
                () => {
                  setEditing(null);
                  news.reload();
                },
              );
            }}
          >
            <p>{editing.title}</p>
            <Field label="查找事件">
              <input
                value={eventTerm}
                onChange={(event) => setEventTerm(event.target.value)}
                placeholder="按名称搜索全部事件"
              />
            </Field>
            <Field label="目标事件" hint="选择“不关联事件”可以解除归属。">
              <select
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
              >
                <option value="">不关联事件</option>
                {eventId &&
                  !events.data?.items.some((item) => item.id === eventId) && (
                    <option value={eventId}>当前关联事件</option>
                  )}
                {events.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}（{item.reportCount} 篇）
                  </option>
                ))}
              </select>
            </Field>
            {events.error && (
              <ErrorState error={events.error} retry={events.reload} />
            )}
            <Feedback operation={operation} />
            <button className="button primary" disabled={operation.busy}>
              保存归属
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
