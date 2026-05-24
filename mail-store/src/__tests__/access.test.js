import { describe, test, expect } from "@jest/globals";
import {
  canAccessMailbox,
  canReadMessage,
  canWriteMessage,
  canWriteToMailbox,
} from "../access.js";

describe("canAccessMailbox / canReadMessage (read side)", () => {
  test("anyone can read shared", () => {
    expect(canAccessMailbox("shared", "david")).toBe(true);
    expect(canAccessMailbox("shared", "")).toBe(true);
    expect(canReadMessage("shared", "")).toBe(true);
  });
  test("personal mailbox readable only by its owner", () => {
    expect(canAccessMailbox("david", "david")).toBe(true);
    expect(canAccessMailbox("david", "shane")).toBe(false);
    expect(canReadMessage("david", "shane")).toBe(false);
  });
  test("unknown mailbox is never readable", () => {
    expect(canAccessMailbox("hr", "david")).toBe(false);
    expect(canReadMessage("hr", "david")).toBe(false);
  });
});

describe("canWriteToMailbox / canWriteMessage (write side)", () => {
  test("anonymous viewer can write nothing", () => {
    expect(canWriteToMailbox("shared", "")).toBe(false);
    expect(canWriteToMailbox("david", "")).toBe(false);
    expect(canWriteMessage("shared", "")).toBe(false);
  });
  test("non-PERSONAL viewer can write nothing", () => {
    expect(canWriteToMailbox("shared", "intruder")).toBe(false);
    expect(canWriteMessage("shared", "intruder")).toBe(false);
  });
  test("PERSONAL viewer can write shared and own", () => {
    expect(canWriteToMailbox("shared", "david")).toBe(true);
    expect(canWriteToMailbox("david", "david")).toBe(true);
    expect(canWriteMessage("shared", "shane")).toBe(true);
  });
  test("PERSONAL viewer cannot write someone else's mailbox", () => {
    expect(canWriteToMailbox("david", "shane")).toBe(false);
    expect(canWriteMessage("derek", "ryan")).toBe(false);
  });
  test("PERSONAL viewer cannot write unknown mailbox", () => {
    expect(canWriteToMailbox("hr", "david")).toBe(false);
    expect(canWriteMessage("hr", "david")).toBe(false);
  });
});

describe("per-user sent mailbox", () => {
  test("owner can read own <user>-sent", () => {
    expect(canAccessMailbox("david-sent", "david")).toBe(true);
    expect(canReadMessage("david-sent", "david")).toBe(true);
  });
  test("non-owner cannot read someone else's <user>-sent", () => {
    expect(canAccessMailbox("david-sent", "shane")).toBe(false);
    expect(canReadMessage("david-sent", "shane")).toBe(false);
    expect(canAccessMailbox("david-sent", "")).toBe(false);
  });
  test("owner can write own <user>-sent", () => {
    expect(canWriteToMailbox("david-sent", "david")).toBe(true);
    expect(canWriteMessage("david-sent", "david")).toBe(true);
  });
  test("non-owner cannot write someone else's <user>-sent", () => {
    expect(canWriteToMailbox("david-sent", "shane")).toBe(false);
    expect(canWriteMessage("david-sent", "shane")).toBe(false);
  });
  test("non-PERSONAL user has no sent mailbox at all", () => {
    expect(canAccessMailbox("intruder-sent", "intruder")).toBe(false);
    expect(canWriteToMailbox("intruder-sent", "intruder")).toBe(false);
  });
});
