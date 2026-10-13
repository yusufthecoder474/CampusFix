import { ConfirmDialog } from "./ui";
import {
  useWorkflowMutation,
  useTechnicians,
  useRequestHistory,
} from "./queries";
import { useState, type FormEvent } from "react";
import {
  ApiError,
  message,
  type ApiClient,
  type MaintenanceRequest,
  type Session,
} from "./api";
import { Alert, Loading } from "./components";
export function WorkflowControls({
  api,
  item,
  user,
  onChanged,
}: {
  api: ApiClient;
  item: MaintenanceRequest;
  user: Session["user"];
  onChanged: (notice: string) => void;
}) {
  const [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState(1),
    [confirmation, setConfirmation] = useState<{
      action: string;
      extra: object;
    } | null>(null);
  const mutation = useWorkflowMutation(api, item.id),
    busy = mutation.isPending;
  const assigning = user.role === "coordinator" && item.status === "available";
  const lookup = useTechnicians(api, page, assigning),
    people = lookup.data,
    lookupError = lookup.error ? message(lookup.error) : "";
  async function send(action: string, extra: object = {}) {
    if (busy) return;
    setError("");
    try {
      await mutation.mutateAsync({
        action,
        expectedVersion: item.version,
        ...extra,
      });
      onChanged("Request updated. Progress has been refreshed.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onChanged(message(e));
      else
        setError(
          message(e) +
            " Refresh progress before retrying if the outcome is uncertain.",
        );
    }
  }
  function submitNote(e: FormEvent, action: string) {
    e.preventDefault();
    if (!note.trim()) {
      setError("Enter an operational note before continuing.");
      return;
    }
    void send(action, { note: note.trim() });
  }
  const canResolve =
    user.role === "technician" &&
    item.assigneeId === user.id &&
    item.status === "in_progress";
  const canConfirm =
    user.role === "student" &&
    item.reporterId === user.id &&
    item.status === "resolved";
  return (
    <section className="workflow" aria-label="Request actions">
      <h3>Next action</h3>
      {error && <Alert text={error} />}
      {confirmation && (
        <ConfirmDialog
          title={
            confirmation.action === "assign"
              ? "Assign this technician?"
              : "Close this request?"
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            const choice = confirmation;
            setConfirmation(null);
            void send(choice.action, choice.extra);
          }}
        />
      )}
      <fieldset disabled={busy}>
        <legend className="sr-only">Permitted workflow actions</legend>
        {user.role === "coordinator" && item.status === "reported" ? (
          <button className="primary" onClick={() => void send("triage")}>
            Triage request
          </button>
        ) : assigning ? (
          <>
            {lookupError ? (
              <>
                <Alert text={lookupError} />
                <button onClick={() => void lookup.refetch()}>
                  Retry technicians
                </button>
              </>
            ) : !people ? (
              <Loading text="Loading technicians…" />
            ) : people.total === 0 ? (
              <p>No technicians are available in the directory.</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (selected)
                    setConfirmation({
                      action: "assign",
                      extra: { technicianId: selected },
                    });
                }}
              >
                <label htmlFor="technician">Assign technician</label>
                <select
                  id="technician"
                  required
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Choose a technician</option>
                  {people.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
                <div className="form-actions">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => {
                      setSelected("");
                      setPage((p) => p - 1);
                    }}
                  >
                    Previous technicians
                  </button>
                  <span>Directory page {page}</span>
                  <button
                    type="button"
                    disabled={page * people.limit >= people.total}
                    onClick={() => {
                      setSelected("");
                      setPage((p) => p + 1);
                    }}
                  >
                    Next technicians
                  </button>
                </div>
                <button className="primary" disabled={!selected}>
                  Assign request
                </button>
              </form>
            )}
          </>
        ) : canResolve || canConfirm ? (
          <>
            <form
              onSubmit={(e) => submitNote(e, canResolve ? "resolve" : "reopen")}
            >
              <label htmlFor="workflow-note">
                {canResolve ? "Resolution note" : "Reason for reopening"}
              </label>
              <textarea
                id="workflow-note"
                required
                maxLength={2000}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-describedby="note-hint"
              />
              <p id="note-hint" className="hint">
                Operational details only, up to 2,000 characters.
              </p>
              <button className="primary">
                {canResolve ? "Mark resolved" : "Reopen request"}
              </button>
            </form>
            {canConfirm && (
              <button
                onClick={() => setConfirmation({ action: "close", extra: {} })}
              >
                Confirm and close
              </button>
            )}
          </>
        ) : (
          <p>
            {item.status === "closed"
              ? "This request is closed."
              : "No action is currently available to your account."}
          </p>
        )}
      </fieldset>
      {busy && <Loading text="Saving change…" />}
    </section>
  );
}
export function RequestHistory({ api, id }: { api: ApiClient; id: string }) {
  const [page, setPage] = useState(1);
  const result = useRequestHistory(api, id, page),
    data = result.data,
    error = result.error ? message(result.error) : "";
  return (
    <section className="workflow" aria-label="Progress history">
      <h3>Progress history</h3>
      {error ? (
        <>
          <Alert text={error} />
          <button onClick={() => void result.refetch()}>Retry history</button>
        </>
      ) : !data ? (
        <Loading text="Loading progress…" />
      ) : (
        <>
          {data.items.length === 0 ? (
            <p>No history has been recorded.</p>
          ) : (
            <ol className="timeline">
              {data.items.map((e) => (
                <li key={e.id}>
                  <strong>
                    {e.action.replaceAll("_", " ")} →{" "}
                    {e.nextStatus.replaceAll("_", " ")}
                  </strong>
                  <p>
                    {e.actorRole} · {new Date(e.createdAt).toLocaleString()}
                    {e.requestVersion === null
                      ? " · historical event"
                      : ` · version ${e.requestVersion}`}
                  </p>
                  {e.note && <p className="preserve">{e.note}</p>}
                </li>
              ))}
            </ol>
          )}
          <nav className="pagination" aria-label="History pages">
            <button disabled={page === 1} onClick={() => setPage((x) => x - 1)}>
              Newer events
            </button>
            <span aria-live="polite">
              History page {page} of{" "}
              {Math.max(1, Math.ceil(data.total / data.limit))}
            </span>
            <button
              disabled={page * data.limit >= data.total}
              onClick={() => setPage((x) => x + 1)}
            >
              Older events
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
