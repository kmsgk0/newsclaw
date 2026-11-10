import { useState } from "react";
import { api, query, useOperation, useResource } from "../../api";
import { Prose } from "../../components/content";
import {
  Empty,
  ErrorState,
  Feedback,
  Field,
  formatDate,
  Loading,
  Modal,
  Pagination,
  SectionHeading,
} from "../../components/ui";
import type { EventSummary, NewsItem, Page } from "../../types";
import { type Note, type Topic } from "./types";

export function TopicForm({
  topic,
  onDone,
}: {
  topic?: Topic;
  onDone: (topic: Topic) => void;
}) {
  const operation = useOperation();
  const domains = useResource<{ domains: string[] }>('/sources');
  const [eventSearch, setEventSearch] = useState('');
  const [eventId, setEventId] = useState(topic?.filter.eventId ?? '');
  const events = useResource<Page<EventSummary>>(
    `/events?${query({ q: eventSearch, pageSize: 100 })}`,
  );
  const [scopeError, setScopeError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const keywords = String(fields.get('keywords') ?? '').trim();
        const domain = String(fields.get('domain') ?? '').trim();
        if (!keywords && !domain && !eventId) {
          setScopeError('请至少填写关键词、选择领域或关联事件。');
          return;
        }
        setScopeError('');
        void operation.run(
          () =>
            api<Topic>(
              topic ? `/topics/${topic.id}` : '/topics',
              topic ? 'PATCH' : 'POST',
              {
                name: fields.get('name'),
                description: fields.get('description'),
                filter: {
                  ...(keywords ? { keywords } : {}),
                  ...(domain ? { domain } : {}),
                  ...(eventId ? { eventId } : {}),
                },
              },
            ),
          onDone,
        );
      }}
    >
      <Field label="专题名称">
        <input
          name="name"
          required
          maxLength={100}
          defaultValue={topic?.name}
          placeholder="例如：开源模型与开发工具"
        />
      </Field>
      <Field label="专题说明">
        <textarea
          name="description"
          defaultValue={topic?.description}
          placeholder="记录你想持续关注的问题。"
        />
      </Field>
      <Field
        label="关注关键词"
        hint="匹配标题、正文与中文整理内容中的这个词或短语。"
      >
        <input
          name="keywords"
          defaultValue={topic?.filter.keywords}
          placeholder="例如：开源模型"
        />
      </Field>
      <Field label="关注领域">
        <select name="domain" defaultValue={topic?.filter.domain ?? ''}>
          <option value="">不限定领域</option>
          {domains.data?.domains.map((domain) => (
            <option value={domain} key={domain}>
              {domain}
            </option>
          ))}
        </select>
      </Field>
      <details className="advanced-options" open={!!topic?.filter.eventId}>
        <summary>关联事件</summary>
        <Field label="查找事件">
          <input
            value={eventSearch}
            onChange={(event) => setEventSearch(event.target.value)}
            placeholder="按事件名称搜索"
          />
        </Field>
        <Field label="选择事件">
          <select
            name="eventId"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          >
            <option value="">不限定事件</option>
            {eventId &&
              !events.data?.items.some((item) => item.id === eventId) && (
                <option value={eventId}>当前关联事件</option>
              )}
            {events.data?.items.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </Field>
        {events.error && (
          <ErrorState error={events.error} retry={events.reload} />
        )}
      </details>
      <p className="context-note">
        至少选择一种关注范围，填写多项时同时满足这些条件。
      </p>
      {scopeError && (
        <p className="field-error" role="alert">
          {scopeError}
        </p>
      )}
      <Feedback operation={operation} />
      <button className="button primary" disabled={operation.busy}>
        {topic ? '保存修改' : '创建专题'}
      </button>
    </form>
  );
}

