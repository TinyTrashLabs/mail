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
