import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileText,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ApiError } from "../api";


export function Loading({ label = "正在读取内容" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={18} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!(error instanceof ApiError)) return;
    const form = element.current?.closest("form");
    let first: HTMLElement | null = null;
    for (const [name, message] of Object.entries(error.fields)) {
      const field =
        form?.elements.namedItem(name) ??
        form?.elements.namedItem(name.split(".").at(-1) ?? name);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) {
        field.setCustomValidity(message);
        field.dispatchEvent(new Event("invalid", { bubbles: true }));
        first ??= field;
      }
    }
    first?.focus();
  }, [error]);
  return (
    <div ref={element} className="error-state" role="alert">
      <CircleAlert size={18} />
      <div>
        <strong>
          {error instanceof ApiError && Object.keys(error.fields).length
            ? [...new Set(Object.values(error.fields))].join("；")
            : error.message}
        </strong>
        {error instanceof ApiError &&
          error.status >= 500 &&
          error.requestId && (
            <details>
              <summary>错误详情</summary>
              <small>请求标识：{error.requestId}</small>
            </details>
          )}
      </div>
      {retry && (
        <button className="button secondary small" onClick={retry}>
          <RefreshCw size={14} />
          重试
        </button>
      )}
    </div>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FileText size={25} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="notice" role="status">
      <CheckCircle2 size={16} />
      {children}
    </p>
  );
}

export function Feedback({
  operation,
}: {
  operation: { error: Error | null; notice: string };
}) {
  return (
    <>
      {operation.error && <ErrorState error={operation.error} />}
      {operation.notice && <Notice>{operation.notice}</Notice>}
    </>
  );
}

export function PageHeading({
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </header>
  );
}

export function SectionHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  formatError,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  formatError?: string;
}) {
  const id = useId();
  const [error, setError] = useState("");
  function validate(target: EventTarget) {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      const validity = target.validity;
      let message = "";
      if (validity.customError) message = target.validationMessage;
      else if (validity.valueMissing) message = `请填写${label}`;
      else if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (
          target.value &&
          target.minLength > 0 &&
          target.value.length < target.minLength
        )
          message = `${label}至少需要 ${target.minLength} 个字符`;
        else if (
          target.maxLength >= 0 &&
          target.value.length > target.maxLength
        )
          message = `${label}不能超过 ${target.maxLength} 个字符`;
        else if (validity.patternMismatch)
          message = formatError ?? `${label}格式不正确`;
        else if (validity.typeMismatch) message = `请输入有效的${label}`;
        else if (target instanceof HTMLInputElement && validity.rangeUnderflow)
          message = `${label}不能小于 ${target.min}`;
        else if (target instanceof HTMLInputElement && validity.rangeOverflow)
          message = `${label}不能大于 ${target.max}`;
        else if (!validity.valid) message = `${label}格式或取值不正确`;
      }
      target.setCustomValidity(message);
      setError(message);
    }
  }
  return (
    <div
      className={`field ${error ? "field-invalid" : ""}`}
      onBlur={(event) => validate(event.target)}
      onInvalid={(event) => validate(event.target)}
      onInput={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement
        )
          target.setCustomValidity("");
        setError("");
      }}
    >
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        typeof child.type === "string" &&
        ["input", "textarea", "select"].includes(child.type)
          ? cloneElement(
              child as ReactElement<{
                id?: string;
                "aria-describedby"?: string;
                "aria-invalid"?: boolean;
              }>,
              { id, "aria-describedby": `${id}-help`, "aria-invalid": !!error },
            )
          : child,
      )}
      <small id={`${id}-help`} className={error ? "field-error" : ""}>
        {error || hint}
      </small>
    </div>
  );
}

export function Tabs({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; count?: number }[];
  onChange: (value: string) => void;
}) {
  return (
    <nav className="tabs" aria-label="页面分区">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "selected" : ""}
          aria-current={value === option.value ? "page" : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </nav>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (value: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="pagination">
      <span>
        共 {total} 条 · 第 {page} / {Math.ceil(total / pageSize)} 页
      </span>
      <div>
        <button
          className="button secondary small"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ArrowLeft size={14} />
          上一页
        </button>
        <button
          className="button secondary small"
          disabled={page * pageSize >= total}
          onClick={() => onChange(page + 1)}
        >
          下一页
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function formatDate(value?: string, withTime = false) {
  if (!value) return "尚未记录";
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+08:00` : value,
  );
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "long",
        day: "numeric",
        ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
      }).format(date);
}

export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) {
      previousFocus.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else if (!open && dialog.current?.open) {
      dialog.current.close();
      previousFocus.current?.focus();
    }
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="关闭对话框"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
