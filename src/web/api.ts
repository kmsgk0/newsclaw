import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "./types";

let accessToken: string | null = null;

let currentUser: User | null = null;

let refreshRequest: Promise<User | null> | null = null;

const listeners = new Set<(user: User | null) => void>();

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const session = {
  get user() {
    return currentUser;
  },
  set(value: { accessToken: string; user: User } | null) {
    accessToken = value?.accessToken ?? null;
    currentUser = value?.user ?? null;
    listeners.forEach((listener) => listener(currentUser));
  },
  subscribe(listener: (user: User | null) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== "OK") {
    throw new ApiError(
      response.status,
      payload?.code ?? "NETWORK_ERROR",
      payload?.message ?? "服务暂不可用，请稍后重试。",
      payload?.requestId,
      payload?.data?.fieldErrors ?? {},
    );
  }
  return payload.data as T;
}

export async function refreshSession(): Promise<User | null> {
  if (refreshRequest) return refreshRequest;
  refreshRequest = (async () => {
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 401) {
      session.set(null);
      return null;
    }
    const value = await parseResponse<{ accessToken: string; user: User }>(
      response,
    );
    session.set(value);
    return value.user;
  })().finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}

export async function authenticatedFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path.startsWith("/api/") ? path : `/api/v1${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(0, "NETWORK_ERROR", "连接失败，请检查网络后重试。");
  }
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return authenticatedFetch(path, init, false);
  }
  return response;
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return parseResponse<T>(
    await authenticatedFetch(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    }),
  );
}

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [revision, setRevision] = useState(0);
  const [userId, setUserId] = useState(session.user?.id);
  useEffect(() => session.subscribe((user) => setUserId(user?.id)), []);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const previousPath = useRef(path);
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (previousPath.current !== path) {
      setData(null);
      previousPath.current = path;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<T>(path, "GET", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason : new Error("读取失败"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, userId]);
  return { data, error, loading, reload, setData };
}

export function useOperation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const clear = useCallback(() => {
    setError(null);
    setNotice("");
  }, []);
  const inFlight = useRef(false);
  async function run<T>(
    operation: () => Promise<T>,
    success?: (value: T) => void,
    message?: string,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const value = await operation();
      success?.(value);
      if (message) setNotice(message);
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("操作失败"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    notice,
    run,
    clear,
  };
}

export function query(
  values: Record<string, string | number | boolean | null | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  return params.toString();
}

export const operationId = () => crypto.randomUUID();
