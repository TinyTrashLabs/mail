CREATE TABLE IF NOT EXISTS messages (
  id               BIGSERIAL PRIMARY KEY,
  message_id       TEXT UNIQUE,
  in_reply_to      TEXT,
  subject          TEXT,
  from_addr        TEXT,
  to_addrs         JSONB NOT NULL DEFAULT '[]',
  cc_addrs         JSONB NOT NULL DEFAULT '[]',
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  text_body        TEXT,
  html_body        TEXT,
  attachments_meta JSONB NOT NULL DEFAULT '[]',
  mailbox          VARCHAR(64) NOT NULL DEFAULT 'shared'
);

CREATE INDEX IF NOT EXISTS idx_messages_mailbox_date
  ON messages (mailbox, received_at DESC);

-- Per-user message state: read/starred flags keyed on (viewer_username, message_id).
-- CREATE TABLE IF NOT EXISTS is safe to re-run — initSchema() in db.js executes
-- this file on every boot, so the table is created automatically on first deploy.
CREATE TABLE IF NOT EXISTS message_state (
  username   VARCHAR(64) NOT NULL,
  message_id BIGINT      NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_starred BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (username, message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_state_username
  ON message_state (username);
