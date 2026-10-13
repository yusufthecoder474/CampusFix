BEGIN;
ALTER TABLE maintenance_requests ADD COLUMN version integer NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE users ADD CONSTRAINT users_id_role_unique UNIQUE (id, role);
ALTER TABLE maintenance_requests ADD COLUMN assignee_role text NOT NULL DEFAULT 'technician' CHECK (assignee_role = 'technician');
ALTER TABLE maintenance_requests ADD CONSTRAINT requests_technician_fk FOREIGN KEY (assignee_id, assignee_role) REFERENCES users(id, role);
ALTER TABLE request_events DROP CONSTRAINT request_events_action_check;
ALTER TABLE request_events ADD CONSTRAINT request_events_action_check CHECK (action IN ('create','triage','claim','assign','resolve','close','reopen'));
ALTER TABLE request_events ADD COLUMN request_version integer CHECK (request_version >= 0);
ALTER TABLE request_events ADD COLUMN assignee_id uuid REFERENCES users(id);
ALTER TABLE request_events ADD COLUMN note text CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 2000);
CREATE UNIQUE INDEX events_request_version ON request_events(request_id, request_version);
ALTER TABLE request_events ADD CONSTRAINT events_transition_shape CHECK (request_version IS NULL OR (
 (action = 'create' AND previous_status IS NULL AND next_status = 'reported' AND request_version = 0) OR
 (action = 'triage' AND previous_status = 'reported' AND next_status = 'available' AND request_version > 0) OR
 (action = 'assign' AND previous_status = 'available' AND next_status = 'in_progress' AND assignee_id IS NOT NULL AND request_version > 0) OR
 (action = 'resolve' AND previous_status = 'in_progress' AND next_status = 'resolved' AND note IS NOT NULL AND request_version > 0) OR
 (action = 'close' AND previous_status = 'resolved' AND next_status = 'closed' AND request_version > 0) OR
 (action = 'reopen' AND previous_status = 'resolved' AND next_status = 'in_progress' AND note IS NOT NULL AND request_version > 0)
));
ALTER TABLE request_events ADD CONSTRAINT events_versioned_previous CHECK (request_version IS NULL OR ((action = 'create' AND previous_status IS NULL) OR (action <> 'create' AND previous_status IS NOT NULL)));
ALTER TABLE request_events ADD CONSTRAINT events_versioned_assignee CHECK (request_version IS NULL OR action NOT IN ('assign','resolve','close','reopen') OR assignee_id IS NOT NULL);
CREATE INDEX requests_assignee_created ON maintenance_requests(assignee_id, created_at DESC);
COMMIT;
