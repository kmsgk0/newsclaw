import { Edit3, Play, Plus } from "lucide-react";
import { useState } from "react";
import { api, operationId, useOperation, useResource } from "../../api";
import { TaskWatch } from "../../components/task-status";
import {
  Empty,
  ErrorState,
  Feedback,
  Field,
  formatDate,
  Loading,
  Modal,
} from "../../components/ui";
import type { Source, Task } from "../../types";


export function SourceManagement() {
  const resource = useResource<{ items: Source[] }>('/admin/sources');
  const [editing, setEditing] = useState<Source | null>(null);
  const [open, setOpen] = useState(false);
  const operation = useOperation();
  const [task, setTask] = useState<Task | null>(null);
  return (
    <>
      <div className="toolbar">
        <span className="muted">支持 RSS、JSON 接口和网页列表</span>
        <span className="spacer" />
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={15} />
          新增信源
        </button>
      </div>
      <Feedback operation={operation} />
      {task && <TaskWatch task={task} onComplete={resource.reload} />}
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      {resource.data && (
        <section className="panel table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>信源</th>
                <th>类型与状态</th>
                <th>最近采集</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.name}</strong>
                    <small>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.url}
                      </a>
                    </small>
                    {source.lastError && (
                      <small className="source-error">{source.lastError}</small>
                    )}
                  </td>
                  <td>
                    <span className="tag">
                      {
                        { rss: 'RSS / Atom', json: 'JSON', web: '网页' }[
                          source.kind
                        ]
                      }
                    </span>
                    <small>{source.enabled ? '已启用' : '已停用'}</small>
                  </td>
                  <td>
                    {source.lastCollectedAt
                      ? formatDate(source.lastCollectedAt, true)
                      : '尚未采集'}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="button secondary small"
                        onClick={() => {
                          setEditing(source);
                          setOpen(true);
                        }}
                      >
                        <Edit3 size={13} />
                        编辑
                      </button>
                      <button
                        className="button secondary small"
                        disabled={operation.busy}
                        onClick={() =>
                          operation.run(
                            () =>
                              api(`/admin/sources/${source.id}`, 'PATCH', {
                                enabled: !source.enabled,
                              }),
                            resource.reload,
                          )
                        }
                      >
                        {source.enabled ? '停用' : '启用'}
                      </button>
                      <button
                        className="button primary small"
                        disabled={!source.enabled || operation.busy}
                        onClick={() =>
                          operation.run(
                            () =>
                              api<Task>(
                                `/admin/sources/${source.id}/collect`,
                                'POST',
                                { operationId: operationId() },
                              ),
                            setTask,
                          )
                        }
                      >
                        <Play size={12} />
                        采集
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!resource.data.items.length && (
            <Empty title="还没有信源">新增一个来源，开始采集新闻。</Empty>
          )}
        </section>
      )}
      <Modal
        open={open}
        title={editing ? '编辑信源' : '新增信源'}
        onClose={() => setOpen(false)}
      >
        {open && (
          <SourceForm
            source={editing}
            onDone={() => {
              setOpen(false);
              resource.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function SourceForm({
  source,
  onDone,
}: {
  source: Source | null;
  onDone: () => void;
}) {
  const operation = useOperation();
  const [kind, setKind] = useState<Source['kind']>(source?.kind ?? 'rss');
  const [config, setConfig] = useState<Record<string, unknown>>(
    source?.config ?? { fetchArticle: true },
  );
  const domains = useResource<{ domains: string[] }>('/sources');
  const [raw, setRaw] = useState('');
  const [rawMode, setRawMode] = useState(false);
  const change = (key: string, value: unknown) =>
    setConfig((current) => {
      const next = { ...current };
      if (value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  const fields = (config.fields ?? {}) as Record<string, string>;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        void operation.run(async () => {
          let actual = config;
          if (rawMode) {
            try {
              actual = JSON.parse(raw);
            } catch {
              throw new Error('JSON 配置格式有误，请检查引号和逗号。');
            }
          }
          return api(
            source ? `/admin/sources/${source.id}` : '/admin/sources',
            source ? 'PATCH' : 'POST',
            {
              name: values.get('name'),
              url: values.get('url'),
              kind,
              enabled: values.get('enabled') === 'on',
              config: actual,
            },
          );
        }, onDone);
      }}
    >
      <Field label="信源名称">
        <input name="name" required defaultValue={source?.name} />
      </Field>
      <Field label="信源类型">
        <select
          name="kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as Source['kind']);
            setConfig({ fetchArticle: true });
            setRawMode(false);
          }}
        >
          <option value="rss">RSS / Atom</option>
          <option value="json">公开 JSON 接口</option>
          <option value="web">网页列表</option>
        </select>
      </Field>
      <Field label="来源地址">
        <input
          name="url"
          type="url"
          required
          defaultValue={source?.url}
          placeholder="https://example.com/feed.xml"
        />
      </Field>
      {rawMode ? (
        <Field label="JSON 配置">
          <textarea
            className="code-input"
            rows={12}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
        </Field>
      ) : (
        <>
          <label className="check-label">
            <input
              type="checkbox"
              checked={config.fetchArticle !== false}
              onChange={(event) => change('fetchArticle', event.target.checked)}
            />
            读取原文页面，补全可获得的正文
          </label>
          {kind === 'web' && (
            <div className="form-row">
              {[
                ['itemSelector', '列表条目选择器', 'article'],
                ['titleSelector', '标题选择器', 'h2'],
                ['linkSelector', '链接选择器', 'a'],
                ['dateSelector', '时间选择器', 'time'],
                ['contentSelector', '摘要选择器', 'p'],
              ].map(([key, label, placeholder]) => (
                <Field key={key} label={label}>
                  <input
                    name={`config.${key}`}
                    value={String(config[key] ?? '')}
                    placeholder={placeholder}
                    onChange={(event) => change(key, event.target.value)}
                  />
                </Field>
              ))}
            </div>
          )}
          {kind === 'json' && (
            <>
              <Field label="条目数组路径">
                <input
                  name="config.itemsPath"
                  value={String(config.itemsPath ?? '')}
                  placeholder="items"
                  onChange={(event) => change('itemsPath', event.target.value)}
                />
              </Field>
              <div className="form-row">
                {[
                  ['title', '标题字段'],
                  ['url', '链接字段'],
                  ['publishedAt', '发布时间字段'],
                  ['content', '正文字段'],
                  ['summary', '摘要字段'],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      name={`config.fields.${key}`}
                      value={fields[key] ?? ''}
                      placeholder={key}
                      onChange={(event) => {
                        const next = { ...fields };
                        if (event.target.value) next[key] = event.target.value;
                        else delete next[key];
                        change('fields', next);
                      }}
                    />
                  </Field>
                ))}
              </div>
            </>
          )}
          <details className="advanced-options">
            <summary>更多采集设置</summary>
            <div className="form-row">
              <Field label="每次采集上限">
                <input
                  name="config.maxItems"
                  type="number"
                  min={1}
                  max={100}
                  value={Number(config.maxItems ?? 10)}
                  onChange={(event) =>
                    change('maxItems', Number(event.target.value))
                  }
                />
              </Field>
              <Field label="领域提示">
                <select
                  name="config.domain"
                  value={String(config.domain ?? '')}
                  onChange={(event) => change('domain', event.target.value)}
                >
                  <option value="">按内容分类</option>
                  {domains.data?.domains.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label="正文选择器"
              hint="仅提取这个元素中的正文；留空时自动识别主体。"
            >
              <input
                name="config.articleSelector"
                value={String(config.articleSelector ?? '')}
                onChange={(event) =>
                  change('articleSelector', event.target.value)
                }
                placeholder="例如：article .content"
              />
            </Field>
            <div className="form-row">
              <Field label="内容格式">
                <select
                  value={String(config.contentFormat ?? 'auto')}
                  onChange={(event) =>
                    change('contentFormat', event.target.value)
                  }
                >
                  <option value="auto">自动识别</option>
                  <option value="html">HTML</option>
                  <option value="markdown">Markdown</option>
                  <option value="text">纯文本</option>
                </select>
              </Field>
              <Field label="列表提供的内容范围">
                <select
                  value={String(config.contentScope ?? '')}
                  onChange={(event) =>
                    change('contentScope', event.target.value)
                  }
                >
                  <option value="">按来源字段判断</option>
                  <option value="summary">摘要</option>
                  <option value="full">全文</option>
                </select>
              </Field>
            </div>
          </details>
        </>
      )}
      <button
        className="text-link"
        type="button"
        onClick={() => {
          if (!rawMode) {
            setRaw(JSON.stringify(config, null, 2));
            setRawMode(true);
          } else {
            try {
              setConfig(JSON.parse(raw));
              setRawMode(false);
            } catch {
              void operation.run(async () => {
                throw new Error('请先修正 JSON 格式。');
              });
            }
          }
        }}
      >
        {rawMode ? '返回表单配置' : '编辑 JSON 配置'}
      </button>
      <label className="check-label">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={source?.enabled ?? true}
        />
        启用这个信源
      </label>
      <Feedback operation={operation} />
      <button className="button primary" disabled={operation.busy}>
        保存信源
      </button>
    </form>
  );
}
