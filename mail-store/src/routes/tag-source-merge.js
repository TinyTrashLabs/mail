/**
 * In-memory mirror of the SQL CASE used by routes/tags.js PATCH /tags
 * (rename). Exported so tests can pin the user-precedence rule without
 * needing a live postgres harness. The actual rename runs in SQL — this
 * helper exists to document and test the intent.
 *
 *   ON CONFLICT (message_id, tag) DO UPDATE SET source = CASE
 *     WHEN message_tags.source = 'user' OR EXCLUDED.source = 'user'
 *     THEN 'user' ELSE message_tags.source END
 *
 * existingSource = the row that was already on the message under the new tag.
 * incomingSource = the source of the row we just tried to insert (i.e. the
 *                  source of the old `from` tag we are renaming).
 */
export function mergeTagSources(existingSource, incomingSource) {
  if (existingSource === 'user' || incomingSource === 'user') return 'user';
  return existingSource;
}
