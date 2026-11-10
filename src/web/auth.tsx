import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { api, refreshSession, session } from "./api";
import { ErrorState, Loading } from "./components/ui";
import type { User } from "./types";

const AuthContext = createContext<{
  user: User | null;
  ready: boolean;
  error: Error | null;
  logout: () => Promise<void>;
  reload: () => void;
}>({
  user: null,
  ready: false,
  error: null,
  logout: async () => {},
  reload: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(session.user);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => session.subscribe(setUser), []);
  useEffect(() => {
    let active = true;
    setError(null);
    refreshSession()
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function logout() {
    await api('/auth/logout', 'POST');
    session.set(null);
  }
  return (
    <AuthContext
      value={{
        user,
        ready,
        error,
        logout,
        reload: () => setRevision((value) => value + 1),
      }}
    >
      {children}
    </AuthContext>
  );
}

export const useAuth = () => useContext(AuthContext);

export function Protected({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.ready) return <Loading label="正在恢复登录状态" />;
  if (auth.error) return <ErrorState error={auth.error} retry={auth.reload} />;
  if (!auth.user)
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (admin && auth.user.role !== 'admin')
    return <ErrorState error={new Error('此页面仅供管理员维护公共内容。')} />;
  return children;
}
