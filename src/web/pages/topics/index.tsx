import {
  ArrowRight,
  Bell,
  BellOff,
  BookOpen,
  Check,
  Edit3,
  FolderOpen,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, useOperation, useResource } from "../../api";
import { ReadingEditor } from "../../components/chat";
import { GraphView } from "../../components/graph-lazy";
import { NewsRow } from "../../components/news";
import {
  Empty,
  ErrorState,
  Feedback,
  formatDate,
  Loading,
  Modal,
  PageHeading,
  Tabs,
} from "../../components/ui";
import type { GraphData } from "../../types";
import { SavedArtifactCard } from "./artifacts";
import { AddNews, Notes, TopicForm } from "./forms";
import { type Topic } from "./types";

export function TopicsPage() {
  const resource = useResource<{ items: Topic[] }>('/topics');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <PageHeading
        title="我的专题"
        description="按关键词、领域或事件汇集报道，保存笔记与阅读成果。"
        actions={
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            新建专题
          </button>
        }
      />
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      <div className="topic-grid">
        {resource.data?.items.map((topic) => (
          <Link
            className="panel topic-card"
            to={`/topics/${topic.id}`}
            key={topic.id}
          >
            <div className="topic-card-top">
              <FolderOpen size={23} />
              {topic.unreadCount > 0 && (
                <span className="tag blue">{topic.unreadCount} 条新内容</span>
              )}
            </div>
            <h2>{topic.name}</h2>
            {topic.description && <p>{topic.description}</p>}
            <div className="topic-keywords">
              {topic.filter.keywords && (
                <span className="tag">{topic.filter.keywords}</span>
              )}
              {topic.filter.domain && (
                <span className="tag">{topic.filter.domain}</span>
              )}
            </div>
            <footer>
              <span>
                <BookOpen size={13} />
                {topic.newsCount} 篇报道
              </span>
              <small>{formatDate(topic.updatedAt)}</small>
              <ArrowRight size={16} />
            </footer>
          </Link>
        ))}
      </div>
      {resource.data?.items.length === 0 && (
        <section className="panel">
          <Empty
            title="还没有专题"
            action={
              <button
                className="button secondary"
                onClick={() => setCreating(true)}
              >
                建立专题
              </button>
            }
          >
            选择关注范围后，相关报道会自动汇集。你也可以手动加入报道。
          </Empty>
        </section>
      )}
      <Modal
        open={creating}
        title="建立专题"
        onClose={() => setCreating(false)}
      >
        {creating && (
          <TopicForm onDone={(topic) => navigate(`/topics/${topic.id}`)} />
        )}
      </Modal>
    </>
  );
}

