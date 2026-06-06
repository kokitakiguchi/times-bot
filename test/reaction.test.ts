import { describe, expect, it, vi } from "vitest";

import { handleReactionAdd, handleReactionRemove } from "../src/bot.js";
import type { ResolvedRuntime } from "../src/bot.js";
import type { Logger } from "pino";

// Minimal stubs for Discord.js objects
function makeReaction({
  partial = false,
  channelId = "source-channel-id",
  messageId = "source-msg-id",
  emojiId = null as string | null,
  emojiName = "👍",
  parentId = null as string | null,
} = {}) {
  const message = {
    partial: false,
    channelId,
    id: messageId,
    channel: { parentId },
    guild: {
      channels: {
        fetch: vi.fn().mockResolvedValue(null),
      },
    },
    fetch: vi.fn(),
  };
  return {
    partial,
    fetch: vi.fn().mockResolvedValue({ partial: false, message, emoji: { id: emojiId, name: emojiName } }),
    message,
    emoji: { id: emojiId, name: emojiName },
  };
}

function makeUser(bot = false) {
  return { bot, id: "user-id" };
}

function makeRuntime(
  storedMsg?: object,
  {
    aggregateChannelId,
    aggregateByTimesId,
    aggregateByAggregateId,
  }: {
    aggregateChannelId?: string;
    aggregateByTimesId?: object;
    aggregateByAggregateId?: object;
  } = {},
): ResolvedRuntime {
  return {
    guildId: "guild-id",
    sourceChannelId: "source-channel-id",
    timesCategoryId: "category-id",
    timesDbPath: ":memory:",
    sourceChannel: {} as any,
    timesCategory: {} as any,
    ...(aggregateChannelId
      ? { timesAggregateChannel: { id: aggregateChannelId } as any }
      : {}),
    resolvedRoleMappings: [],
    store: {
      getMessage: vi.fn().mockReturnValue(storedMsg),
      getUser: vi.fn(),
      upsertUser: vi.fn(),
      saveMessage: vi.fn(),
      updateMessageContent: vi.fn(),
      deleteMessage: vi.fn(),
      saveAggregateMessage: vi.fn(),
      getAggregateByTimesMessageId: vi.fn().mockReturnValue(aggregateByTimesId),
      getAggregateByAggregateMessageId: vi.fn().mockReturnValue(aggregateByAggregateId),
      close: vi.fn(),
    },
  };
}

const silentLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

