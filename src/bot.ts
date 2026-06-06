import type { Logger } from "pino";
import {
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder,
  type Client,
  type ClientOptions,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type CategoryChannel,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
} from "discord.js";

import { decideForward } from "./forwarding.js";
import { initializeTimes } from "./db.js";
import type {
  AppConfig,
  ForwardAttachment,
  MessageSnapshot,
} from "./types.js";

const CHANNEL_CREATED_ANNOUNCEMENT =
  "times チャンネルを作りました！個人ので好きなことを自由につぶやいてOKです 🐦 チャンネル名も変更できます。他の人の times も自由に覗きに行けますよ！";

export interface ResolvedRoleMapping {
  roleId: string;
  category: CategoryChannel;
}

export interface ResolvedRuntime {
  guildId: string;
  sourceChannelId: string;
  timesCategoryId: string;
  timesDbPath: string;
  sourceChannel: GuildTextBasedChannel;
  timesCategory: CategoryChannel;
  timesAggregateChannel?: GuildTextBasedChannel;
  resolvedRoleMappings: ResolvedRoleMapping[];
  store: any;
}

export type ForwardingRuntime = ResolvedRuntime;

export function createClientOptions(config: AppConfig): ClientOptions {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ];

  if (config.enableMessageContentIntent) {
    intents.push(GatewayIntentBits.MessageContent);
  }

  return {
    intents,
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  };
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

  let timesAggregateChannel: GuildTextBasedChannel | undefined;
  if (config.timesAggregateChannelId) {
    const aggregateChannel = await guild.channels.fetch(config.timesAggregateChannelId);
    if (!aggregateChannel?.isTextBased()) {
      throw new Error(
        `TIMES_AGGREGATE_CHANNEL_ID ${config.timesAggregateChannelId} is not a text-based channel in guild ${config.guildId}.`,
      );
    }
    timesAggregateChannel = aggregateChannel as GuildTextBasedChannel;
  }

  const resolvedRoleMappings: ResolvedRoleMapping[] = [];
  for (const mapping of config.roleCategoryMappings ?? []) {
    const ch = await guild.channels.fetch(mapping.categoryId);
    if (ch?.type !== ChannelType.GuildCategory) {
      throw new Error(
        `roleCategoryMappings categoryId ${mapping.categoryId} is not a category channel in guild ${config.guildId}.`,
      );
    }
    resolvedRoleMappings.push({ roleId: mapping.roleId, category: ch as CategoryChannel });
  }

  return {
    guildId: guild.id,
    sourceChannelId: sourceChannel.id,
    timesCategoryId: timesCategory.id,
    timesDbPath: config.timesDbPath,
    sourceChannel,
    timesCategory: timesCategory as CategoryChannel,
    ...(timesAggregateChannel !== undefined ? { timesAggregateChannel } : {}),
    resolvedRoleMappings,
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
  let channelJustCreated = false;

  if (!destinationChannelId) {
    try {
      // Create destination channel
      const sanitized = sanitizeUsername(message.author.username);
      const baseChannelName = sanitized && sanitized.length > 0
        ? `times-${sanitized}`
        : `times-${message.author.username}-${message.author.id.slice(-6)}`;

      const targetCategory = resolveTargetCategory(message, runtime);

      logger.info({
        event: "channel_creation_starting",
        userId: message.author.id,
        username: message.author.username,
        sanitized,
        channelName: baseChannelName,
        categoryId: targetCategory.id,
      });

      const destinationChannel = await targetCategory.children.create({
        name: baseChannelName,
        type: ChannelType.GuildText,
      });

      destinationChannelId = destinationChannel.id;
      channelJustCreated = true;

      logger.info({
        event: "channel_created",
        userId: message.author.id,
        channelId: destinationChannelId,
        channelName: destinationChannel.name,
      });

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
        err: error instanceof Error ? {
          type: error.constructor.name,
          message: error.message,
          code: (error as any).code,
          requestData: (error as any).requestData,
        } : error,
        userId: message.author.id,
        username: message.author.username,
        categoryId: runtime.timesCategoryId,
      });
      return;
    }
  }

  try {
    const destinationChannel = await message.guild?.channels.fetch(destinationChannelId);
    
    if (!destinationChannel || !isSendableGuildTextChannel(destinationChannel)) {
      throw new Error(`Destination channel ${destinationChannelId} is not sendable.`);
    }

    if (channelJustCreated) {
      await destinationChannel.send({
        content: `<@${message.author.id}>\n${CHANNEL_CREATED_ANNOUNCEMENT}`,
        allowedMentions: { parse: [], users: [message.author.id] },
      });
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

export async function handleAggregateForward(
  message: Message,
  runtime: ResolvedRuntime,
  logger: Logger,
): Promise<void> {
  if (!runtime.timesAggregateChannel) return;

  if (
    message.channel.type !== ChannelType.GuildText ||
    !isTimesCategory(message.channel.parentId, runtime)
  ) {
    return;
  }

  if (message.author.bot || message.webhookId !== null) return;

  const content = message.content.trim();
  const hasAttachments = message.attachments.size > 0;

  if (content === "" && !hasAttachments) return;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.member?.displayName ?? message.author.username,
      iconURL: message.author.displayAvatarURL(),
    })
    .setColor(userColorFromId(message.author.id))
    .setTimestamp(message.createdAt);

  const descriptionParts: string[] = [];
  if (content !== "") descriptionParts.push(content);
  descriptionParts.push(`<#${message.channelId}>`);
  embed.setDescription(descriptionParts.join("\n\n"));

  const files = message.attachments.map((a) => ({
    attachment: a.url,
    ...(a.name ? { name: a.name } : {}),
  }));

  try {
    const sent = await runtime.timesAggregateChannel.send({
      embeds: [embed],
      files,
      allowedMentions: { parse: [] },
    });

    runtime.store.saveAggregateMessage({
      timesMessageId: message.id,
      timesChannelId: message.channelId,
      aggregateMessageId: sent.id,
      userId: message.author.id,
      guildId: message.guildId ?? runtime.guildId,
    });

    logger.info({
      event: "aggregate_forwarded",
      messageId: message.id,
      authorId: message.author.id,
      sourceChannelId: message.channelId,
      aggregateChannelId: runtime.timesAggregateChannel.id,
      aggregateMessageId: sent.id,
    });
  } catch (error) {
    logger.error({
      event: "aggregate_forward_failed",
      err: error,
      messageId: message.id,
      authorId: message.author.id,
      sourceChannelId: message.channelId,
    });
  }
}

