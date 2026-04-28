import { Client, Events } from "discord.js";

import { createClientOptions, handleIncomingMessage, resolveRuntime } from "./bot.js";
import { loadAppConfig } from "./config.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const config = await loadAppConfig();
  const client = new Client(createClientOptions(config));
  const shutdown = createShutdownHandler(client);
  bindShutdownSignals(shutdown);
  let runtime: Awaited<ReturnType<typeof resolveRuntime>> | null = null;

  if (!config.enableMessageContentIntent) {
    logger.warn({
      event: "message_content_intent_disabled",
      msg: "DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false: text-only messages may not be forwarded until Message Content Intent is enabled in the Discord Developer Portal.",
    });
  }

  client.once(Events.ClientReady, (readyClient) => {
    void (async () => {
      try {
        runtime = await resolveRuntime(readyClient, config);
        logger.info({
          event: "bot_ready",
          guildId: runtime.guildId,
          sourceChannelId: runtime.sourceChannelId,
          timesCategoryId: runtime.timesCategoryId,
        });
      } catch (error) {
        logger.error({
          event: "startup_failed",
          err: normalizeAppError(error),
        });
        await shutdown("startup_failed", 1);
      }
    })();
  });

  client.on(Events.MessageCreate, (message) => {
    if (runtime === null) {
      logger.info({
        event: "message_skipped",
        reason: "runtime_not_ready",
        messageId: message.id,
        authorId: message.author.id,
        channelId: message.channelId,
      });
      return;
    }

    void handleIncomingMessage(message, runtime, logger);
  });

  await client.login(config.discordToken);
}

function createShutdownHandler(client: Client) {
  let shuttingDown = false;

  return async (reason: string, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({
      event: "shutdown",
      reason,
      exitCode,
    });
    client.destroy();
    process.exit(exitCode);
  };
}

function bindShutdownSignals(
  shutdown: (reason: string, exitCode?: number) => Promise<void>,
): void {
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  logger.error({
    event: "fatal_error",
    err: normalizeAppError(error),
  });
  process.exit(1);
});

function normalizeAppError(error: unknown): Error {
  if (error instanceof Error && error.message.includes("Used disallowed intents")) {
    return new Error(
      "Used disallowed intents. Enable Message Content Intent in the Discord Developer Portal, or set DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false to start without text content forwarding.",
      { cause: error },
    );
  }

  if (hasDiscordApiCode(error, 10004) || hasErrorMessage(error, "Unknown Guild")) {
    return new Error(
      "Unknown Guild. Check GUILD_ID and make sure the bot has been invited to that Discord server.",
      { cause: error instanceof Error ? error : undefined },
    );
  }

  if (hasDiscordApiCode(error, 10003) || hasErrorMessage(error, "Unknown Channel")) {
    return new Error(
      "Unknown Channel. Check sourceChannelId and TIMES_CATEGORY_ID in .env, and make sure the bot can access those channels.",
      { cause: error instanceof Error ? error : undefined },
    );
  }

  if (hasDiscordApiCode(error, 50001) || hasErrorMessage(error, "Missing Access")) {
    return new Error(
      "Missing Access. Make sure the bot can read the source channel and manage channels/send messages in the TIMES_CATEGORY_ID category.",
      { cause: error instanceof Error ? error : undefined },
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function hasDiscordApiCode(error: unknown, code: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function hasErrorMessage(error: unknown, message: string): boolean {
  return error instanceof Error && error.message.includes(message);
}
