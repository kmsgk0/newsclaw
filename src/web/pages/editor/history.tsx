import { FileText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, operationId, query, useOperation, useResource } from "../../api";
import { Prose, Sources } from "../../components/content";
import { TaskWatch } from "../../components/task-status";
import {
  Empty,
  ErrorState,
  Feedback,
  formatDate,
  Loading,
  today,
} from "../../components/ui";
import type { DigestHistory, Task } from "../../types";


export function ReadingHistory({ kind }: { kind: 'daily' | 'journals' }) {
  const [date, setDate] = useState('');
  const resource = useResource<DigestHistory>(
    `/editor/${kind === 'daily' ? 'digests' : 'journals'}?${query({ date })}`,
  );
  const [task, setTask] = useState<Task | null>(null);
  const operation = useOperation();
  const label = kind === 'daily' ? '个人日报' : '编辑手记';
  const activeTask = task ?? resource.data?.latestTask;
  return (
    <>
      <div className="toolbar">
        <label className="muted" htmlFor="history-date">
          查看日期
        </label>
        <select
          id="history-date"
          className="date-input"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setTask(null);
          }}
        >
          <option value="">全部日期</option>
          {resource.data?.availableDates?.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button
          className="button primary"
          disabled={
            operation.busy ||
            activeTask?.status === 'running' ||
            activeTask?.status === 'pending'
          }
          onClick={() =>
            operation.run(
              () =>
                api<Task>(
                  `/editor/${kind === 'daily' ? 'digests' : 'journals'}/generate`,
                  'POST',
                  { date: today(), operationId: operationId() },
                ),
              setTask,
            )
          }
        >
          <RefreshCw size={15} />
          {kind === 'daily' ? '生成今天的日报' : '整理阅读活动'}
        </button>
      </div>
      <Feedback operation={operation} />
      {activeTask && (
        <TaskWatch task={activeTask} onComplete={resource.reload} />
      )}
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      {resource.data?.items.length === 0 && (
        <section className="panel">
          <Empty title={`暂无${label}`}>
            {kind === 'daily'
              ? '当天有可读新闻时，可以按你的兴趣生成日报。'
              : '阅读、收藏或提问后，编辑会整理新增活动。'}
          </Empty>
          {kind === 'daily' && (
            <Link className="text-link" to="/editor?view=settings">
              设置关注方向
            </Link>
          )}
        </section>
      )}
      {resource.data?.items.map((item) => (
        <article className="panel reading-history" key={item.id ?? item.date}>
          <div className="section-heading">
            <div>
              <p className="content-meta">
                {label} · {item.date}
              </p>
              <h2>{item.title ?? `${formatDate(item.date)}${label}`}</h2>
            </div>
            <FileText size={21} />
          </div>
          <Prose sources={item.sources}>{item.content}</Prose>
          {item.sources && <Sources sources={item.sources} />}
          <small className="muted">
            生成于 {formatDate(item.generatedAt, true)}
          </small>
        </article>
      ))}
    </>
  );
}