function userColorFromId(userId: string): number {
  let hash = 0;
  for (const char of userId) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash) % 0xffffff;
}

function sanitizeUsername(username: string): string {
  // Keep only alphanumeric and hyphens, lowercase
  // Discord channel names must be 1-100 characters, no spaces, lowercase
  const sanitized = username
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "") // Keep alphanumeric, hyphens, and underscores
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
    .replace(/_+/g, "-") // Convert underscores to hyphens for consistency
    .substring(0, 90); // Leave room for "times-" and suffix
  
  return sanitized;
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

function resolveTargetCategory(
  message: Message,
  runtime: ResolvedRuntime,
): CategoryChannel {
  if (runtime.resolvedRoleMappings.length === 0 || !message.member) {
    return runtime.timesCategory;
  }

  for (const mapping of runtime.resolvedRoleMappings) {
    if (message.member.roles.cache.has(mapping.roleId)) {
      return mapping.category;
    }
  }

  return runtime.timesCategory;
}

function isTimesCategory(
  categoryId: string | null,
  runtime: ResolvedRuntime,
): boolean {
  if (!categoryId) return false;
  if (categoryId === runtime.timesCategoryId) return true;
  return runtime.resolvedRoleMappings.some((m) => m.category.id === categoryId);
}

type ReactionAction = "add" | "remove";

