import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ensureThreadForMention,
  postReply,
  resolveTypingChannel,
  startTypingLoop,
} from "../src/discord/message-runtime-service.js";

describe("message-runtime-service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("ensureThreadForMention returns existing thread channel", async () => {
    const thread = { id: "t1", isThread: () => true };
    const msg = {
      channel: thread,
      inGuild: () => true,
      hasThread: false,
      thread: null,
      startThread: vi.fn(),
    };
    const out = await ensureThreadForMention(msg, {
      body: "hello",
      assistantName: "suzume",
    });
    expect(out).toBe(thread);
  });

  test("ensureThreadForMention creates thread when needed", async () => {
    const created = { id: "t2", send: vi.fn() };
    const startThread = vi.fn().mockResolvedValue(created);
    const msg = {
      channel: { id: "c1", isThread: () => false },
      id: "m1",
      inGuild: () => true,
      hasThread: false,
      thread: null,
      startThread,
    };
    const out = await ensureThreadForMention(msg, {
      body: "<@123> <@&456> こんばんは",
      assistantName: "suzume",
    });
    expect(out).toBe(created);
    expect(startThread).toHaveBeenCalledTimes(1);
    expect(startThread.mock.calls[0]?.[0]?.name).toContain("suzume:");
    expect(startThread.mock.calls[0]?.[0]?.name).not.toContain("<@");
  });

  test("postReply sends chunks to thread", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const targetThread = { send };
    const msg = {
      channel: { id: "c1", isThread: () => false },
      inGuild: () => false,
      startThread: vi.fn(),
      reply: vi.fn(),
    };
    await postReply(msg, {
      targetThread,
      body: "x",
      reply: "a".repeat(3700),
      assistantName: "suzume",
    });
    expect(send).toHaveBeenCalledTimes(3);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  test("postReply falls back to message reply when no thread is available", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const msg = {
      channel: { id: "c1", isThread: () => false },
      id: "m1",
      inGuild: () => false,
      hasThread: false,
      thread: null,
      startThread: vi.fn(),
      reply,
    };
    await postReply(msg, {
      targetThread: null,
      body: "x",
      reply: "hello",
      assistantName: "suzume",
    });
    expect(reply).toHaveBeenCalledTimes(1);
  });

  test("resolveTypingChannel prefers thread then channel", () => {
    const thread = { id: "t1", isTextBased: () => true, sendTyping: vi.fn() };
    const channel = { id: "c1", isTextBased: () => true, sendTyping: vi.fn() };
    const msg = { channel };
    expect(resolveTypingChannel(msg, thread)).toBe(thread);
    expect(resolveTypingChannel(msg, null)).toBe(channel);
  });

  test("startTypingLoop sends typing repeatedly and stop cancels loop", async () => {
    vi.useFakeTimers();
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const stop = startTypingLoop({ id: "c1", sendTyping }, { intervalMs: 8000 });
    await vi.runOnlyPendingTimersAsync();
    expect(sendTyping).toHaveBeenCalled();
    const called = sendTyping.mock.calls.length;
    stop();
    await vi.advanceTimersByTimeAsync(16000);
    expect(sendTyping.mock.calls.length).toBe(called);
  });

  test("startTypingLoop suppresses connect-timeout warning", async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const sendTyping = vi.fn().mockRejectedValue({ code: "UND_ERR_CONNECT_TIMEOUT" });
    const stop = startTypingLoop({ id: "c1", sendTyping }, { intervalMs: 8000, warn });
    await vi.runOnlyPendingTimersAsync();
    expect(warn).not.toHaveBeenCalled();
    stop();
  });
});
