import { ChevronRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, session, useOperation } from "../api";
import { useAuth } from "../auth";
import { Feedback, Field, PageHeading } from "../components/ui";
import type { User } from "../types";


export function AuthPage({ register = false }: { register?: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const operation = useOperation();
  const clearFeedback = operation.clear;
  useEffect(() => clearFeedback(), [register, clearFeedback]);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedTarget = params.get("returnTo");
  const target =
    requestedTarget?.startsWith("/") && !requestedTarget.startsWith("//")
      ? requestedTarget
      : "/editor";
  async function submit(event: FormEvent) {
    event.preventDefault();
    await operation.run(
      async () => {
        if (register)
          await api("/auth/register", "POST", { username, password });
        return api<{ accessToken: string; user: User }>("/auth/login", "POST", {
          username,
          password,
        });
      },
      (value) => {
        session.set(value);
        navigate(target, { replace: true });
      },
    );
  }
  return (
    <section className="panel auth-form">
      <h1>{register ? "创建账号" : "登录 NewsClaw"}</h1>
      <p className="muted">
        {register ? "保存收藏、专题和个人编辑会话。" : "登录后继续阅读和整理。"}
      </p>
      <form onSubmit={submit}>
        <Field
          label="用户名"
          formatError="用户名只能包含文字、数字、下划线和连字符"
          hint={
            register
              ? "3 至 32 个字符，可使用中文、字母、数字、下划线或短横线。"
              : undefined
          }
        >
          <input
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            pattern={register ? "[\\p{L}\\p{N}_\\-]+" : undefined}
            value={username}
            onChange={(event) => {
              operation.clear();
              setUsername(event.target.value);
            }}
          />
        </Field>
        <Field label="密码" hint={register ? "8 至 128 个字符。" : undefined}>
          <input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete={register ? "new-password" : "current-password"}
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(event) => {
              operation.clear();
              setPassword(event.target.value);
            }}
          />
          <button
            type="button"
            className="password-visibility text-link"
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
            {visible ? "隐藏密码" : "显示密码"}
          </button>
        </Field>
        <Feedback operation={operation} />
        <button className="button primary full" disabled={operation.busy}>
          {operation.busy
            ? "正在处理"
            : register
              ? "创建账号并开始阅读"
              : "登录"}
        </button>
      </form>
      <p className="auth-switch">
        {register ? "已有账号？" : "还没有账号？"}{" "}
        <Link
          to={`${register ? "/login" : "/register"}?returnTo=${encodeURIComponent(target)}`}
        >
          {register ? "去登录" : "创建账号"}
        </Link>
      </p>
      <Link className="text-link" to="/">
        浏览公共资讯
        <ChevronRight size={15} />
      </Link>
    </section>
  );
}

export function SettingsPage() {
  const auth = useAuth();
  const operation = useOperation();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const navigate = useNavigate();
  return (
    <>
      <PageHeading title="账号设置" />
      <section className="panel narrow-panel">
        <h2>当前账号</h2>
        <p className="account-name">
          {auth.user?.username}
          <span className="tag">
            {auth.user?.role === "admin" ? "管理员" : "普通用户"}
          </span>
        </p>
        <hr />
        <h2>修改密码</h2>
        <p className="muted">修改后需要重新登录。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void operation.run(
              () => api("/auth/password", "POST", { oldPassword, newPassword }),
              () => {
                session.set(null);
                navigate("/login");
              },
            );
          }}
        >
          <Field label="当前密码">
            <input
              type="password"
              name="oldPassword"
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              required
              value={oldPassword}
              onChange={(event) => {
                operation.clear();
                setOldPassword(event.target.value);
              }}
            />
          </Field>
          <Field label="新密码" hint="8 至 128 个字符。">
            <input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(event) => {
                operation.clear();
                setNewPassword(event.target.value);
              }}
            />
          </Field>
          <Feedback operation={operation} />
          <button className="button primary" disabled={operation.busy}>
            保存新密码
          </button>
        </form>
      </section>
    </>
  );
}
