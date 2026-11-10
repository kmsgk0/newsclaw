import { useState } from "react";
import { Link } from "react-router";
import { api, useOperation, useResource } from "../api";
import type { TopicSummary } from "../types";
import { ErrorState, Feedback, Field, Loading } from "./ui";

export function TopicDestination({
  defaultId = '',
  save,
  onSaved,
  view = 'news',
}: {
  defaultId?: string;
  save: (id: string) => Promise<unknown>;
  onSaved?: () => void;
  view?: string;
}) {
  const topics = useResource<{ items: TopicSummary[] }>('/topics');
  const [id, setId] = useState(defaultId);
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState('');
  const operation = useOperation();
  return (
    <>
      {topics.loading && <Loading />}
      {topics.error && (
        <ErrorState error={topics.error} retry={topics.reload} />
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void operation.run(
            async () => {
              const destination = creating
                ? (
                    await api<TopicSummary>('/topics', 'POST', {
                      name: data.get('name'),
                      description: '',
                      filter: { keywords: data.get('keywords') },
                    })
                  ).id
                : id;
              await save(destination);
              return destination;
            },
            (destination) => {
              setSaved(destination);
              onSaved?.();
            },
            '已保存到专题',
          );
        }}
      >
        {creating ? (
          <>
            <Field label="专题名称">
              <input name="name" required maxLength={100} />
            </Field>
            <Field
              label="关注关键词"
              hint="后续包含这个词或短语的报道会自动汇集。"
            >
              <input name="keywords" required />
            </Field>
          </>
        ) : (
          <Field label="选择专题">
            <select
              value={id}
              required
              onChange={(event) => {
                setId(event.target.value);
                setSaved('');
              }}
            >
              <option value="">请选择专题</option>
              {topics.data?.items.map((topic) => (
                <option value={topic.id} key={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setCreating(!creating);
            setSaved('');
          }}
        >
          {creating ? '选择已有专题' : '新建专题并保存'}
        </button>
        <Feedback operation={operation} />
        <div className="form-actions">
          <button
            className="button primary"
            disabled={operation.busy || (!creating && !id)}
          >
            保存成果
          </button>
          {saved && (
            <Link
              className="button secondary"
              to={`/topics/${saved}?view=${view}`}
            >
              查看已保存内容
            </Link>
          )}
        </div>
      </form>
    </>
  );
}
