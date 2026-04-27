import type {
  ForwardFile,
  ForwardingRuntime,
  ForwardPayload,
  MessageSnapshot,
  RouteConfig,
} from "./types.js";

const MENTION_PATTERN = /<@!?\d+>|<@&\d+>|<#\d+>|@everyone|@here/g;

export function sanitizeContent(content: string): string {
  return content
    .replace(MENTION_PATTERN, " ")
    .split("\n")
    .map((line) => line.replace(/[^\S\r\n]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decideForward<T extends RouteConfig>(
  message: MessageSnapshot,
  runtime: ForwardingRuntime<T>,
) {
  if (message.guildId === null) {
    return {
      kind: "skip" as const,
      reason: "not_in_guild" as const,
    };
  }

  if (message.guildId !== runtime.guildId) {
    return {
      kind: "skip" as const,
      reason: "wrong_guild" as const,
    };
  }

  if (message.channelId !== runtime.sourceChannelId) {
    return {
      kind: "skip" as const,
      reason: "wrong_channel" as const,
    };
  }

  if (message.authorBot) {
    return {
      kind: "skip" as const,
      reason: "bot_author" as const,
    };
  }

  if (message.webhookId !== null) {
    return {
      kind: "skip" as const,
      reason: "webhook_message" as const,
    };
  }

  const route = runtime.routesByUserId.get(message.authorId);

  if (!route) {
    return {
      kind: "skip" as const,
      reason: "no_route" as const,
    };
  }

  if (!route.enabled) {
    return {
      kind: "skip" as const,
      reason: "route_disabled" as const,
    };
  }

  const sanitizedContent = sanitizeContent(message.content);
  const files = buildForwardFiles(message.attachments);

  if (sanitizedContent === "" && files.length === 0) {
    return {
      kind: "skip" as const,
      reason: "empty_after_sanitization" as const,
    };
  }

  return {
    kind: "forward" as const,
    route,
    sanitizedContent,
    payload: buildForwardPayload(sanitizedContent, files),
  };
}

export function buildForwardPayload(
  content: string,
  files: ForwardFile[],
): ForwardPayload {
  const payload: ForwardPayload = {
    allowedMentions: {
      parse: [],
    },
  };

  if (content !== "") {
    payload.content = content;
  }

  if (files.length > 0) {
    payload.files = files;
  }

  return payload;
}

function buildForwardFiles(
  attachments: MessageSnapshot["attachments"],
): ForwardFile[] {
  return attachments.flatMap((attachment) => {
    const url = attachment.url.trim();

    if (url === "") {
      return [];
    }

    const name = attachment.name?.trim();

    if (name) {
      return [{ attachment: url, name }];
    }

    return [{ attachment: url }];
  });
}
