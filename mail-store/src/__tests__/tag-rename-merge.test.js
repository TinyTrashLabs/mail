/**
 * Tests for the source-precedence rule used by routes/tags.js PATCH /tags
 * (rename). The SQL CASE expression there says:
 *
 *   ON CONFLICT (message_id, tag) DO UPDATE SET source = CASE
 *     WHEN message_tags.source = 'user' OR EXCLUDED.source = 'user'
 *     THEN 'user' ELSE message_tags.source END
 *
 * This file pins the equivalent JS semantics via a tiny helper so the
 * intent survives a future SQL refactor: if either the existing row or
 * the newly-inserted row was user-applied, the merged row is user.
 */

import { describe, test, expect } from "@jest/globals";
import { mergeTagSources } from "../routes/tag-source-merge.js";

describe("mergeTagSources (rename collision precedence)", () => {
  test("user wins over user", () => {
    expect(mergeTagSources("user", "user")).toBe("user");
  });
  test("user wins over ai", () => {
    expect(mergeTagSources("user", "ai")).toBe("user");
    expect(mergeTagSources("ai", "user")).toBe("user");
  });
  test("ai survives when neither side is user", () => {
    expect(mergeTagSources("ai", "ai")).toBe("ai");
  });
  test("unknown source defaults to the existing side", () => {
    // If the existing row is some future source like 'system', and the
    // incoming row is also non-user, keep the existing — don't downgrade.
    expect(mergeTagSources("system", "ai")).toBe("system");
  });
});
