import { ChevronDown, Edit3, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { api, useOperation, useResource } from "../../api";
import { ChatPanel } from "../../components/chat";
import {
  ErrorState,
  Feedback,
  Field,
  formatDate,
  Loading,
  Modal,
  PageHeading,
  Tabs,
} from "../../components/ui";
import type { Conversation, Editor, MaterialContext } from "../../types";
import { ReadingHistory } from "./history";
import { EditorSettings, Memories } from "./settings";

export function EditorPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'chat';
  const conversations = useResource<{ items: Conversation[] }>(
    '/conversations',
  );
  const editor = useResource<Editor>('/editor');
  const [newKey, setNewKey] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [rename, setRename] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const operation = useOperation();
  const kind = params.get('contextKind');
  const context =
    kind && ['news', 'event', 'favorites', 'topic'].includes(kind)
      ? {
          kind: kind as MaterialContext['kind'],
          id: params.get('contextId') ?? undefined,
        }
      : undefined;
  const conversationId = params.get('conversation') ?? undefined;
  function tab(value: string) {
    const next = new URLSearchParams(params);
    next.set('view', value);
    setParams(next);
  }
  function selectConversation(id?: string) {
    const next = new URLSearchParams(params);
    next.delete('contextKind');
    next.delete('contextId');
    next.delete('choose');
    next.set('view', 'chat');
    if (id) next.set('conversation', id);
    else {
      next.delete('conversation');
      setNewKey((value) => value + 1);
    }
    setParams(next);
    setListOpen(false);
  }
  function startMaterial(nextContext?: MaterialContext) {
    const next = new URLSearchParams(params);
    next.delete('conversation');
    next.delete('contextKind');
    next.delete('contextId');
    next.delete('choose');
    next.set('view', 'chat');
    if (nextContext) {
      next.set('contextKind', nextContext.kind);
      if (nextContext.id) next.set('contextId', nextContext.id);
    }
    setParams(next);
    setNewKey((value) => value + 1);
    setListOpen(false);
  }
  function created(id: string) {
    const next = new URLSearchParams(params);
    next.set('conversation', id);
    next.delete('contextKind');
    next.delete('contextId');
    next.delete('choose');
    setParams(next, { replace: true });
    conversations.reload();
  }
  return (
    <>
      <PageHeading
        title="我的编辑"
        description={
          view === 'chat' ? undefined : '个人日报、阅读手记与偏好设置。'
        }
      />
      <Tabs
        value={view}
        options={[
          { value: 'chat', label: '编辑会话' },
          { value: 'daily', label: '个人日报' },
          { value: 'journals', label: '编辑手记' },
          { value: 'memories', label: '长期记忆' },
          { value: 'settings', label: '编辑设置' },
        ]}
        onChange={tab}
      />
      {view === 'chat' ? (
        <div className="editor-workspace">
          <aside className={`conversation-list ${listOpen ? 'expanded' : ''}`}>
            <div className="conversation-toolbar">
              <button
                className="button secondary"
                onClick={() => selectConversation()}
              >
                <Plus size={15} />
                新建会话
              </button>
              <button
                className="button quiet mobile-only"
                aria-expanded={listOpen}
                onClick={() => setListOpen(!listOpen)}
              >
                历史会话
                <ChevronDown size={14} />
              </button>
            </div>
            <div className="conversation-content">
              {conversations.loading && !conversations.data && <Loading />}
              {conversations.error && (
                <ErrorState
                  error={conversations.error}
                  retry={conversations.reload}
                />
              )}
              <div className="conversation-items">
                {conversations.data?.items.map((conversation) => (
                  <div
                    className={`conversation-item ${conversation.id === conversationId ? 'selected' : ''}`}
                    key={conversation.id}
                  >
                    <button
                      className="conversation-select"
                      onClick={() => selectConversation(conversation.id)}
                    >
                      <span>{conversation.title}</span>
                      <small>{formatDate(conversation.updatedAt)}</small>
                    </button>
                    <div className="conversation-actions">
                      <button
                        className="icon-button"
                        aria-label={`重命名会话：${conversation.title}`}
                        onClick={() => setRename(conversation)}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`删除会话：${conversation.title}`}
                        onClick={() => setDeleting(conversation)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {conversations.data?.items.length === 0 && (
                <p className="context-note">会话会自动保存在这里。</p>
              )}
            </div>
          </aside>
          <ChatPanel
            key={newKey}
            context={context}
            conversationId={conversationId}
            initialSkillId={params.get('skill') ?? ''}
            chooseMaterial={params.get('choose') === '1'}
            onConversation={created}
            onContextChange={startMaterial}
          />
        </div>
      ) : view === 'daily' || view === 'journals' ? (
        <ReadingHistory key={view} kind={view} />
      ) : view === 'memories' ? (
        <Memories />
      ) : (
        <>
          {editor.loading && !editor.data && <Loading />}
          {editor.error && (
            <ErrorState error={editor.error} retry={editor.reload} />
          )}
          {editor.data && (
            <EditorSettings editor={editor.data} reload={editor.reload} />
          )}
        </>
      )}
      <Modal open={!!rename} title="重命名会话" onClose={() => setRename(null)}>
        {rename && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const title = new FormData(event.currentTarget).get('title');
              void operation.run(
                () => api(`/conversations/${rename.id}`, 'PATCH', { title }),
                () => {
                  setRename(null);
                  conversations.reload();
                },
              );
            }}
          >
            <Field label="会话名称">
              <input
                name="title"
                defaultValue={rename.title}
                required
                maxLength={200}
              />
            </Field>
            <Feedback operation={operation} />
            <button className="button primary" disabled={operation.busy}>
              保存名称
            </button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!deleting}
        title="删除会话？"
        onClose={() => setDeleting(null)}
      >
        <p>这段会话及其中的消息将被删除，已保存到专题的成果会保留。</p>
        <Feedback operation={operation} />
        <div className="form-actions">
          <button
            className="button danger"
            disabled={operation.busy}
            onClick={() =>
              operation.run(
                () => api(`/conversations/${deleting!.id}`, 'DELETE'),
                () => {
                  if (conversationId === deleting!.id) selectConversation();
                  setDeleting(null);
                  conversations.reload();
                },
              )
            }
          >
            确认删除会话
          </button>
          <button
            className="button secondary"
            onClick={() => setDeleting(null)}
          >
            取消
          </button>
        </div>
      </Modal>
    </>
  );
}