export function Notes({
  topicId,
  items,
  reload,
}: {
  topicId: string;
  items: Note[];
  reload: () => void;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const operation = useOperation();
  return (
    <section className="panel">
      <SectionHeading title={editing ? '修改笔记' : '新增笔记'} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void operation.run(
            () =>
              api(
                editing
                  ? `/topics/${topicId}/notes/${editing.id}`
                  : `/topics/${topicId}/notes`,
                editing ? 'PATCH' : 'POST',
                { content: text },
              ),
            () => {
              setText('');
              setEditing(null);
              setPreview(false);
              reload();
            },
            '笔记已保存',
          );
        }}
      >
        <div className="note-mode">
          <button
            type="button"
            className={`button quiet small ${!preview ? 'selected' : ''}`}
            onClick={() => setPreview(false)}
          >
            编辑
          </button>
          <button
            type="button"
            className={`button quiet small ${preview ? 'selected' : ''}`}
            onClick={() => setPreview(true)}
          >
            预览
          </button>
        </div>
        {preview ? (
          <div className="note-preview">
            {text ? (
              <Prose>{text}</Prose>
            ) : (
              <p className="muted">输入内容后预览。</p>
            )}
          </div>
        ) : (
          <Field
            label={editing ? '修改笔记内容' : '新增笔记'}
            hint="支持 Markdown 标题、列表、表格、引用和代码。"
          >
            <textarea
              name="content"
              value={text}
              rows={6}
              onChange={(event) => setText(event.target.value)}
              required
              maxLength={20000}
              placeholder="记录自己的判断和待跟进的问题。"
            />
          </Field>
        )}
        <Feedback operation={operation} />
        <div className="form-actions">
          <button
            className="button primary small"
            disabled={operation.busy || !text.trim()}
          >
            保存笔记
          </button>
          {editing && (
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setEditing(null);
                setText('');
                setPreview(false);
              }}
            >
              取消修改
            </button>
          )}
        </div>
      </form>
      <div className="topic-notes">
        {items.map((item) => (
          <article key={item.id}>
            <header>
              <small className="muted">
                {formatDate(item.updatedAt ?? item.createdAt, true)}
              </small>
              <div className="item-actions">
                <button
                  className="button quiet small"
                  onClick={() => {
                    setEditing(item);
                    setText(item.content);
                    setPreview(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  编辑笔记
                </button>
                <button
                  className="button quiet small"
                  onClick={() => setDeleting(item)}
                >
                  删除笔记
                </button>
              </div>
            </header>
            <Prose>{item.content}</Prose>
          </article>
        ))}
      </div>
      <Modal
        open={!!deleting}
        title="删除笔记？"
        onClose={() => setDeleting(null)}
      >
        <p>只删除这条笔记，专题中的报道和其他成果保留。</p>
        <Feedback operation={operation} />
        <div className="form-actions">
          <button
            className="button danger"
            disabled={operation.busy}
            onClick={() =>
              operation.run(
                () => api(`/topics/${topicId}/notes/${deleting!.id}`, 'DELETE'),
                () => {
                  setDeleting(null);
                  reload();
                },
              )
            }
          >
            确认删除笔记
          </button>
          <button
            className="button secondary"
            onClick={() => setDeleting(null)}
          >
            取消
          </button>
        </div>
      </Modal>
    </section>
  );
}

export function AddNews({ topicId, onDone }: { topicId: string; onDone: () => void }) {
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const resource = useResource<Page<NewsItem>>(
    `/news?${query({ q: submitted, page })}`,
  );
  const operation = useOperation();
  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(term);
          setPage(1);
          setSelected('');
        }}
      >
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="搜索新闻标题或内容"
          aria-label="查找可加入的报道"
        />
        <button className="button secondary small">搜索</button>
      </form>
      {resource.loading && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      <div className="news-picker">
        {resource.data?.items.map((news) => (
          <label key={news.id}>
            <input
              type="radio"
              name="news-selection"
              checked={selected === news.id}
              onChange={() => setSelected(news.id)}
            />
            <span>
              {news.title}
              <small>{news.sourceName}</small>
            </span>
          </label>
        ))}
      </div>
      {resource.data?.items.length === 0 && <Empty title="没有匹配的报道" />}
      {resource.data && (
        <Pagination
          page={page}
          pageSize={resource.data.pageSize}
          total={resource.data.total}
          onChange={setPage}
        />
      )}
      <Feedback operation={operation} />
      <button
        className="button primary"
        disabled={!selected || operation.busy}
        onClick={() =>
          operation.run(
            () => api(`/topics/${topicId}/news`, 'POST', { newsId: selected }),
            onDone,
          )
        }
      >
        加入专题
      </button>
    </>
  );
}
