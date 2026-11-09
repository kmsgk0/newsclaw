import { Check, Edit3, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, useOperation, useResource } from "../../api";
import {
  Empty,
  ErrorState,
  Feedback,
  Field,
  formatDate,
  Loading,
  Modal,
} from "../../components/ui";
import type { Editor, Memory } from "../../types";


export function EditorSettings({
  editor,
  reload,
}: {
  editor: Editor;
  reload: () => void;
}) {
  const operation = useOperation();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    void operation.run(
      () => api('/editor', 'PATCH', fields),
      reload,
      '编辑设置已保存',
    );
  }
  return (
    <section className="panel narrow-panel">
      <h2>编辑设置</h2>
      <p className="muted">明确填写的兴趣和偏好优先于自动记忆。</p>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="编辑名字">
            <input
              name="name"
              defaultValue={editor.name}
              required
              maxLength={100}
            />
          </Field>
          <Field label="头像地址" hint="可留空。">
            <input
              name="avatar"
              defaultValue={editor.avatar}
              type="url"
              placeholder="https://…"
            />
          </Field>
        </div>
        <Field label="解读风格">
          <textarea
            name="style"
            defaultValue={editor.style}
            required
            maxLength={2000}
            placeholder="例如：简洁直接，必要时解释术语。"
          />
        </Field>
        <Field label="兴趣与关注方向">
          <textarea
            name="interests"
            defaultValue={editor.interests}
            maxLength={4000}
            placeholder="例如：关注开源模型和开发工具，少看融资新闻。"
          />
        </Field>
        <Feedback operation={operation} />
        <button className="button primary" disabled={operation.busy}>
          <Check size={15} />
          保存设置
        </button>
      </form>
    </section>
  );
}

export function Memories() {
  const resource = useResource<{ items: Memory[] }>('/memories');
  const [adding, setAdding] = useState(false);
  const operation = useOperation();
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>长期记忆</h2>
          <p className="muted">管理编辑持续使用的兴趣和回答偏好。</p>
        </div>
        <button className="button secondary" onClick={() => setAdding(true)}>
          <Plus size={15} />
          添加记忆
        </button>
      </div>
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      {resource.data && (
        <div className="memory-grid">
          {resource.data.items.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              reload={resource.reload}
            />
          ))}
        </div>
      )}
      {resource.data?.items.length === 0 && (
        <Empty title="还没有长期记忆">
          可以主动添加偏好，也可以阅读后让编辑整理。
        </Empty>
      )}
      <Modal open={adding} title="添加记忆" onClose={() => setAdding(false)}>
        {adding && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const fields = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              void operation.run(
                () => api('/memories', 'POST', fields),
                () => {
                  setAdding(false);
                  resource.reload();
                },
              );
            }}
          >
            <Field label="记忆名称">
              <input
                name="key"
                required
                maxLength={100}
                placeholder="例如：回答偏好"
              />
            </Field>
            <Field label="记忆内容">
              <textarea
                name="content"
                required
                maxLength={2000}
                placeholder="例如：先说明结论，再介绍依据。"
              />
            </Field>
            <Feedback operation={operation} />
            <button className="button primary" disabled={operation.busy}>
              保存记忆
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}

function MemoryCard({
  memory,
  reload,
}: {
  memory: Memory;
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [content, setContent] = useState(memory.content);
  const operation = useOperation();
  return (
    <article className="panel memory-card">
      <div className="section-heading">
        <h3>{memory.key}</h3>
        <span className="tag">
          {memory.origin === 'manual' ? '明确偏好' : '自动整理'}
        </span>
      </div>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void operation.run(
              () => api(`/memories/${memory.id}`, 'PATCH', { content }),
              () => {
                setEditing(false);
                reload();
              },
            );
          }}
        >
          <Field label="修改记忆">
            <textarea
              name="content"
              value={content}
              required
              maxLength={2000}
              onChange={(event) => setContent(event.target.value)}
            />
          </Field>
          <div className="form-actions">
            <button className="button primary small" disabled={operation.busy}>
              保存
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setEditing(false);
                setContent(memory.content);
              }}
            >
              取消
            </button>
          </div>
        </form>
      ) : (
        <p>{memory.content}</p>
      )}
      <Feedback operation={operation} />
      <footer>
        <small>{formatDate(memory.updatedAt)}</small>
        <div className="item-actions">
          <button
            className="icon-button"
            aria-label={`修改${memory.key}`}
            onClick={() => setEditing(true)}
          >
            <Edit3 size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={`删除${memory.key}`}
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </footer>
      <Modal
        open={deleting}
        title="删除这条记忆？"
        onClose={() => setDeleting(false)}
      >
        <p>“{memory.key}”将不再用于个性化。</p>
        <Feedback operation={operation} />
        <div className="form-actions">
          <button
            className="button danger"
            disabled={operation.busy}
            onClick={() =>
              operation.run(
                () => api(`/memories/${memory.id}`, 'DELETE'),
                reload,
              )
            }
          >
            确认删除记忆
          </button>
          <button
            className="button secondary"
            onClick={() => setDeleting(false)}
          >
            取消
          </button>
        </div>
      </Modal>
    </article>
  );
}
