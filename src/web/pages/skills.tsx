import {
  ArrowRight,
  BookOpen,
  Download,
  GitCompare,
  ListTree,
  Pencil,
  Play,
  Sparkles,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, useOperation, useResource } from "../api";
import { useAuth } from "../auth";
import { Prose } from "../components/content";
import {
  Empty,
  ErrorState,
  Feedback,
  Field,
  Loading,
  Modal,
  PageHeading,
  Tabs,
} from "../components/ui";
import type { PersonalSkill, Skill } from "../types";

const icons = {
  explain: Sparkles,
  comparison: GitCompare,
  brief: BookOpen,
  mindmap: ListTree,
  bilingual: Pencil,
};

const inputHints = {
  explain: '一篇新闻或一组报道',
  comparison: '同一事件的多篇报道',
  brief: '事件、收藏或专题',
  mindmap: '一篇新闻或一组报道',
  bilingual: '含外文原文的报道',
};

export function SkillsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'catalog';
  const catalog = useResource<{ items: Skill[] }>('/skills');
  const mine = useResource<{ items: PersonalSkill[] }>(
    auth.user ? '/skills/mine' : null,
  );
  const [selected, setSelected] = useState<Skill | null>(null);
  const operation = useOperation();
  async function startSkill(skill: Skill) {
    const installed = mine.data?.items.find(
      (item) => item.templateId === skill.id,
    );
    await operation.run(
      async () =>
        installed ??
        (await api<PersonalSkill>(`/skills/${skill.id}/install`, 'POST')),
      (result) => {
        mine.reload();
        navigate(`/editor?skill=${result.id}&choose=1`);
      },
    );
  }
  return (
    <>
      <PageHeading
        title="阅读技能"
        description="选择材料的处理方式，也可以调整自己的技能说明。"
      />
      <Tabs
        value={view}
        options={[
          {
            value: 'catalog',
            label: '技能广场',
            count: catalog.data?.items.length,
          },
          { value: 'mine', label: '我的技能', count: mine.data?.items.length },
        ]}
        onChange={(value) => setParams({ view: value })}
      />
      {view === 'catalog' ? (
        <>
          {catalog.loading && !catalog.data && <Loading />}
          {catalog.error && (
            <ErrorState error={catalog.error} retry={catalog.reload} />
          )}
          <Feedback operation={operation} />
          <div className="skill-grid">
            {catalog.data?.items.map((skill) => {
              const Icon = icons[skill.kind] ?? Sparkles;
              const installed = mine.data?.items.find(
                (item) => item.templateId === skill.id,
              );
              return (
                <article
                  className={`panel skill-card skill-${skill.kind}`}
                  key={skill.id}
                >
                  <span className="skill-icon">
                    <Icon size={23} />
                  </span>
                  <h2>{skill.name}</h2>
                  <p>{skill.description}</p>
                  <dl className="skill-facts">
                    <dt>适用材料</dt>
                    <dd>{inputHints[skill.kind]}</dd>
                    <dt>输出形式</dt>
                    <dd>{skill.outputFormat}</dd>
                  </dl>
                  <button
                    className="text-link"
                    onClick={() => setSelected(skill)}
                  >
                    查看效果示例
                    <ArrowRight size={13} />
                  </button>
                  <footer>
                    {auth.user ? (
                      <>
                        <button
                          className="button primary small"
                          disabled={
                            operation.busy || installed?.enabled === false
                          }
                          onClick={() => void startSkill(skill)}
                        >
                          <Play size={13} />
                          {installed ? '开始使用' : '安装并使用'}
                        </button>
                        {installed ? (
                          <Link className="text-link" to="/skills?view=mine">
                            {installed.enabled ? '管理副本' : '已停用，去启用'}
                          </Link>
                        ) : (
                          <button
                            className="button secondary small"
                            disabled={operation.busy}
                            onClick={() =>
                              operation.run(
                                () =>
                                  api(`/skills/${skill.id}/install`, 'POST'),
                                mine.reload,
                                '技能已安装',
                              )
                            }
                          >
                            <Download size={13} />
                            安装技能
                          </button>
                        )}
                      </>
                    ) : (
                      <Link
                        className="button secondary small"
                        to="/login?returnTo=/skills"
                      >
                        登录后使用
                      </Link>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
          {catalog.data?.items.length === 0 && (
            <Empty title="暂时没有公开技能" />
          )}
        </>
      ) : !auth.user ? (
        <Empty
          title="登录后管理你的技能"
          action={
            <Link
              className="button primary"
              to="/login?returnTo=/skills?view=mine"
            >
              登录
            </Link>
          }
        >
          安装后可以修改说明、调整输出和启停。
        </Empty>
      ) : (
        <>
          {mine.loading && !mine.data && <Loading />}
          {mine.error && <ErrorState error={mine.error} retry={mine.reload} />}
          {mine.data?.items.length === 0 && (
            <Empty
              title="还没有安装技能"
              action={
                <button
                  className="button secondary"
                  onClick={() => setParams({})}
                >
                  浏览技能广场
                </button>
              }
            >
              选择一种阅读方式开始。
            </Empty>
          )}
          <div className="personal-skill-list">
            {mine.data?.items.map((skill) => (
              <PersonalSkillCard
                key={skill.id}
                skill={skill}
                reload={() => {
                  mine.reload();
                  catalog.reload();
                }}
              />
            ))}
          </div>
        </>
      )}
      <Modal
        open={!!selected}
        title={`${selected?.name ?? '技能'} · 效果示例`}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <p className="muted">{selected.description}</p>
            <div className="skill-example">
              <Prose>{selected.example}</Prose>
            </div>
            <details className="advanced-options">
              <summary>查看技能说明</summary>
              <Prose>{selected.instructions}</Prose>
            </details>
            {auth.user && (
              <button
                className="button primary"
                disabled={operation.busy}
                onClick={() => void startSkill(selected)}
              >
                选择材料并使用
              </button>
            )}
            <Feedback operation={operation} />
          </>
        )}
      </Modal>
    </>
  );
}

function PersonalSkillCard({
  skill,
  reload,
}: {
  skill: PersonalSkill;
  reload: () => void;
}) {
  const operation = useOperation();
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const Icon = icons[skill.kind] ?? Sparkles;
  return (
    <article className="panel personal-skill">
      <div className="personal-skill-heading">
        <span className="skill-icon">
          <Icon size={21} />
        </span>
        <div>
          <h2>{skill.name}</h2>
          <p className="muted">个人副本，修改仅对你生效。</p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={skill.enabled}
            disabled={operation.busy}
            onChange={(event) =>
              operation.run(
                () =>
                  api(`/skills/mine/${skill.id}`, 'PATCH', {
                    enabled: event.target.checked,
                  }),
                reload,
              )
            }
          />
          <span>{skill.enabled ? '已启用' : '已停用'}</span>
        </label>
      </div>
      <Feedback operation={operation} />
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            void operation.run(
              () => api(`/skills/mine/${skill.id}`, 'PATCH', values),
              () => {
                setEditing(false);
                reload();
              },
              '个人技能已保存',
            );
          }}
        >
          <Field label="技能名称">
            <input
              name="name"
              defaultValue={skill.name}
              required
              maxLength={100}
            />
          </Field>
          <Field label="处理说明">
            <textarea
              name="instructions"
              defaultValue={skill.instructions}
              rows={6}
              required
              maxLength={12000}
            />
          </Field>
          <Field label="输出形式">
            <input
              name="outputFormat"
              defaultValue={skill.outputFormat}
              required
              maxLength={2000}
            />
          </Field>
          <div className="form-actions">
            <button className="button primary small" disabled={operation.busy}>
              保存修改
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
          </div>
        </form>
      ) : (
        <>
          <Prose>{skill.instructions}</Prose>
          <p className="content-meta">输出形式：{skill.outputFormat}</p>
        </>
      )}
      <footer className="form-actions">
        {skill.enabled && (
          <Link
            className="button primary small"
            to={`/editor?skill=${skill.id}&choose=1`}
          >
            <Play size={13} />
            开始使用
          </Link>
        )}
        <button
          className="button secondary small"
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={13} />
          调整说明
        </button>
        <button
          className="button secondary small"
          onClick={() => setPublishing(true)}
        >
          <Upload size={13} />
          {skill.publication ? '更新公开版本' : '发布到广场'}
        </button>
        {skill.publication && (
          <>
            <span className="tag">
              {{ published: '已发布', draft: '草稿', unlisted: '已下架' }[
                skill.publication.status
              ] ?? skill.publication.status}
            </span>
            <button
              className="button quiet small"
              disabled={operation.busy}
              onClick={() =>
                operation.run(
                  () =>
                    api(`/skills/${skill.publication!.id}`, 'PATCH', {
                      status:
                        skill.publication!.status === 'published'
                          ? 'unlisted'
                          : 'published',
                    }),
                  reload,
                )
              }
            >
              {skill.publication.status === 'published'
                ? '下架公开版本'
                : '重新发布'}
            </button>
          </>
        )}
      </footer>
      <Modal
        open={publishing}
        title="发布技能版本"
        onClose={() => setPublishing(false)}
      >
        {publishing && (
          <PublishSkill
            skill={skill}
            onDone={() => {
              setPublishing(false);
              reload();
            }}
          />
        )}
      </Modal>
    </article>
  );
}

