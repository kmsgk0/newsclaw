import { lazy } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { AuthProvider, Protected } from "./auth";
import { Layout } from "./components/layout";
import { ErrorState } from "./components/ui";
import { AuthPage, SettingsPage } from "./pages/account";
import { EventPage } from "./pages/event";
import { FeedPage } from "./pages/feed";
import { LibraryPage } from "./pages/library";
import { NewsPage } from "./pages/news";
import { NotificationsPage } from "./pages/notifications";
import { TrendsPage } from "./pages/trends";

const EditorPage = lazy(() =>
  import("./pages/editor/index").then((module) => ({ default: module.EditorPage })),
);

const SkillsPage = lazy(() =>
  import("./pages/skills").then((module) => ({ default: module.SkillsPage })),
);

const TopicPage = lazy(() =>
  import("./pages/topics/index").then((module) => ({ default: module.TopicPage })),
);

const TopicsPage = lazy(() =>
  import("./pages/topics/index").then((module) => ({ default: module.TopicsPage })),
);

const SharePage = lazy(() =>
  import("./pages/topics/artifacts").then((module) => ({ default: module.SharePage })),
);

const AdminPage = lazy(() =>
  import("./pages/admin/index").then((module) => ({ default: module.AdminPage })),
);

function NotFound() {
  return (
    <div className="not-found">
      <p className="muted">404</p>
      <h1>页面不存在</h1>
      <p>请检查地址，或返回资讯中心。</p>
      <Link to="/" className="button primary">
        回到资讯中心
      </Link>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<FeedPage />} />
            <Route path="news/:id" element={<NewsPage />} />
            <Route path="events/:id" element={<EventPage />} />
            <Route path="trends" element={<TrendsPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route
              path="editor"
              element={
                <Protected>
                  <EditorPage />
                </Protected>
              }
            />
            <Route
              path="topics"
              element={
                <Protected>
                  <TopicsPage />
                </Protected>
              }
            />
            <Route
              path="topics/:id"
              element={
                <Protected>
                  <TopicPage />
                </Protected>
              }
            />
            <Route
              path="library"
              element={
                <Protected>
                  <LibraryPage />
                </Protected>
              }
            />
            <Route
              path="notifications"
              element={
                <Protected>
                  <NotificationsPage />
                </Protected>
              }
            />
            <Route
              path="settings"
              element={
                <Protected>
                  <SettingsPage />
                </Protected>
              }
            />
            <Route
              path="admin"
              element={
                <Protected admin>
                  <AdminPage />
                </Protected>
              }
            />
            <Route path="shares/:token" element={<SharePage />} />
            <Route path="login" element={<AuthPage />} />
            <Route path="register" element={<AuthPage register />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export function AppFailure({ error }: { error: Error }) {
  return <ErrorState error={error} />;
}
