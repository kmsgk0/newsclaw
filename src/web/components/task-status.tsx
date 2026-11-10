import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Task } from "../types";
import { ErrorState } from "./ui";

export function TaskWatch({
  task: initial,
  onComplete,
}: {
  task: Task;
  onComplete?: () => void;
}) {
  const [task, setTask] = useState(initial);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(() => {
    setTask(initial);
    setError(null);
  }, [initial]);
  useEffect(() => {
    if (task.status === "succeeded" || task.status === "failed" || error)
      return;
    let active = true;
    const timer = setTimeout(() => {
      api<Task>(task.statusUrl ?? `/tasks/${task.taskId ?? task.id}`)
        .then((next) => {
          if (active) {
            setTask(next);
            if (next.status === "succeeded" || next.status === "failed")
              complete.current?.();
          }
        })
        .catch((reason) => {
          if (active) setError(reason);
        });
    }, 1200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [task, revision, error]);
  const empty = task.result?.status === "empty" || task.result?.skipped;
  const message =
    task.status === "succeeded" && empty
      ? String(task.result?.message ?? "没有待整理的新内容")
      : {
          pending: "已接收，等待处理",
          running: "正在处理",
          succeeded: "处理完成",
          failed: "本次处理失败",
        }[task.status];
  return (
    <div className={`task-status ${task.status}`} role="status">
      {task.status === "succeeded" ? (
        <CheckCircle2 size={18} />
      ) : task.status === "failed" ? (
        <CircleAlert size={18} />
      ) : (
        <LoaderCircle size={18} className="spin" />
      )}
      <div>
        <strong>{message}</strong>
        {task.error && (
          <small>
            {typeof task.error === "string" ? task.error : task.error.message}
          </small>
        )}
        {error && (
          <ErrorState
            error={error}
            retry={() => {
              setError(null);
              setRevision((value) => value + 1);
            }}
          />
        )}
      </div>
    </div>
  );
}
