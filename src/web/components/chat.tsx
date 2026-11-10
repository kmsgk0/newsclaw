import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  LoaderCircle,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, ApiError, authenticatedFetch, useOperation, useResource } from "../api";
import { useAuth } from "../auth";
import type {
  Artifact,
  Citation,
  Conversation,
  Editor,
  MaterialContext,
  Message,
  PersonalSkill,
} from "../types";
import { ArtifactView } from "./artifact";
import { Prose, Sources } from "./content";
import { MaterialName, MaterialPicker } from "./material-picker";
import { ErrorState, Feedback, Loading, Modal } from "./ui";

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

interface ChatProps {
  context?: MaterialContext;
  conversationId?: string;
  initialSkillId?: string;
  onConversation?: (id: string) => void;
  onContextChange?: (context?: MaterialContext) => void;
  onArtifactSaved?: () => void;
  compact?: boolean;
  chooseMaterial?: boolean;
}

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
  const auth = useAuth();
  const [activeId, setActiveId] = useState(conversationId);
  const activeIdRef = useRef(conversationId);
  const [localContext, setLocalContext] = useState(context);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [skillId, setSkillId] = useState(initialSkillId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tool, setTool] = useState("");
  const [choosing, setChoosing] = useState(chooseMaterial);
  const [following, setFollowing] = useState(true);
  const profile = useResource<Editor>(auth.user ? "/editor" : null);
  const conversation = useResource<Conversation>(
    activeId ? `/conversations/${activeId}` : null,
  );
  const skills = useResource<{ items: PersonalSkill[] }>(
    auth.user ? "/skills/mine" : null,
  );
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const followScroll = useRef(true);
  const effectiveContext =
    localContext ?? conversation.data?.context ?? undefined;
  const contextKind = context?.kind;
  const contextId = context?.id;
  const enabled = skills.data?.items.filter((skill) => skill.enabled) ?? [];
  const previousProps = useRef({ conversationId, contextKind, contextId });
  useEffect(() => {
    const previous = previousProps.current;
    previousProps.current = { conversationId, contextKind, contextId };
    const conversationChanged = previous.conversationId !== conversationId;
    const materialChanged =
      previous.contextKind !== contextKind || previous.contextId !== contextId;
    if (!conversationChanged && !materialChanged) return;
    if (conversationChanged && conversationId === activeIdRef.current) return;
    setChoosing(false);
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    activeIdRef.current = conversationId;
    setActiveId(conversationId);
    setMessages([]);
    setError(null);
    setBusy(false);
    setTool("");
    setText("");
    setLocalContext(
      contextKind ? { kind: contextKind, id: contextId } : undefined,
    );
    followScroll.current = true;
  }, [conversationId, contextKind, contextId]);
  useEffect(() => {
    if (conversation.data?.messages && !controller.current)
      setMessages(conversation.data.messages);
  }, [conversation.data]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useLayoutEffect(() => {
    if (followScroll.current && scroll.current)
      scroll.current.scrollTo({
        top: answerScrollTop(scroll.current),
        behavior: "instant",
      });
  }, [messages, tool]);
  function reset(next?: MaterialContext) {
    setChoosing(false);
    if (onContextChange) {
      onContextChange(next);
      return;
    }
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    activeIdRef.current = undefined;
    setActiveId(undefined);
    setMessages([]);
    setError(null);
    setBusy(false);
    setText("");
    setLocalContext(next);
    setTool("");
    followScroll.current = true;
  }
  async function send(question: string, retry?: Message) {
    if (!question.trim() || controller.current) return;
    const token = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    setTool("");
    followScroll.current = true;
    setFollowing(true);
    const optimisticId = retry?.id ?? crypto.randomUUID();
    let messageId = optimisticId;
    let received = false;
    let finished = false;
    const current = () => token === generation.current;
    const update = (fn: (message: Message) => Message) => {
      if (current())
        setMessages((items) =>
          items.map((message) =>
            message.id === messageId || message.id === optimisticId
              ? fn(message)
              : message,
          ),
        );
    };
    try {
      let id = activeIdRef.current;
      if (!id) {
        const created = await api<Conversation>("/conversations", "POST", {
          title: question.slice(0, 60),
          ...(effectiveContext ? { context: effectiveContext } : {}),
        });
        if (!current()) return;
        id = created.id;
        activeIdRef.current = id;
        setActiveId(id);
        onConversation?.(id);
      }
      const body = retry
        ? { content: question, retryMessageId: retry.id }
        : {
            content: question,
            ...(skillId ? { skillId } : {}),
            ...(effectiveContext ? { context: effectiveContext } : {}),
          };
      const response = await authenticatedFetch(
        `/conversations/${id}/messages`,
        { method: "POST", body: JSON.stringify(body), signal: abort.signal },
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new ApiError(
          response.status,
          payload.code,
          payload.message,
          payload.requestId,
        );
      }
      if (!response.body) throw new Error("没有收到回答内容，请重试。");
      received = true;
      if (current())
        setMessages((items) =>
          retry
            ? items.map((item) =>
                item.id === retry.id
                  ? {
                      ...item,
                      content: "",
                      artifact: undefined,
                      sources: [],
                      status: "pending",
                      error: null,
                    }
                  : item,
              )
            : [
                ...items,
                {
                  id: crypto.randomUUID(),
                  role: "user",
                  content: question,
                  status: "completed",
                  sources: [],
                  createdAt: new Date().toISOString(),
                },
                {
                  id: optimisticId,
                  role: "assistant",
                  content: "",
                  status: "pending",
                  sources: [],
                  createdAt: new Date().toISOString(),
                  request: {
                    content: question,
                    skillId,
                    context: effectiveContext,
                  },
                },
              ],
        );
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      function accept(block: string) {
        if (!current()) return;
        const lines = block.split("\n");
        const name =
          lines
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim() ?? "message";
        const raw = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!raw) return;
        const payload = JSON.parse(raw);
        if (name === "meta") {
          messageId = payload.messageId;
          update((message) => ({
            ...message,
            id: messageId,
            skillId: payload.skill?.id,
            skillName: payload.skill?.name,
          }));
        } else if (name === "tool")
          setTool(
            payload.status === "completed"
              ? ""
              : /search/.test(payload.name)
                ? "正在检索报道"
                : "正在读取材料",
          );
        else if (name === "text")
          update((message) => ({
            ...message,
            content: message.content + payload.text,
          }));
        else if (name === "sources")
          update((message) => ({
            ...message,
            sources: payload.sources as Citation[],
          }));
        else if (name === "artifact")
          update((message) => ({
            ...message,
            artifact: payload.artifact as Artifact,
          }));
        else if (name === "complete") {
          finished = true;
          update((message) => ({
            ...message,
            status: "completed",
            error: null,
            sources: payload.sources ?? message.sources,
            artifact: payload.artifact ?? message.artifact,
            skillName: payload.skill?.name ?? message.skillName,
          }));
        } else if (name === "error") {
          finished = true;
          update((message) => ({ ...message, status: "failed" }));
          throw new ApiError(
            payload.status ?? 500,
            payload.code,
            payload.message,
            payload.requestId,
          );
        }
      }
      while (true) {
        const chunk = await reader.read();
        buffer += decoder
          .decode(chunk.value, { stream: !chunk.done })
          .replaceAll("\r\n", "\n");
        let index;
        while ((index = buffer.indexOf("\n\n")) >= 0) {
          accept(buffer.slice(0, index));
          buffer = buffer.slice(index + 2);
        }
        if (chunk.done) break;
      }
      if (buffer.trim()) accept(buffer);
      if (!finished)
        throw new Error("连接中断，回答尚未完成。可以重试这条问题。");
      if (current()) setText((value) => (value === question ? "" : value));
    } catch (reason) {
      if (current()) {
        const failure = abort.signal.aborted
          ? new Error("回答已停止，已收到的内容保留。")
          : reason instanceof Error
            ? reason
            : new Error("本次回答未完成");
        if (received) {
          setError(null);
          update((message) => ({
            ...message,
            status: "failed",
            error: {
              status: failure instanceof ApiError ? failure.status : 503,
              code:
                failure instanceof ApiError
                  ? failure.code
                  : "DEPENDENCY_UNAVAILABLE",
              message: failure.message,
              ...(failure instanceof ApiError && failure.requestId
                ? { requestId: failure.requestId }
                : {}),
            },
          }));
        } else setError(failure);
      }
    } finally {
      if (current()) {
        setBusy(false);
        setTool("");
        controller.current = null;
        conversation.reload();
      }
    }
  }
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
            {messages.map((message, index) => (
              <article
                key={message.id}
                className={`chat-message ${message.role}`}
              >
                <div className="message-label">
                  {message.role === "user"
                    ? "你"
                    : (profile.data?.name ?? "编辑")}
                  {message.status === "failed" && (
                    <span className="tag red">未完成</span>
                  )}
                  {message.skillId && (
                    <span className="tag">
                      {message.skillName ??
                        skills.data?.items.find(
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
                          void send(
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
                  onClick={() => controller.current?.abort()}
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
