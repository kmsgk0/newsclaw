import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { MaterialContext } from "../types";
import { MaterialName, MaterialPicker } from "./material-picker";
import { ErrorState, Loading, Modal } from "./ui";
import { ChatMessages } from "./chat/messages";
import { useChatSession } from "./chat/use-chat-session";
import type { ChatProps } from "./chat/types";

function answerScrollTop(container: HTMLElement) {
  const latest = container.querySelector<HTMLElement>(
    ".chat-message:last-of-type",
  );
  const answer =
    latest?.querySelector<HTMLElement>(".message-answer") ?? latest;
  if (!answer) return 0;
  const bottom =
    answer.getBoundingClientRect().bottom -
    container.getBoundingClientRect().top +
    container.scrollTop;
  return Math.max(
    0,
    Math.min(
      container.scrollHeight - container.clientHeight,
      bottom - container.clientHeight + 24,
    ),
  );
}

export function ChatPanel({
  context,
  conversationId,
  initialSkillId = "",
  onConversation,
  onContextChange,
  onArtifactSaved,
  compact = false,
  chooseMaterial = false,
}: ChatProps) {
  const [choosing, setChoosing] = useState(chooseMaterial);
  const [following, setFollowing] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const followScroll = useRef(true);
  const onReset = useCallback(() => {
    setChoosing(false);
    followScroll.current = true;
  }, []);
  const onSendStart = useCallback(() => {
    followScroll.current = true;
    setFollowing(true);
  }, []);
  const { auth, activeId, effectiveContext, localContext, messages, text, setText, skillId, setSkillId,
    busy, error, tool, enabled, profile, conversation, skills, reset, send, stop, feedbackChanged } = useChatSession({
    context, conversationId, initialSkillId, onConversation, onContextChange, onReset, onSendStart,
  });
  useLayoutEffect(() => {
    if (followScroll.current && scroll.current)
      scroll.current.scrollTo({
        top: answerScrollTop(scroll.current),
        behavior: "instant",
      });
  }, [messages, tool]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(text);
  };
  return (
    <section className={`chat-panel ${compact ? "compact" : ""}`}>
      <header className="chat-header">
        <span className="chat-avatar">
          {profile.data?.avatar ? (
            <img src={profile.data.avatar} alt="" />
          ) : (
            <BookOpen size={19} />
          )}
        </span>
        <div>
          <strong>{profile.data?.name ?? "我的编辑"}</strong>
          <small>
            <MaterialName context={effectiveContext} />
          </small>
        </div>
        {auth.user && (
          <button
            className="icon-button"
            aria-label="选择阅读材料"
            disabled={busy}
            onClick={() => setChoosing(true)}
          >
            <SlidersHorizontal size={17} />
          </button>
        )}
        {compact && activeId && (
          <button
            className="icon-button"
            disabled={busy}
            aria-label="开始新会话"
            onClick={() => reset(localContext)}
          >
            <Plus size={17} />
          </button>
        )}
      </header>
      {!auth.user ? (
        <div className="chat-login">
          <BookOpen size={30} />
          <h3>登录后使用个人编辑</h3>
          <p>针对当前材料提问，或使用阅读技能整理。</p>
          <Link
            className="button primary"
            to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
          >
            登录并开始对话
          </Link>
        </div>
      ) : (
        <>
          <div
            className="chat-messages"
            ref={scroll}
            onScroll={() => {
              const element = scroll.current;
              if (element) {
                followScroll.current =
                  Math.abs(element.scrollTop - answerScrollTop(element)) < 64;
                setFollowing(followScroll.current);
              }
            }}
          >
            {conversation.loading && !messages.length && (
              <Loading label="正在读取会话" />
            )}
            {conversation.error && (
              <ErrorState
                error={conversation.error}
                retry={conversation.reload}
              />
            )}
            {!messages.length && !conversation.loading && (
              <div className="chat-welcome">
                <h2>
                  {effectiveContext ? "从当前材料开始提问" : "想了解什么新闻？"}
                </h2>
                <p>
                  {effectiveContext
                    ? "可以解释背景、比较报道，或整理成阅读成果。"
                    : "直接提问，或选择新闻、事件、收藏与专题。"}
                </p>
                <div className="question-suggestions">
                  {(effectiveContext
                    ? ["概括这份材料的主要内容。", "解释文中的关键概念。"]
                    : ["今天有哪些值得关注的科技新闻？"]
                  ).map((prompt) => (
                    <button key={prompt} onClick={() => setText(prompt)}>
                      {prompt}
                      <ArrowUp size={13} />
                    </button>
                  ))}
                </div>
                {!effectiveContext && (
                  <button
                    className="button secondary small"
                    onClick={() => setChoosing(true)}
                  >
                    选择阅读材料
                  </button>
                )}
              </div>
            )}
            <ChatMessages messages={messages} editorName={profile.data?.name}
              skills={skills.data?.items ?? []} busy={busy} effectiveContext={effectiveContext}
              text={text} onRetry={(question, message) => void send(question, message)}
              onArtifactSaved={onArtifactSaved} onFeedback={feedbackChanged} />
            {tool && (
              <p className="tool-status">
                <LoaderCircle size={14} className="spin" />
                {tool}
              </p>
            )}
            {error && <ErrorState error={error} />}
          </div>
          {!following && (
            <button
              className="jump-bottom button secondary small"
              onClick={() => {
                followScroll.current = true;
                setFollowing(true);
                scroll.current?.scrollTo({
                  top: answerScrollTop(scroll.current),
                  behavior: "smooth",
                });
              }}
            >
              <ArrowDown size={13} />
              回到最新内容
            </button>
          )}
          <form className="composer" onSubmit={submit}>
            <div className="composer-options">
              <label htmlFor={`skill-${compact ? "reading" : "workspace"}`}>
                阅读方式
              </label>
              <select
                id={`skill-${compact ? "reading" : "workspace"}`}
                aria-label="选择阅读技能"
                value={skillId}
                disabled={busy}
                onChange={(event) => setSkillId(event.target.value)}
              >
                <option value="">自动选择</option>
                {skills.data?.items.map((skill) => (
                  <option
                    key={skill.id}
                    value={skill.id}
                    disabled={!skill.enabled}
                  >
                    {skill.name}
                    {!skill.enabled ? "（已停用）" : ""}
                  </option>
                ))}
              </select>
              <Link to="/skills">
                {enabled.length ? "管理技能" : "安装技能"}
              </Link>
            </div>
            {skills.error && (
              <ErrorState error={skills.error} retry={skills.reload} />
            )}
            {skillId && !effectiveContext && (
              <p className="composer-hint">
                请先
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setChoosing(true)}
                >
                  选择材料
                </button>
                ，再使用这个技能。
              </p>
            )}
            <textarea
              name="content"
              maxLength={12000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                effectiveContext
                  ? "针对这些材料提问…"
                  : "输入问题，或先选择阅读材料…"
              }
              aria-label="向编辑提问"
              required
              rows={2}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  if (!busy) event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-bottom">
              <small>⌘ / Ctrl + Enter 发送</small>
              {busy ? (
                <button
                  type="button"
                  className="button secondary small"
                  onClick={stop}
                >
                  <Square size={13} />
                  停止回答
                </button>
              ) : (
                <button
                  className="send-button"
                  disabled={!text.trim() || (!!skillId && !effectiveContext)}
                  aria-label="发送问题"
                >
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </form>
        </>
      )}
      <Modal
        open={choosing}
        title="选择阅读材料"
        onClose={() => setChoosing(false)}
      >
        {choosing && <MaterialPicker onSelect={reset} />}
      </Modal>
    </section>
  );
}

export function ReadingEditor({
  context,
  onClose,
  onArtifactSaved,
}: {
  context: MaterialContext;
  onClose: () => void;
  onArtifactSaved?: () => void;
}) {
  const container = useRef<HTMLElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const resize = () => {
      if (container.current)
        setHeight(
          Math.max(
            240,
            window.innerHeight -
              container.current.getBoundingClientRect().top -
              20,
          ),
        );
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, { passive: true });
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize);
    };
  }, []);
  return (
    <aside
      ref={container}
      style={{ height }}
      className="read-editor"
      aria-label="阅读编辑"
    >
      <div className="reading-editor-toolbar">
        <span>阅读编辑</span>
        <button
          className="icon-button"
          aria-label="关闭阅读编辑"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <ChatPanel context={context} onArtifactSaved={onArtifactSaved} compact />
    </aside>
  );
}
