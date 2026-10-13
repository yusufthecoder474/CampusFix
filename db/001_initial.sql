BEGIN;
CREATE TABLE users (
 id uuid PRIMARY KEY,
 email text NOT NULL UNIQUE CHECK(email = lower(email)),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 100),
 role text NOT NULL CHECK(role IN ('student','coordinator','technician')),
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE maintenance_requests (
 id uuid PRIMARY KEY,
 reporter_id uuid NOT NULL REFERENCES users(id),
 assignee_id uuid REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 120),
 description text NOT NULL CHECK(length(description) BETWEEN 10 AND 2000),
 location text NOT NULL CHECK(length(location) BETWEEN 2 AND 120),
 status text NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','available','in_progress','resolved','closed')),
 resolution_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status IN ('reported','available') AND assignee_id IS NULL) OR (status IN ('in_progress','resolved','closed') AND assignee_id IS NOT NULL)),
 CHECK (status NOT IN ('resolved','closed') OR length(trim(resolution_note)) > 0 AND resolution_note IS NOT NULL)
);
CREATE TABLE request_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES maintenance_requests(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('create','triage','claim','resolve','close','reopen')),
 previous_status text CHECK(previous_status IN ('reported','available','in_progress','resolved','closed')),
 next_status text NOT NULL CHECK(next_status IN ('reported','available','in_progress','resolved','closed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX requests_reporter_created ON maintenance_requests(reporter_id, created_at DESC);
CREATE INDEX requests_status_created ON maintenance_requests(status, created_at DESC);
CREATE INDEX events_request_id ON request_events(request_id, id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
COMMIT;
