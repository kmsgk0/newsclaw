import { Check, Copy, Edit3, Globe, Link2, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api, useOperation, useResource } from "../../api";
import { ArtifactView } from "../../components/artifact";
import { Prose, Sources } from "../../components/content";
import { Mindmap } from "../../components/mindmap";
import {
  ErrorState,
  Feedback,
  Field,
  formatDate,
  Loading,
  Modal,
} from "../../components/ui";
import { type SavedArtifact, type SharedArtifact } from "./types";

export function SavedArtifactCard({
  artifact,
  reload,
}: {
  artifact: SavedArtifact;
  reload: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const preview = useResource<SharedArtifact>(
    sharing ? `/artifacts/${artifact.id}/share-preview` : null,
  );
  const operation = useOperation();
  const [copied, setCopied] = useState('');
  return (
    <article className="panel saved-artifact">
      <p className="content-meta">
        阅读成果 · {formatDate(artifact.createdAt, true)}
      </p>
      <ArtifactView artifact={artifact} />
      {artifact.sources && <Sources sources={artifact.sources} />}
      <div className="form-actions">
        <button
          className="button secondary small"
          onClick={() => setSharing(true)}
        >
          <Share2 size={14} />
          预览并分享
        </button>
        <button
          className="button quiet small"
          onClick={() => setRenaming(true)}
        >
          <Edit3 size={13} />
          重命名
        </button>
        <button
          className="button quiet small"
          onClick={() => setDeleting(true)}
        >
          <Trash2 size={13} />
          删除成果
        </button>
      </div>
      <Feedback operation={operation} />
      {artifact.shares
        ?.filter((share) => !share.revokedAt)
        .map((share) => (
          <div className="share-row" key={share.token}>
            <Link className="text-link" to={share.url}>
              <Link2 size={14} />
              公开分享页
            </Link>
            <button
              className="button quiet small"
              onClick={() =>
                operation.run(
                  () =>
                    navigator.clipboard.writeText(
                      new URL(share.url, location.origin).href,
                    ),
                  () => setCopied(share.token),
                )
              }
            >
              {copied === share.token ? (
                <Check size={13} />
              ) : (
                <Copy size={13} />
              )}
              {copied === share.token ? '已复制' : '复制链接'}
            </button>
            <button
              className="button quiet small"
              disabled={operation.busy}
              onClick={() =>
                operation.run(
                  () => api(`/shares/${share.token}`, 'DELETE'),
                  reload,
                  '分享已撤销',
                )
              }
            >
              撤销分享
            </button>
          </div>
        ))}
      <Modal
        open={sharing}
        title="预览公开内容"
        onClose={() => setSharing(false)}
      >
        <p className="muted">分享包含下方成果和公共来源。</p>
        {preview.loading && <Loading />}
        {preview.error && (
          <ErrorState error={preview.error} retry={preview.reload} />
        )}
        {preview.data && (
          <>
            <ArtifactView artifact={preview.data} />
            <Sources sources={preview.data.sources} />
            <Feedback operation={operation} />
            <button
              className="button primary"
              disabled={operation.busy}
              onClick={() =>
                operation.run(
                  () =>
                    api(`/artifacts/${artifact.id}/shares`, 'POST', {
                      confirmed: true,
                    }),
                  () => {
                    setSharing(false);
                    reload();
                  },
                  '分享链接已创建',
                )
              }
            >
              <Globe size={15} />
              确认生成分享链接
            </button>
          </>
        )}
      </Modal>
      <Modal
        open={renaming}
        title="重命名成果"
        onClose={() => setRenaming(false)}
      >
        {renaming && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const title = new FormData(event.currentTarget).get('title');
              void operation.run(
                () => api(`/artifacts/${artifact.id}`, 'PATCH', { title }),
                () => {
                  setRenaming(false);
                  reload();
                },
              );
            }}
          >
            <Field label="成果名称">
              <input
                name="title"
                defaultValue={artifact.title}
                maxLength={200}
                required
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
        open={deleting}
        title="删除阅读成果？"
        onClose={() => setDeleting(false)}
      >
        <p>“{artifact.title}”及其公开分享链接将被删除。</p>
        <Feedback operation={operation} />
        <div className="form-actions">
          <button
            className="button danger"
            disabled={operation.busy}
            onClick={() =>
              operation.run(
                () => api(`/artifacts/${artifact.id}`, 'DELETE'),
                reload,
              )
            }
          >
            确认删除成果
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

export function SharePage() {
  const { token } = useParams();
  const resource = useResource<SharedArtifact>(`/shares/${token}`);
  return (
    <>
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      {resource.data && (
        <article className="panel share-article">
          <p className="content-meta">公开阅读成果</p>
          <h1>{resource.data.title}</h1>
          <p className="content-meta">
            {formatDate(resource.data.createdAt, true)}
          </p>
          {resource.data.structure ? (
            <Mindmap node={resource.data.structure} />
          ) : (
            <Prose sources={resource.data.sources}>
              {resource.data.content}
            </Prose>
          )}
          <Sources sources={resource.data.sources} />
          <p className="share-footer">内容与来源保留生成时的版本。</p>
        </article>
      )}
    </>
  );
}
