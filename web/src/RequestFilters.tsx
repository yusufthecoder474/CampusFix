import { useState, type FormEvent } from "react";
export interface Filters {
  status: string;
  location: string;
  limit: number;
}
export function RequestFilters({
  onApply,
}: {
  onApply: (filters: Filters) => void;
}) {
  const [values, setValues] = useState<Filters>({
    status: "",
    location: "",
    limit: 10,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onApply({ ...values, location: values.location.trim() });
  }
  return (
    <form className="filters" onSubmit={submit}>
      <div>
        <label htmlFor="status">Status</label>
        <select
          id="status"
          name="status"
          value={values.status}
          onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          {["reported", "available", "in_progress", "resolved", "closed"].map(
            (s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ),
          )}
        </select>
      </div>
      <div>
        <label htmlFor="location">Exact location</label>
        <input
          id="location"
          name="location"
          maxLength={120}
          placeholder="e.g. Hostel A"
          value={values.location}
          onChange={(e) =>
            setValues((v) => ({ ...v, location: e.target.value }))
          }
        />
      </div>
      <div>
        <label htmlFor="limit">Per page</label>
        <select
          id="limit"
          name="limit"
          value={values.limit}
          onChange={(e) =>
            setValues((v) => ({ ...v, limit: Number(e.target.value) }))
          }
        >
          <option>10</option>
          <option>20</option>
          <option>50</option>
        </select>
      </div>
      <button type="submit">Apply filters</button>
    </form>
  );
}
