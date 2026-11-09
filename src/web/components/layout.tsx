import {
  Bell,
  Bookmark,
  Compass,
  FolderOpen,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useOperation, useResource } from "../api";
import { useAuth } from "../auth";
import { Feedback, Loading } from "./ui";


const navigation = [
  { to: "/", label: "资讯中心", icon: Compass, end: true },
  { to: "/editor", label: "我的编辑", icon: MessageCircle },
  { to: "/skills", label: "阅读技能", icon: Sparkles },
  { to: "/trends", label: "站内热点", icon: TrendingUp },
  { to: "/topics", label: "我的专题", icon: FolderOpen },
];

export function Layout() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const logout = useOperation();
  const messages = useResource<{ unreadCount: number }>(
    auth.user ? "/notifications?pageSize=1" : null,
  );
  const count = messages.data?.unreadCount ?? 0;
  const reloadMessages = messages.reload;
  const section =
    navigation.find(
      (item) => item.to !== "/" && location.pathname.startsWith(item.to),
    )?.label ??
    {
      "/library": "收藏与记录",
      "/notifications": "消息与关注",
      "/settings": "账号设置",
      "/admin": "管理工作台",
    }[location.pathname] ??
    "资讯中心";
  useEffect(() => {
    setOpen(false);
    document.title = `${section} · NewsClaw`;
    window.scrollTo(0, 0);
  }, [location.pathname, section]);
  useEffect(() => {
    window.addEventListener("newsclaw:notifications", reloadMessages);
    return () =>
      window.removeEventListener("newsclaw:notifications", reloadMessages);
  }, [reloadMessages]);
  const editorWorkspace =
    location.pathname === "/editor" &&
    (!new URLSearchParams(location.search).get("view") ||
      new URLSearchParams(location.search).get("view") === "chat");
  return (
    <div className={`app-shell ${editorWorkspace ? "workspace-shell" : ""}`}>
      <a href="#main-content" className="skip-link">
        跳转到内容
      </a>
      <header className="topbar">
        <div className="topbar-brand">
          <button
            className="icon-button mobile-menu"
            aria-label={open ? "关闭导航" : "打开导航"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
          <Link className="brand" to="/">
            <img src="/favicon.svg" alt="" />
            <span>NewsClaw</span>
          </Link>
        </div>
        <span className="topbar-section">{section}</span>
        <div className="topbar-actions">
          {location.pathname !== "/" && (
            <Link
              to="/?focus=search"
              className="icon-button"
              aria-label="搜索新闻"
            >
              <Search size={19} />
            </Link>
          )}
          <Link
            to="/notifications"
            className="icon-button notification-button"
            aria-label={
              count ? `查看更新提醒，${count} 条未读` : "查看更新提醒"
            }
          >
            <Bell size={19} />
            {count > 0 && (
              <span className="notification-badge">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
          {auth.user ? (
            <Link to="/settings" className="account-button">
              <span className="avatar">
                {auth.user.username.slice(0, 1).toUpperCase()}
              </span>
              <span>{auth.user.username}</span>
            </Link>
          ) : (
            <Link className="button primary small" to="/login">
              登录
            </Link>
          )}
        </div>
      </header>
      {open && (
        <button
          className="nav-scrim"
          aria-label="关闭导航遮罩"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <p className="nav-label">阅读</p>
        <nav aria-label="主导航">
          {navigation.map(({ icon: Icon, ...item }) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="nav-label nav-secondary">个人空间</p>
        <nav aria-label="个人空间">
          <NavLink
            to="/library"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Bookmark size={18} />
            收藏与记录
          </NavLink>
          <NavLink
            to="/notifications"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Bell size={18} />
            消息与关注{count > 0 && <span className="nav-count">{count}</span>}
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Settings size={18} />
            账号设置
          </NavLink>
          {auth.user?.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Shield size={18} />
              管理工作台
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          {auth.user && (
            <button
              className="nav-item logout"
              disabled={logout.busy}
              onClick={() => logout.run(auth.logout, () => navigate("/"))}
            >
              <LogOut size={17} />
              退出登录
            </button>
          )}
          <Feedback operation={logout} />
          <p className="sidebar-footer">NewsClaw</p>
        </div>
      </aside>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Suspense fallback={<Loading label="正在打开页面" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
