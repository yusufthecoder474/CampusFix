import { useEffect, useRef, type ReactNode } from "react";
import { Status } from "./components";
import type { MaintenanceRequest } from "./api";
export function Pagination({
  page,
  total,
  limit,
  onPage,
  previous = "Previous",
  next = "Next",
  label = "Request pages",
  prefix = "Page",
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  previous?: string;
  next?: string;
  label?: string;
  prefix?: string;
}) {
  return (
    <nav className="pagination" aria-label={label}>
      <button disabled={page === 1} onClick={() => onPage(page - 1)}>
        {previous}
      </button>
      <span aria-live="polite">
        {prefix} {page} of {Math.max(1, Math.ceil(total / limit))}
      </span>
      <button disabled={page * limit >= total} onClick={() => onPage(page + 1)}>
        {next}
      </button>
    </nav>
  );
}
export function RequestCard({ item }: { item: MaintenanceRequest }) {
  return (
    <li>
      <div>
        <a href={"#/requests/" + item.id}>{item.title}</a>
        <p>
          {item.location} <span aria-hidden="true">·</span>{" "}
          {new Date(item.createdAt).toLocaleDateString()}
        </p>
      </div>
      <Status value={item.status} />
    </li>
  );
}
export function EmptyState({
  title = "No requests to show",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function ConfirmDialog({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <p>Check this decision before updating the request.</p>
      <div className="form-actions">
        <button autoFocus onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" onClick={onConfirm}>
          Confirm change
        </button>
      </div>
    </dialog>
  );
}
