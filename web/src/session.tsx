import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiClient, ApiError, message, type Session } from "./api";
interface Auth {
  session: Session | null;
  api: ApiClient;
  loading: boolean;
  error: string;
  notice: string;
  retry: () => void;
  accept: (s: Session) => void;
  logout: () => Promise<void>;
  expired: () => void;
  loggingOut: boolean;
}
const AuthContext = createContext<Auth | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient(),
    [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [retryKey, setRetry] = useState(0),
    [loggingOut, setLoggingOut] = useState(false);
  const expired = useCallback(() => {
    void client.cancelQueries();
    client.clear();
    setSession(null);
    setNotice("Your session has expired. Please sign in again.");
  }, [client]);
  const [api] = useState(() => new ApiClient(expired));
  useEffect(() => {
    let active = true;
    const c = new AbortController();
    setLoading(true);
    setError("");
    void api
      .me(c.signal)
      .then((s) => {
        if (active) {
          setSession(s);
          setNotice("");
        }
      })
      .catch((e) => {
        if (active && !c.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) setNotice("");
          else setError(message(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [api, retryKey]);
  const accept = useCallback(
    (s: Session) => {
      client.clear();
      setSession(s);
      setNotice("");
      setError("");
    },
    [client],
  );
  const retry = useCallback(() => setRetry((x) => x + 1), []);
  const logout = useCallback(async () => {
    setLoggingOut(true);
    setError("");
    try {
      await api.logout();
      await client.cancelQueries();
      client.clear();
      setSession(null);
      setNotice("You have signed out.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError("");
      else setError(message(e));
    } finally {
      setLoggingOut(false);
    }
  }, [api, client]);
  // Stable context avoids reconnecting consumers when unrelated local UI state changes.
  const value = useMemo(
    () => ({
      session,
      api,
      loading,
      error,
      notice,
      retry,
      accept,
      logout,
      expired,
      loggingOut,
    }),
    [
      session,
      api,
      loading,
      error,
      notice,
      retry,
      accept,
      logout,
      expired,
      loggingOut,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useSession() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("SessionProvider is required");
  return value;
}
