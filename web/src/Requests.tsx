import { RequestFilters, type Filters } from "./RequestFilters";
import { Pagination, RequestCard, EmptyState } from "./ui";
import { useRequests, useRequestDetails, useCreateRequest } from "./queries";
import { WorkflowControls, RequestHistory } from "./Workflow";
import type { Session } from "./api";
import { useEffect, useState, type FormEvent } from "react";
import { type ApiClient, type Role, message } from "./api";
import { Alert, Loading, PageTitle, Status } from "./components";
export function RequestList({ api, role }: { api: ApiClient; role: Role }) {
  const [query, setQuery] = useState({
      status: "",
      location: "",
      page: 1,
      limit: 10,
    }),
    [validationError, setValidationError] = useState("");
  const result = useRequests(api, role, query),
    data = result.data,
    error = validationError || (result.error ? message(result.error) : "");
  function filter(values: Filters) {
    if (values.location && values.location.length < 2) {
      setValidationError("Location must contain at least 2 characters.");
      return;
    }
    setValidationError("");
    const next = { ...values, page: 1 };
    if (
      next.page === query.page &&
      next.limit === query.limit &&
      next.status === query.status &&
      next.location === query.location
    )
      void result.refetch();
    setQuery(next);
  }
  const title =
    role === "student"
      ? "My requests"
      : role === "coordinator"
        ? "Campus requests"
        : "Available & assigned work";
  return (
    <>
      <PageTitle
        title={title}
        subtitle={
          role === "student"
            ? "Report an issue and keep track of your campus spaces."
            : role === "coordinator"
              ? "View maintenance reports across the campus."
              : "View work available to your role and requests already assigned to you."
        }
      />
      {role === "student" ? (
        <a className="primary action-link" href="#/new">
          + Report an issue
        </a>
      ) : (
        <p className="notice">
          Viewing only in this list. Open a request for permitted actions.
        </p>
      )}
      <section className="panel">
        <RequestFilters onApply={filter} />
      </section>
      {error ? (
        <>
          <Alert text={error} />
          <button onClick={() => void result.refetch()}>Retry loading</button>
        </>
      ) : !data ? (
        <Loading />
      ) : (
        <section className="panel" aria-label="Request results">
          <div className="list-summary">
            <h2>Maintenance requests</h2>
            <span>
              {data.total} matching {data.total === 1 ? "request" : "requests"}
            </span>
          </div>
          {data.items.length === 0 ? (
            <EmptyState>
              {role === "technician"
                ? "No available or assigned work matches your filters."
                : "Try different filters, or check back after a request is submitted."}
            </EmptyState>
          ) : (
            <ul className="request-list">
              {data.items.map((item) => (
                <RequestCard key={item.id} item={item} />
              ))}
            </ul>
          )}
          <Pagination
            page={query.page}
            total={data.total}
            limit={query.limit}
            onPage={(page) => setQuery((q) => ({ ...q, page }))}
          />
        </section>
      )}
    </>
  );
}
export function RequestDetail({
  api,
  id,
  user,
}: {
  api: ApiClient;
  id: string;
  user?: Session["user"];
}) {
  const [notice, setNotice] = useState("");
  useEffect(() => setNotice(""), [id]);
  const result = useRequestDetails(api, id),
    item = result.data?.request,
    error = result.error ? message(result.error) : "";
  return (
    <>
      <a className="back" href="#/">
        ← Back to requests
      </a>
      <PageTitle
        title="Request details"
        subtitle="The latest information for this maintenance report."
      />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {error ? (
        <>
          <Alert text={error} />
          <button onClick={() => void result.refetch()}>Retry loading</button>
        </>
      ) : !item ? (
        <Loading text="Loading request…" />
      ) : (
        <article className="panel detail">
          <div className="list-summary">
            <h2>{item.title}</h2>
            <Status value={item.status} />
          </div>
          <dl>
            <dt>Location</dt>
            <dd>{item.location}</dd>
            <dt>Reported</dt>
            <dd>{new Date(item.createdAt).toLocaleString()}</dd>
            <dt>Last updated</dt>
            <dd>{new Date(item.updatedAt).toLocaleString()}</dd>
            <dt>Request ID</dt>
            <dd className="identifier">{item.id}</dd>
          </dl>
          {item.description !== undefined ? (
            <>
              <h3>Description</h3>
              <p className="preserve">{item.description}</p>
            </>
          ) : (
            <p className="notice">
              The description is not shared with your role.
            </p>
          )}
          {item.resolutionNote && (
            <>
              <h3>Resolution note</h3>
              <p className="preserve">{item.resolutionNote}</p>
            </>
          )}
          <button
            onClick={() => {
              setNotice("");
              void result.refetch();
            }}
          >
            Refresh progress
          </button>
          {user && (
            <WorkflowControls
              key={"actions:" + item.id + ":" + item.version}
              api={api}
              item={item}
              user={user}
              onChanged={(text) => {
                setNotice(text);
              }}
            />
          )}
          {user &&
          (user.role !== "technician" || item.assigneeId === user.id) ? (
            <RequestHistory
              key={"history:" + item.id + ":" + item.version}
              api={api}
              id={item.id}
            />
          ) : (
            <p className="small">
              History is shared with the reporter, coordinator and assigned
              technician.
            </p>
          )}
        </article>
      )}
    </>
  );
}
export function RequestForm({ api }: { api: ApiClient }) {
  const [values, setValues] = useState({
    title: "",
    location: "",
    description: "",
  });
  const mutation = useCreateRequest(api);
  const busy = mutation.isPending;
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      title: String(f.get("title")).trim(),
      description: String(f.get("description")).trim(),
      location: String(f.get("location")).trim(),
    };
    if (
      input.title.length < 5 ||
      input.description.length < 10 ||
      input.location.length < 2
    ) {
      setError(
        "Enter a title of at least 5 characters, a description of at least 10, and a location of at least 2.",
      );
      return;
    }
    setError("");
    try {
      const r = await mutation.mutateAsync(input);
      window.location.hash = "/requests/" + r.request.id;
    } catch (e) {
      setError(
        message(e) +
          " If the connection failed after submission, check My requests before retrying to avoid a duplicate.",
      );
    }
  }
  return (
    <>
      <a className="back" href="#/">
        ← Back to requests
      </a>
      <PageTitle
        title="Report an issue"
        subtitle="A few clear details help campus staff understand the problem."
      />
      <section className="panel form-panel">
        {error && <Alert text={error} />}
        <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
          <label htmlFor="title">Issue title</label>
          <input
            id="title"
            name="title"
            value={values.title}
            onChange={(e) =>
              setValues((v) => ({ ...v, title: e.target.value }))
            }
            required
            minLength={5}
            maxLength={120}
            aria-describedby="title-hint"
          />
          <p className="hint" id="title-hint">
            5–120 characters. Keep personal details out of the title.
          </p>
          <label htmlFor="request-location">Location</label>
          <input
            id="request-location"
            name="location"
            value={values.location}
            onChange={(e) =>
              setValues((v) => ({ ...v, location: e.target.value }))
            }
            required
            minLength={2}
            maxLength={120}
            aria-describedby="location-hint"
          />
          <p className="hint" id="location-hint">
            Building and room, for example: Hostel A, study room.
          </p>
          <label htmlFor="description">What needs attention?</label>
          <textarea
            id="description"
            name="description"
            value={values.description}
            onChange={(e) =>
              setValues((v) => ({ ...v, description: e.target.value }))
            }
            required
            minLength={10}
            maxLength={2000}
            rows={6}
            aria-describedby="description-hint"
          />
          <p className="hint" id="description-hint">
            10–2,000 characters. Use synthetic information for this demo.
          </p>
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy ? "Submitting…" : "Submit request"}
            </button>
            <a href="#/">Cancel</a>
          </div>
        </form>
      </section>
    </>
  );
}
