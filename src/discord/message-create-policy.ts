import { shouldHandleMessage } from "./should-handle.js";

type DecideMessageCreateHandlingInput = {
  isAuthorBot: boolean;
  mentionsBot: boolean;
  isThread: boolean;
  threadOwnerId: string | null;
  botUserId: string;
  body: string;
  mentionLabel: string;
};

type DecideMessageCreateHandlingResult = {
  shouldHandle: boolean;
  shouldReact: boolean;
  useThreadContext: boolean;
  emptyBodyReply: string | null;
};

function hasBody(body: string): boolean {
  return body.trim().length > 0;
}

export function decideMessageCreateHandling(
  input: DecideMessageCreateHandlingInput
): DecideMessageCreateHandlingResult {
  const shouldHandle = shouldHandleMessage({
    isAuthorBot: input.isAuthorBot,
    mentionsBot: input.mentionsBot,
    isThread: input.isThread,
    threadOwnerId: input.threadOwnerId,
    botUserId: input.botUserId,
  });
  if (!shouldHandle) {
    return {
      shouldHandle: false,
      shouldReact: false,
      useThreadContext: false,
      emptyBodyReply: null,
    };
  }

  if (!hasBody(input.body)) {
    return {
      shouldHandle: true,
      shouldReact: input.mentionsBot,
      useThreadContext: false,
      emptyBodyReply: `用件を教えてください。${input.mentionLabel} help で使い方を出します`,
    };
  }

  return {
    shouldHandle: true,
    shouldReact: input.mentionsBot,
    useThreadContext: input.isThread && input.threadOwnerId === input.botUserId,
    emptyBodyReply: null,
  };
}
