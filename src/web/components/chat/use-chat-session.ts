import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, authenticatedFetch, useResource } from "../../api";
import { useAuth } from "../../auth";
import type { Artifact, Citation, Conversation, Editor, MaterialContext, Message, PersonalSkill } from "../../types";
import type { ChatProps } from "./types";
import { consumeChatEvents } from "./stream";

type SessionOptions = Pick<ChatProps, 'context' | 'conversationId' | 'initialSkillId' | 'onConversation' | 'onContextChange'> & {
  onReset: () => void;
  onSendStart: () => void;
};

export function useChatSession({ context, conversationId, initialSkillId = '', onConversation, onContextChange, onReset, onSendStart }: SessionOptions) {
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
  const profile = useResource<Editor>(auth.user ? "/editor" : null);
  const conversation = useResource<Conversation>(
    activeId ? `/conversations/${activeId}` : null,
  );
  const skills = useResource<{ items: PersonalSkill[] }>(
    auth.user ? "/skills/mine" : null,
  );
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const effectiveContext =
    localContext ?? conversation.data?.context ?? undefined;
  const contextKind = context?.kind;
  const contextId = context?.id;
  const enabled = skills.data?.items.filter((skill) => skill.enabled) ?? [];
  const clearConversation = useCallback((id?: string, next?: MaterialContext) => {
    onReset();
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    activeIdRef.current = id;
    setActiveId(id);
    setMessages([]);
    setError(null);
    setBusy(false);
    setTool("");
    setText("");
    setLocalContext(next);
  }, [onReset]);
  const previousProps = useRef({ conversationId, contextKind, contextId });
  useEffect(() => {
    const previous = previousProps.current;
    previousProps.current = { conversationId, contextKind, contextId };
    const conversationChanged = previous.conversationId !== conversationId;
    const materialChanged =
      previous.contextKind !== contextKind || previous.contextId !== contextId;
    if (!conversationChanged && !materialChanged) return;
    if (conversationChanged && conversationId === activeIdRef.current) return;
    clearConversation(conversationId, contextKind ? { kind: contextKind, id: contextId } : undefined);
  }, [conversationId, contextKind, contextId, clearConversation]);
  useEffect(() => {
    if (conversation.data?.id === activeIdRef.current && conversation.data?.messages && !controller.current)
      setMessages(conversation.data.messages);
  }, [conversation.data]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  function reset(next?: MaterialContext) {
    if (onContextChange) {
      onReset();
      onContextChange(next);
      return;
    }
    clearConversation(undefined, next);
  }
  async function send(question: string, retry?: Message) {
    if (!question.trim() || controller.current) return;
    const token = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    setTool("");
    onSendStart();
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
      function accept(name: string, raw: string) {
        if (!current()) return;
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
      await consumeChatEvents(response.body, accept);
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
  return { auth, activeId, effectiveContext, localContext, messages, text, setText, skillId, setSkillId,
    busy, error, tool, enabled, profile, conversation, skills, reset, send, stop: () => controller.current?.abort() };
}
