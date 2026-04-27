import type { Logger } from "pino";
import {
  GatewayIntentBits,
  type Client,
  type ClientOptions,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";

import { decideForward } from "./forwarding.js";
import type {
  AppConfig,
  ForwardAttachment,
  ForwardingRuntime,
  MessageSnapshot,
  RouteConfig,
} from "./types.js";

export interface ResolvedRoute extends RouteConfig {
  channel: GuildTextBasedChannel;
}

export type ResolvedRuntime = ForwardingRuntime<ResolvedRoute>;

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

  const routes = await Promise.all(
    config.routes.map(async (route) => {
      const channel = await guild.channels.fetch(route.destinationChannelId);

      if (!isSendableGuildTextChannel(channel)) {
        throw new Error(
          `destinationChannelId ${route.destinationChannelId} for userId ${route.userId} is not a sendable text channel in guild ${config.guildId}.`,
        );
      }

      return [
        route.userId,
        {
          ...route,
          channel,
        },
      ] as const;
    }),
  );

  return {
    guildId: guild.id,
    sourceChannelId: sourceChannel.id,
    routesByUserId: new Map(routes),
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

  try {
    await decision.route.channel.send(decision.payload);
    logger.info({
      event: "message_forwarded",
      messageId: message.id,
      authorId: message.author.id,
      sourceChannelId: message.channelId,
      destinationChannelId: decision.route.destinationChannelId,
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
      destinationChannelId: decision.route.destinationChannelId,
    });
  }
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