export function TopicPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'news';
  const resource = useResource<Topic>(`/topics/${id}`);
  const graph = useResource<GraphData>(
    view === 'graph' ? `/topics/${id}/graph` : null,
  );
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editor, setEditor] = useState(false);
  const operation = useOperation();
  useEffect(() => setEditor(false), [view]);
  if (resource.loading && !resource.data) return <Loading />;
  if (!resource.data)
    return resource.error ? (
      <ErrorState error={resource.error} retry={resource.reload} />
    ) : null;
  const topic = resource.data;
  return (
    <>
      <Link to="/topics" className="text-link back-link">
        我的专题
      </Link>
      <PageHeading
        title={topic.name}
        description={topic.description}
        actions={
          <>
            <button
              className="button secondary"
              disabled={operation.busy}
              onClick={() =>
                operation.run(
                  () =>
                    api(
                      topic.following ? `/follows/topic/${id}` : '/follows',
                      topic.following ? 'DELETE' : 'POST',
                      topic.following ? undefined : { kind: 'topic', id },
                    ),
                  resource.reload,
                )
              }
            >
              {topic.following ? <BellOff size={15} /> : <Bell size={15} />}
              {topic.following ? '取消关注' : '关注更新'}
            </button>
            <button
              className="button primary"
              onClick={() => setEditor(!editor)}
            >
              <MessageCircle size={15} />
              {editor ? '收起编辑' : '让编辑整理'}
            </button>
          </>
        }
      />
      <div className="topic-info">
        <span className="tag">私人专题</span>
        {topic.filter.keywords && (
          <span className="tag">{topic.filter.keywords}</span>
        )}
        {topic.filter.domain && (
          <span className="tag">{topic.filter.domain}</span>
        )}
        <button className="button quiet small" onClick={() => setEditing(true)}>
          <Edit3 size={13} />
          编辑专题
        </button>
        <button
          className="button quiet small"
          onClick={() => setDeleting(true)}
        >
          <Trash2 size={13} />
          删除专题
        </button>
      </div>
      <Feedback operation={operation} />
      <div className={`read-layout ${editor ? 'with-editor' : ''}`}>
        <section>
          <Tabs
            value={view}
            options={[
              { value: 'news', label: '专题报道', count: topic.news?.length },
              { value: 'notes', label: '我的笔记', count: topic.notes?.length },
              {
                value: 'artifacts',
                label: '阅读成果',
                count: topic.artifacts?.length,
              },
              { value: 'graph', label: '关系图' },
            ]}
            onChange={(value) => setParams({ view: value })}
          />
          {view === 'news' ? (
            <>
              <div className="toolbar">
                <button
                  className="button secondary small"
                  onClick={() => setAdding(true)}
                >
                  <Plus size={14} />
                  加入报道
                </button>
                {topic.unreadCount > 0 && (
                  <button
                    className="button quiet small"
                    disabled={operation.busy}
                    onClick={() =>
                      operation.run(
                        () => api(`/topics/${id}/read`, 'POST', {}),
                        resource.reload,
                      )
                    }
                  >
                    <Check size={14} />将 {topic.unreadCount} 条新内容标为已读
                  </button>
                )}
              </div>
              <div className="news-list">
                {topic.news?.length ? (
                  topic.news.map((news) => (
                    <NewsRow
                      key={news.id}
                      news={news}
                      actions={
                        <button
                          className="text-link"
                          disabled={operation.busy}
                          onClick={() =>
                            operation.run(
                              () =>
                                api(`/topics/${id}/news/${news.id}`, 'DELETE'),
                              resource.reload,
                              '报道已移出，可通过“加入报道”重新加入。',
                            )
                          }
                        >
                          移出专题
                        </button>
                      }
                    />
                  ))
                ) : (
                  <Empty
                    title="还没有匹配的报道"
                    action={
                      <button
                        className="button secondary small"
                        onClick={() => setAdding(true)}
                      >
                        加入报道
                      </button>
                    }
                  >
                    可以调整关注范围，或手动加入新闻。
                  </Empty>
                )}
              </div>
            </>
          ) : view === 'notes' ? (
            <Notes
              topicId={topic.id}
              items={topic.notes ?? []}
              reload={resource.reload}
            />
          ) : view === 'artifacts' ? (
            topic.artifacts?.length ? (
              topic.artifacts.map((artifact) => (
                <SavedArtifactCard
                  key={artifact.id}
                  artifact={artifact}
                  reload={resource.reload}
                />
              ))
            ) : (
              <section className="panel">
                <Empty
                  title="还没有阅读成果"
                  action={
                    <button
                      className="button secondary"
                      onClick={() => setEditor(true)}
                    >
                      让编辑整理
                    </button>
                  }
                >
                  使用专题简报、多源对比或思维导图，完成后保存到这个专题。
                </Empty>
              </section>
            )
          ) : (
            <section className="panel">
              {graph.loading && !graph.data && <Loading />}
              {graph.error && (
                <ErrorState error={graph.error} retry={graph.reload} />
              )}
              {graph.data && <GraphView graph={graph.data} />}
            </section>
          )}
        </section>
        {editor && (
          <ReadingEditor
            context={{ kind: 'topic', id }}
            onArtifactSaved={resource.reload}
            onClose={() => setEditor(false)}
          />
        )}
      </div>
      <Modal open={editing} title="编辑专题" onClose={() => setEditing(false)}>
        {editing && (
          <TopicForm
            topic={topic}
            onDone={() => {
              setEditing(false);
              resource.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={adding} title="加入报道" onClose={() => setAdding(false)}>
        {adding && (
          <AddNews
            topicId={topic.id}
            onDone={() => {
              setAdding(false);
              resource.reload();
            }}
          />
        )}
      </Modal>
      <Modal
        open={deleting}
        title="删除这个专题？"
        onClose={() => setDeleting(false)}
      >
        <p>
          “{topic.name}”中的笔记、阅读成果及其分享将随专题删除。公共新闻会保留。
        </p>
        <Feedback operation={operation} />
        <div className="form-actions">
          <button
            className="button danger"
            disabled={operation.busy}
            onClick={() =>
              operation.run(
                () => api(`/topics/${id}`, 'DELETE'),
                () => navigate('/topics'),
              )
            }
          >
            确认删除专题
          </button>
          <button
            className="button secondary"
            onClick={() => setDeleting(false)}
          >
            取消
          </button>
        </div>
      </Modal>
    </>
  );
}
