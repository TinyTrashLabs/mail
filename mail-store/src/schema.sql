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
  username    VARCHAR(64) NOT NULL,
  message_id  BIGINT      NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_starred  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_trashed  BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (username, message_id)
);

-- Migration for pre-existing deploys where message_state was created without is_trashed.
-- ADD COLUMN IF NOT EXISTS is idempotent; safe to re-run on every boot.
ALTER TABLE message_state
  ADD COLUMN IF NOT EXISTS is_trashed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_message_state_username
  ON message_state (username);

-- Speed up the common "list trash" / "exclude trash" filters per user.
CREATE INDEX IF NOT EXISTS idx_message_state_username_trash
  ON message_state (username, is_trashed);

-- Tags: per-message AI-generated or user-applied labels
CREATE TABLE IF NOT EXISTS message_tags (
  message_id BIGINT      NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tag        VARCHAR(32) NOT NULL,
  source     VARCHAR(16) NOT NULL DEFAULT 'ai', -- 'ai' | 'user'
  PRIMARY KEY (message_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_message_tags_message_id ON message_tags (message_id);
CREATE INDEX IF NOT EXISTS idx_message_tags_tag ON message_tags (tag);

-- Migration: shared trash for the shared mailbox.
-- Messages trashed from the shared mailbox set is_globally_trashed so all
-- users see them removed from the shared inbox (not just the user who trashed).
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_globally_trashed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_messages_globally_trashed
  ON messages (is_globally_trashed)
  WHERE is_globally_trashed = TRUE;