describe("handleReactionAdd", () => {
  it("skips bot reactions", async () => {
    const reaction = makeReaction();
    const runtime = makeRuntime();
    await handleReactionAdd(reaction as any, makeUser(true) as any, {} as any, runtime, silentLogger);
    expect(runtime.store.getMessage).not.toHaveBeenCalled();
  });

  it("skips reactions on non-source channels", async () => {
    const reaction = makeReaction({ channelId: "other-channel" });
    const runtime = makeRuntime();
    await handleReactionAdd(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);
    expect(runtime.store.getMessage).not.toHaveBeenCalled();
  });

  it("skips when no stored message found", async () => {
    const reaction = makeReaction();
    const runtime = makeRuntime(undefined);
    const spy = vi.spyOn(reaction.message.guild.channels, "fetch");
    await handleReactionAdd(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches destination channel and reacts when message is stored", async () => {
    const reactFn = vi.fn().mockResolvedValue(undefined);
    const forwardedMsg = { react: reactFn, reactions: { cache: new Map() } };
    const destChannel = {
      isTextBased: () => true,
      send: vi.fn(),
      messages: { fetch: vi.fn().mockResolvedValue(forwardedMsg) },
    };

    const reaction = makeReaction();
    reaction.message.guild.channels.fetch = vi.fn().mockResolvedValue(destChannel);

    const stored = {
      destinationChannelId: "dest-channel-id",
      forwardedMessageId: "forwarded-msg-id",
    };
    const runtime = makeRuntime(stored);

    await handleReactionAdd(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);
    expect(reactFn).toHaveBeenCalledWith("👍");
  });

  it("uses custom emoji id when available", async () => {
    const reactFn = vi.fn().mockResolvedValue(undefined);
    const forwardedMsg = { react: reactFn, reactions: { cache: new Map() } };
    const destChannel = {
      isTextBased: () => true,
      send: vi.fn(),
      messages: { fetch: vi.fn().mockResolvedValue(forwardedMsg) },
    };

    const reaction = makeReaction({ emojiId: "custom-emoji-id", emojiName: "custom" });
    reaction.message.guild.channels.fetch = vi.fn().mockResolvedValue(destChannel);

    const stored = { destinationChannelId: "dest-channel-id", forwardedMessageId: "forwarded-msg-id" };
    const runtime = makeRuntime(stored);

    await handleReactionAdd(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);
    expect(reactFn).toHaveBeenCalledWith("custom-emoji-id");
  });
});

describe("handleReactionAdd — aggregate sync", () => {
  it("mirrors a times-channel reaction onto the aggregate message", async () => {
    const reactFn = vi.fn().mockResolvedValue(undefined);
    const aggregateMsg = { react: reactFn, reactions: { cache: new Map() } };
    const aggregateChannel = {
      isTextBased: () => true,
      send: vi.fn(),
      messages: { fetch: vi.fn().mockResolvedValue(aggregateMsg) },
    };

    const reaction = makeReaction({
      channelId: "times-channel-id",
      messageId: "times-msg-id",
      parentId: "category-id",
    });
    reaction.message.guild.channels.fetch = vi.fn().mockResolvedValue(aggregateChannel);

    const runtime = makeRuntime(undefined, {
      aggregateChannelId: "aggregate-channel-id",
      aggregateByTimesId: {
        timesChannelId: "times-channel-id",
        timesMessageId: "times-msg-id",
        aggregateMessageId: "aggregate-msg-id",
      },
    });

    await handleReactionAdd(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);

    expect(runtime.store.getAggregateByTimesMessageId).toHaveBeenCalledWith("times-msg-id");
    expect(reaction.message.guild.channels.fetch).toHaveBeenCalledWith("aggregate-channel-id");
    expect(aggregateChannel.messages.fetch).toHaveBeenCalledWith("aggregate-msg-id");
    expect(reactFn).toHaveBeenCalledWith("👍");
  });

  it("mirrors an aggregate-channel reaction back onto the original times message", async () => {
    const reactFn = vi.fn().mockResolvedValue(undefined);
    const timesMsg = { react: reactFn, reactions: { cache: new Map() } };
    const timesChannel = {
      isTextBased: () => true,
      send: vi.fn(),
      messages: { fetch: vi.fn().mockResolvedValue(timesMsg) },
    };

    const reaction = makeReaction({
      channelId: "aggregate-channel-id",
      messageId: "aggregate-msg-id",
    });
    reaction.message.guild.channels.fetch = vi.fn().mockResolvedValue(timesChannel);

    const runtime = makeRuntime(undefined, {
      aggregateChannelId: "aggregate-channel-id",
      aggregateByAggregateId: {
        timesChannelId: "times-channel-id",
        timesMessageId: "times-msg-id",
        aggregateMessageId: "aggregate-msg-id",
      },
    });

    await handleReactionAdd(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);

    expect(runtime.store.getAggregateByAggregateMessageId).toHaveBeenCalledWith("aggregate-msg-id");
    expect(reaction.message.guild.channels.fetch).toHaveBeenCalledWith("times-channel-id");
    expect(timesChannel.messages.fetch).toHaveBeenCalledWith("times-msg-id");
    expect(reactFn).toHaveBeenCalledWith("👍");
  });

  it("ignores times-channel reactions when aggregation is disabled", async () => {
    const reaction = makeReaction({
      channelId: "times-channel-id",
      messageId: "times-msg-id",
      parentId: "category-id",
    });
    const runtime = makeRuntime(); // no aggregate channel configured
    const spy = vi.spyOn(reaction.message.guild.channels, "fetch");

    await handleReactionAdd(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);

    expect(runtime.store.getAggregateByTimesMessageId).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips times-channel reactions outside the times category", async () => {
    const reaction = makeReaction({
      channelId: "random-channel-id",
      messageId: "random-msg-id",
      parentId: "unrelated-category",
    });
    const runtime = makeRuntime(undefined, { aggregateChannelId: "aggregate-channel-id" });

    await handleReactionAdd(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);

    expect(runtime.store.getAggregateByTimesMessageId).not.toHaveBeenCalled();
  });
});

describe("handleReactionRemove", () => {
  it("skips bot reactions", async () => {
    const reaction = makeReaction();
    const runtime = makeRuntime();
    await handleReactionRemove(reaction as any, makeUser(true) as any, {} as any, runtime, silentLogger);
    expect(runtime.store.getMessage).not.toHaveBeenCalled();
  });

  it("skips reactions on non-source channels", async () => {
    const reaction = makeReaction({ channelId: "other-channel" });
    const runtime = makeRuntime();
    await handleReactionRemove(reaction as any, makeUser() as any, {} as any, runtime, silentLogger);
    expect(runtime.store.getMessage).not.toHaveBeenCalled();
  });

  it("removes bot reaction from forwarded message", async () => {
    const removeFn = vi.fn().mockResolvedValue(undefined);
    const emojiReaction = { users: { remove: removeFn } };
    const forwardedMsg = {
      react: vi.fn(),
      reactions: { cache: new Map([["👍", emojiReaction]]) },
    };
    const destChannel = {
      isTextBased: () => true,
      send: vi.fn(),
      messages: { fetch: vi.fn().mockResolvedValue(forwardedMsg) },
    };

    const reaction = makeReaction();
    reaction.message.guild.channels.fetch = vi.fn().mockResolvedValue(destChannel);

    const stored = { destinationChannelId: "dest-channel-id", forwardedMessageId: "forwarded-msg-id" };
    const runtime = makeRuntime(stored);
    const client = { user: { id: "bot-id" } };

    await handleReactionRemove(reaction as any, makeUser() as any, client as any, runtime, silentLogger);
    expect(removeFn).toHaveBeenCalledWith("bot-id");
  });

  it("removes the mirrored reaction from the aggregate message", async () => {
    const removeFn = vi.fn().mockResolvedValue(undefined);
    const emojiReaction = { users: { remove: removeFn } };
    const aggregateMsg = {
      react: vi.fn(),
      reactions: { cache: new Map([["👍", emojiReaction]]) },
    };
    const aggregateChannel = {
      isTextBased: () => true,
      send: vi.fn(),
      messages: { fetch: vi.fn().mockResolvedValue(aggregateMsg) },
    };

    const reaction = makeReaction({
      channelId: "times-channel-id",
      messageId: "times-msg-id",
      parentId: "category-id",
    });
    reaction.message.guild.channels.fetch = vi.fn().mockResolvedValue(aggregateChannel);

    const runtime = makeRuntime(undefined, {
      aggregateChannelId: "aggregate-channel-id",
      aggregateByTimesId: {
        timesChannelId: "times-channel-id",
        timesMessageId: "times-msg-id",
        aggregateMessageId: "aggregate-msg-id",
      },
    });
    const client = { user: { id: "bot-id" } };

    await handleReactionRemove(reaction as any, makeUser() as any, client as any, runtime, silentLogger);
    expect(removeFn).toHaveBeenCalledWith("bot-id");
  });
});
