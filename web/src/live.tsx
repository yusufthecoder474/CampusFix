import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "./session";
import { invalidateRequest } from "./queries";
export interface Change {
  requestId: string;
  version: number;
  action: string;
}
export interface Notification extends Change {
  key: string;
  time: number;
  read: boolean;
}
export function acceptVersion(seen: Map<string, number>, event: Change) {
  const old = seen.get(event.requestId) ?? -1;
  if (event.version <= old) return false;
  seen.set(event.requestId, event.version);
  if (seen.size > 200) seen.delete(seen.keys().next().value!);
  return true;
}
export function useLive() {
  const { session, expired } = useSession(),
    client = useQueryClient(),
    socketRef = useRef<Socket | null>(null),
    seen = useRef(new Map<string, number>());
  const [status, setStatus] = useState("Connecting"),
    [notifications, setNotifications] = useState<Notification[]>([]);
  useEffect(() => {
    if (!session) return;
    seen.current.clear();
    setNotifications([]);
    setStatus("Connecting");
    const socket = io({
      transports: ["websocket"],
      auth: { csrfToken: session.csrfToken },
      reconnectionAttempts: 6,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 5000,
      autoConnect: false,
    });
    socketRef.current = socket;
    const connect = () => {
      setStatus("Live");
      void client.invalidateQueries({ queryKey: ["requests"] });
      void client.invalidateQueries({ queryKey: ["request"] });
      void client.invalidateQueries({ queryKey: ["history"] });
    };
    const changed = (event: Change) => {
      if (
        !event ||
        typeof event.requestId !== "string" ||
        !Number.isInteger(event.version) ||
        typeof event.action !== "string" ||
        !acceptVersion(seen.current, event)
      )
        return;
      void invalidateRequest(client, event.requestId);
      setNotifications((old) =>
        [
          {
            ...event,
            key: event.requestId + ":" + event.version,
            time: Date.now(),
            read: false,
          },
          ...old,
        ].slice(0, 30),
      );
    };
    const disconnect = () => setStatus("Offline"),
      reconnecting = () => setStatus("Reconnecting"),
      failed = () => setStatus("Offline — reconnect manually"),
      sessionExpired = () => {
        socket.disconnect();
        expired();
      };
    const error = (e: Error) => {
      if (
        e.message === "AUTHENTICATION_REQUIRED" ||
        e.message === "CSRF_REJECTED"
      ) {
        socket.disconnect();
        void client.cancelQueries();
        expired();
      } else setStatus("Offline");
    };
    socket
      .on("connect", connect)
      .on("disconnect", disconnect)
      .on("connect_error", error)
      .on("session:expired", sessionExpired)
      .on("request:changed", changed)
      .on("live:unavailable", failed);
    socket.io
      .on("reconnect_attempt", reconnecting)
      .on("reconnect_failed", failed);
    socket.connect();
    return () => {
      socket
        .off("connect", connect)
        .off("disconnect", disconnect)
        .off("connect_error", error)
        .off("session:expired", sessionExpired)
        .off("request:changed", changed)
        .off("live:unavailable", failed);
      socket.io
        .off("reconnect_attempt", reconnecting)
        .off("reconnect_failed", failed);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session, client, expired]);
  return {
    status,
    notifications,
    markRead: () =>
      setNotifications((old) => old.map((n) => ({ ...n, read: true }))),
    reconnect: () => socketRef.current?.connect(),
  };
}
