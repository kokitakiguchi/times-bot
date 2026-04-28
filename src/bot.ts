import type { Logger } from "pino";
import {
  GatewayIntentBits,
  ChannelType,
  type Client,
  type ClientOptions,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";

import { decideForward } from "./forwarding.js";
import { initializeTimes } from "./db.js";
import type {
  AppConfig,
  ForwardAttachment,
  MessageSnapshot,
} from "./types.js";

export interface ResolvedRuntime {
  guildId: string;
  sourceChannelId: string;
  timesCategoryId: string;
  timesDbPath: string;
  sourceChannel: GuildTextBasedChannel;
  timesCategory: any;
  store: any;
}

export type ForwardingRuntime = ResolvedRuntime;

export function createClientOptions(config: AppConfig): ClientOptions {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ];

  if (config.enableMessageContentIntent) {
    intents.push(GatewayIntentBits.MessageContent);
  }

  return { intents };
}

export async function resolveRuntime(
  client: Client<true>,
  config: AppConfig,
): Promise<ResolvedRuntime> {
  const guild = await client.guilds.fetch(config.guildId);
  const sourceChannel = await guild.channels.fetch(config.sourceChannelId);

  if (!sourceChannel?.isTextBased()) {
    throw new Error(
      `sourceChannelId ${config.sourceChannelId} is not a text-based channel in guild ${config.guildId}.`,
    );
  }

  const timesCategory = await guild.channels.fetch(config.timesCategoryId);

  if (timesCategory?.type !== ChannelType.GuildCategory) {
    throw new Error(
      `TIMES_CATEGORY_ID ${config.timesCategoryId} is not a category channel in guild ${config.guildId}.`,
    );
  }

  const store = await initializeTimes(config.timesDbPath);

  return {
    guildId: guild.id,
    sourceChannelId: sourceChannel.id,
    timesCategoryId: timesCategory.id,
    timesDbPath: config.timesDbPath,
    sourceChannel,
    timesCategory,
    store,
  };
}

export async function handleIncomingMessage(
  message: Message,
  runtime: ResolvedRuntime,
  logger: Logger,
): Promise<void> {
  const snapshot = createMessageSnapshot(message);
  const decision = decideForward(snapshot, runtime);

  if (decision.kind === "skip") {
    logger.info({
      event: "message_skipped",
      reason: decision.reason,
      messageId: message.id,
      authorId: message.author.id,
      channelId: message.channelId,
      guildId: message.guildId ?? null,
    });
    return;
  }

  // Check if user is registered, if not register them
  let destinationChannelId = runtime.store.getUser(message.author.id)?.destinationChannelId;
  
  if (!destinationChannelId) {
    try {
      // Create destination channel
      const channelName = sanitizeUsername(message.author.username);
      const destinationChannel = await runtime.timesCategory.children.create({
        name: channelName || `times-${message.author.username}-${message.author.id.slice(-6)}`,
        type: ChannelType.GuildText,
      });

      destinationChannelId = destinationChannel.id;

      // Register user in DB
      runtime.store.upsertUser({
        userId: message.author.id,
        guildId: message.guildId || runtime.guildId,
        username: message.author.username,
        displayName: message.author.displayName || null,
        destinationChannelId,
        destinationChannelName: destinationChannel.name,
        seenAt: new Date().toISOString(),
      });

      logger.info({
        event: "user_registered",
        userId: message.author.id,
        username: message.author.username,
        destinationChannelId,
      });
    } catch (error) {
      logger.error({
        event: "user_registration_failed",
        err: error,
        userId: message.author.id,
        username: message.author.username,
      });
      return;
    }
  }

  try {
    const destinationChannel = await message.guild?.channels.fetch(destinationChannelId);
    
    if (!destinationChannel || !isSendableGuildTextChannel(destinationChannel)) {
      throw new Error(`Destination channel ${destinationChannelId} is not sendable.`);
    }

    const sentMessage = await destinationChannel.send(decision.payload);
    
    // Save message to DB
    runtime.store.saveMessage({
      sourceMessageId: message.id,
      userId: message.author.id,
      guildId: message.guildId || runtime.guildId,
      sourceChannelId: message.channelId,
      destinationChannelId,
      forwardedMessageId: sentMessage.id,
      content: decision.sanitizedContent,
      hasAttachments: decision.hasAttachments,
      sourceCreatedAt: message.createdAt.toISOString(),
      recordedAt: new Date().toISOString(),
    });

    logger.info({
      event: "message_forwarded",
      messageId: message.id,
      authorId: message.author.id,
      sourceChannelId: message.channelId,
      destinationChannelId,
      attachmentCount: decision.payload.files?.length ?? 0,
      contentLength: decision.sanitizedContent.length,
    });
  } catch (error) {
    logger.error({
      event: "message_forward_failed",
      err: error,
      messageId: message.id,
      authorId: message.author.id,
      sourceChannelId: message.channelId,
      destinationChannelId,
    });
  }
}

function sanitizeUsername(username: string): string {
  // Keep only alphanumeric and hyphens, lowercase
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

function createMessageSnapshot(message: Message): MessageSnapshot {
  return {
    id: message.id,
    guildId: message.guildId ?? null,
    channelId: message.channelId,
    authorId: message.author.id,
    authorBot: message.author.bot,
    webhookId: message.webhookId ?? null,
    content: message.content,
    attachments: message.attachments.map<ForwardAttachment>((attachment) => ({
      url: attachment.url,
      ...(attachment.name ? { name: attachment.name } : {}),
    })),
  };
}

function isSendableGuildTextChannel(
  channel: GuildBasedChannel | null,
): channel is GuildTextBasedChannel {
  return Boolean(channel?.isTextBased() && "send" in channel);
}
