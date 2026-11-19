import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ApiError, useOperation } from "../../api";
import type { MaterialContext, Message, PersonalSkill } from "../../types";
import { ArtifactView } from "../artifact";
import { Prose, Sources } from "../content";
import { ErrorState, Feedback, Loading } from "../ui";

function CopyMessage({ content }: { content: string }) {
  const operation = useOperation();
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        className="button quiet small"
        onClick={() =>
          operation.run(
            () => navigator.clipboard.writeText(content),
            () => setCopied(true),
          )
        }
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "已复制" : "复制"}
      </button>
      <Feedback operation={operation} />
    </>
  );
}

export function ChatMessages({ messages, editorName, skills, busy, effectiveContext, text, onRetry, onArtifactSaved }: {
  messages: Message[];
  editorName?: string;
  skills: PersonalSkill[];
  busy: boolean;
  effectiveContext?: MaterialContext;
  text: string;
  onRetry: (question: string, message: Message) => void;
  onArtifactSaved?: () => void;
}) {
  return <>
            {messages.map((message, index) => (
              <article
                key={message.id}
                className={`chat-message ${message.role}`}
              >
                <div className="message-label">
                  {message.role === "user"
                    ? "你"
                    : (editorName ?? "编辑")}
                  {message.status === "failed" && (
                    <span className="tag red">未完成</span>
                  )}
                  {message.skillId && (
                    <span className="tag">
                      {message.skillName ??
                        skills.find(
                          (skill) => skill.id === message.skillId,
                        )?.name ??
                        "阅读技能"}
                    </span>
                  )}
                </div>
                <div className="message-answer">
                  {message.artifact ? (
                    <ArtifactView
                      artifact={message.artifact}
                      sources={message.sources}
                      save={message.status === "completed"}
                      onSaved={onArtifactSaved}
                      topicId={
                        effectiveContext?.kind === "topic"
                          ? effectiveContext.id
                          : undefined
                      }
                    />
                  ) : (
                    <Prose sources={message.sources}>{message.content}</Prose>
                  )}
                  {message.status === "pending" && !message.content && (
                    <Loading label="正在组织回答" />
                  )}
                  {message.status === "failed" && (
                    <ErrorState
                      error={
                        message.error
                          ? new ApiError(
                              message.error.status,
                              message.error.code,
                              message.error.message,
                              message.error.requestId,
                            )
                          : new Error("这次回答未完成，可以使用原问题重试。")
                      }
                    />
                  )}
                </div>
                <Sources
                  sources={message.sources}
                  content={message.artifact?.content ?? message.content}
                  structure={message.artifact?.structure}
                />
                {message.role === "assistant" && (
                  <div className="message-actions">
                    {message.content && (
                      <CopyMessage content={message.content} />
                    )}
                    {message.status === "failed" && (
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          onRetry(
                            message.request?.content ??
                              messages
                                .slice(0, index)
                                .findLast((item) => item.role === "user")
                                ?.content ??
                              text,
                            message,
                          )
                        }
                      >
                        <RefreshCw size={13} />
                        重试回答
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
  </>;
}
