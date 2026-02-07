export type ShouldHandleInput = {
  isAuthorBot: boolean;
  mentionsBot: boolean;
  isThread: boolean;
  threadOwnerId?: string | null;
  botUserId?: string;
};

export function shouldHandleMessage(input: ShouldHandleInput): boolean {
  if (input.isAuthorBot) return false;

  const isBotOwnedThread =
    input.isThread && Boolean(input.threadOwnerId) && input.threadOwnerId === input.botUserId;

  if (isBotOwnedThread) return true;
  return input.mentionsBot;
}
