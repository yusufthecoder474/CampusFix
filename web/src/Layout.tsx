import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "./session";
import { useLive, type Notification } from "./live";
import { Alert } from "./components";
export function NotificationList({ items }: { items: Notification[] }) {
  return (
    <section className="notification-list" aria-label="Recent notifications">
      <h2>Recent updates</h2>
      {items.length === 0 ? (
        <p>No live updates in this session.</p>
      ) : (
        <ul>
          {items.map((n) => (
            <li key={n.key}>
              <a href={"#/requests/" + n.requestId}>
                {n.action} · request progress changed
              </a>
              <time dateTime={new Date(n.time).toISOString()}>
                {new Date(n.time).toLocaleTimeString()}
              </time>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Session-only notifications. Reconnect refreshes authoritative progress.
      </p>
    </section>
  );
}
export function Sidebar() {
  const { session, logout, loggingOut } = useSession();
  if (!session) return null;
  const role = session.user.role;
  return (
    <aside className="sidebar">
      <NavLink className="brand" to="/">
        C<span>+</span> CampusFix
      </NavLink>
      <p className="sidebar-label">WORKSPACE</p>
      <nav aria-label="Main navigation">
        <NavLink end to="/">
          {role === "student"
            ? "My requests"
            : role === "coordinator"
              ? "Campus requests"
              : "My work"}
        </NavLink>
        {role === "student" && <NavLink to="/new">Report an issue</NavLink>}
      </nav>
      <div className="account">
        <strong>{session.user.displayName}</strong>
        <span>{role}</span>
        <button disabled={loggingOut} onClick={() => void logout()}>
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
export function AppLayout() {
  const { session, error } = useSession(),
    live = useLive(),
    [open, setOpen] = useState(false);
  if (!session) return null;
  const unread = live.notifications.filter((n) => !n.read).length;
  return (
    <div className="app-layout">
      <a
        className="skip"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <Sidebar />
      <main id="main-content" className="workspace" tabIndex={-1}>
        <header className="workspace-toolbar">
          <span role="status">Connection: {live.status}</span>
          {live.status.startsWith("Offline") && (
            <button onClick={live.reconnect}>Reconnect live updates</button>
          )}
          <button
            aria-expanded={open}
            aria-controls="notifications"
            onClick={() => {
              setOpen((v) => !v);
              live.markRead();
            }}
          >
            Notifications ({unread})
          </button>
        </header>
        <div className="sr-only" aria-live="polite">
          {unread > 0 ? `${unread} unread request updates` : ""}
        </div>
        {open && (
          <div id="notifications">
            <NotificationList items={live.notifications} />
          </div>
        )}
        {error && <Alert text={error} />}
        <Outlet />
        <footer>CampusFix · Campus care, made clear.</footer>
      </main>
    </div>
  );
}
