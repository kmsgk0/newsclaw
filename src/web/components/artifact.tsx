import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import type { Artifact, Citation } from "../types";
import { Prose } from "./content";
import { Mindmap } from "./mindmap";
import { TopicDestination } from "./topic-destination";
import { Modal } from "./ui";


export function SaveArtifact({
  artifact,
  onSaved,
  topicId,
}: {
  artifact: Artifact;
  onSaved?: () => void;
  topicId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button secondary small" onClick={() => setOpen(true)}>
        <FolderPlus size={14} />
        保存到专题
      </button>
      <Modal open={open} title="保存阅读成果" onClose={() => setOpen(false)}>
        {open && (
          <TopicDestination
            defaultId={topicId}
            view="artifacts"
            onSaved={onSaved}
            save={(id) =>
              api(`/topics/${id}/artifacts`, "POST", {
                title: artifact.title,
                kind: artifact.kind,
                content: artifact.content,
                structure: artifact.structure,
                skillId: artifact.skillId,
                sourceIds: artifact.sourceIds,
                messageId: artifact.messageId,
              })
            }
          />
        )}
      </Modal>
    </>
  );
}

export function ArtifactView({
  artifact,
  save = false,
  onSaved,
  topicId,
  sources,
}: {
  artifact: Artifact;
  save?: boolean;
  onSaved?: () => void;
  topicId?: string;
  sources?: Citation[];
}) {
  return (
    <section className="artifact-preview">
      <div className="section-heading">
        <h3>{artifact.title}</h3>
        <span className="tag">
          {
            { brief: "专题简报", comparison: "多源对比", mindmap: "思维导图" }[
              artifact.kind
            ]
          }
        </span>
      </div>
      {artifact.structure ? (
        <Mindmap node={artifact.structure} />
      ) : (
        <Prose sources={sources ?? artifact.sources}>{artifact.content}</Prose>
      )}
      {save && (
        <SaveArtifact artifact={artifact} onSaved={onSaved} topicId={topicId} />
      )}
    </section>
  );
}
