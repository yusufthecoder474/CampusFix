BEGIN;
CREATE TABLE workflow_outbox (
 id bigint PRIMARY KEY REFERENCES request_events(id),
 request_id uuid NOT NULL REFERENCES maintenance_requests(id),
 payload jsonb NOT NULL,
 selected_provider text NOT NULL DEFAULT 'deskA' CHECK(selected_provider IN ('deskA','deskB')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token uuid,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 CHECK ((status = 'processing') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX workflow_outbox_due ON workflow_outbox(available_at,id) WHERE status = 'pending';
CREATE INDEX workflow_outbox_leased ON workflow_outbox(lease_until) WHERE status = 'processing';
CREATE TABLE provider_receipts (
 event_id bigint PRIMARY KEY REFERENCES workflow_outbox(id),
 provider text NOT NULL CHECK(provider IN ('deskA','deskB')),
 reference text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
-- The trigger runs inside the existing request/audit transaction. No historical backfill.
CREATE FUNCTION enqueue_workflow_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO workflow_outbox(id,request_id,payload)
 VALUES(NEW.id,NEW.request_id,jsonb_build_object(
   'requestId',NEW.request_id,'version',NEW.request_version,'action',NEW.action));
 RETURN NEW;
END;
$$;
CREATE TRIGGER workflow_event_outbox AFTER INSERT ON request_events
 FOR EACH ROW EXECUTE FUNCTION enqueue_workflow_event();
COMMIT;