type ReactionFlow = "source_to_times" | "times_to_aggregate" | "aggregate_to_times";

interface ReactionTarget {
  channelId: string;
  messageId: string;
  flow: ReactionFlow;
}

/**
 * Maps a reacted-on message to the message(s) the reaction should be mirrored onto.
 * - source channel message -> the forwarded copy in the user's times channel
 * - times channel message  -> the aggregated copy in the aggregate channel
 * - aggregate message      -> the original message in the user's times channel
 */
function resolveReactionTargets(message: Message, runtime: ResolvedRuntime): ReactionTarget[] {
  if (message.channelId === runtime.sourceChannelId) {
    const stored = runtime.store.getMessage(message.id);
    if (!stored) return [];
    return [
      {
        channelId: stored.destinationChannelId,
        messageId: stored.forwardedMessageId,
        flow: "source_to_times",
      },
    ];
  }

  if (!runtime.timesAggregateChannel) return [];

  if (message.channelId === runtime.timesAggregateChannel.id) {
    const mapping = runtime.store.getAggregateByAggregateMessageId(message.id);
    if (!mapping) return [];
    return [
      {
        channelId: mapping.timesChannelId,
        messageId: mapping.timesMessageId,
        flow: "aggregate_to_times",
      },
    ];
  }

  const parentId =
    message.channel && "parentId" in message.channel ? message.channel.parentId : null;
  if (isTimesCategory(parentId, runtime)) {
    const mapping = runtime.store.getAggregateByTimesMessageId(message.id);
    if (!mapping) return [];
    return [
      {
        channelId: runtime.timesAggregateChannel.id,
        messageId: mapping.aggregateMessageId,
        flow: "times_to_aggregate",
      },
    ];
  }

  return [];
}

async function syncReaction(
  action: ReactionAction,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client: Client,
  runtime: ResolvedRuntime,
  logger: Logger,
): Promise<void> {
  // Ignore the bot's own reactions; this is what prevents mirror loops in the
  // bidirectional (times <-> aggregate) flows.
  if (user.bot) return;

  let resolved: MessageReaction;
  let message: Message;
  try {
    resolved = reaction.partial ? await reaction.fetch() : reaction;
    message = resolved.message.partial ? await resolved.message.fetch() : resolved.message;
  } catch (error) {
    logger.error({ event: "reaction_fetch_failed", err: error });
    return;
  }

  const emojiKey = resolved.emoji.id ?? resolved.emoji.name;
  if (!emojiKey) return;

  const targets = resolveReactionTargets(message, runtime);

  for (const target of targets) {
    try {
      const channel = await message.guild?.channels.fetch(target.channelId);
      if (!channel || !isSendableGuildTextChannel(channel)) continue;

      const targetMsg = await channel.messages.fetch(target.messageId);
      if (action === "add") {
        await targetMsg.react(emojiKey);
      } else if (client.user) {
        await targetMsg.reactions.cache.get(emojiKey)?.users.remove(client.user.id);
      }

      logger.info({
        event: "reaction_synced",
        action,
        flow: target.flow,
        sourceMessageId: message.id,
        targetMessageId: target.messageId,
        emoji: emojiKey,
      });
    } catch (error) {
      logger.error({
        event: "reaction_sync_failed",
        action,
        flow: target.flow,
        err: error,
        sourceMessageId: message.id,
        emoji: emojiKey,
      });
    }
  }
}

export async function handleReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client: Client,
  runtime: ResolvedRuntime,
  logger: Logger,
): Promise<void> {
  await syncReaction("add", reaction, user, client, runtime, logger);
}

export async function handleReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client: Client,
  runtime: ResolvedRuntime,
  logger: Logger,
): Promise<void> {
  await syncReaction("remove", reaction, user, client, runtime, logger);
}