function PublishSkill({
  skill,
  onDone,
}: {
  skill: PersonalSkill;
  onDone: () => void;
}) {
  const [description, setDescription] = useState(
    skill.publication?.description ?? '',
  );
  const [example, setExample] = useState(skill.publication?.example ?? '');
  const [preview, setPreview] = useState(false);
  const operation = useOperation();
  const publish = (status: 'draft' | 'published') =>
    operation.run(
      () =>
        api(`/skills/mine/${skill.id}/publish`, 'POST', {
          description,
          example,
          status,
        }),
      onDone,
    );
  return (
    <>
      <p className="muted">
        公开技能说明、输出形式和下方示例。个人会话和材料不会随之发布。
      </p>
      {preview ? (
        <>
          <div className="skill-example">
            <h3>{skill.name}</h3>
            <p>{description}</p>
            <Prose>{skill.instructions}</Prose>
            <h4>效果示例</h4>
            <Prose>{example}</Prose>
          </div>
          <Feedback operation={operation} />
          <div className="form-actions">
            <button
              className="button primary"
              disabled={operation.busy}
              onClick={() => void publish('published')}
            >
              确认发布
            </button>
            <button
              className="button secondary"
              onClick={() => setPreview(false)}
            >
              返回编辑
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPreview(true);
          }}
        >
          <Field label="公开介绍">
            <textarea
              name="description"
              required
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="说明这个技能适合处理哪些材料。"
            />
          </Field>
          <Field label="公开效果示例" hint="支持 Markdown。">
            <textarea
              name="example"
              required
              rows={7}
              maxLength={6000}
              value={example}
              onChange={(event) => setExample(event.target.value)}
              placeholder="填写完整、适合公开展示的示例。"
            />
          </Field>
          <Feedback operation={operation} />
          <div className="form-actions">
            <button className="button primary">预览公开内容</button>
            <button
              type="button"
              className="button secondary"
              disabled={
                !description.trim() || !example.trim() || operation.busy
              }
              onClick={() => void publish('draft')}
            >
              保存草稿
            </button>
          </div>
        </form>
      )}
    </>
  );
}
