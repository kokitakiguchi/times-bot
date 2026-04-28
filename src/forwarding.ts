import type {
  ForwardFile,
  ForwardPayload,
  MessageSnapshot,
  RouteConfig,
} from "./types.js";

const MENTION_PATTERN = /<@!?\d+>|<@&\d+>|<#\d+>|@everyone|@here/g;

export type MessageSkipReason =
  | "not_in_guild"
  | "wrong_guild"
  | "wrong_channel"
  | "bot_author"
  | "webhook_message"
  | "empty_after_sanitization"
  | "unregistered_user"
  | "disabled_route";

export interface ForwardingRuntime {
  guildId: string;
  sourceChannelId: string;
  routesByUserId?: Map<string, RouteConfig>;
}

export function sanitizeContent(content: string): string {
  return content
    .replace(MENTION_PATTERN, " ")
    .split("\n")
    .map((line) => line.replace(/[^\S\r\n]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type DecideForwardResult =
  | { kind: "skip"; reason: MessageSkipReason }
  | {
      kind: "forward";
      route: RouteConfig & { channel?: any };
      sanitizedContent: string;
      payload: ForwardPayload;
      hasAttachments: boolean;
    };

export function decideForward(
  message: MessageSnapshot,
  runtime: ForwardingRuntime,
): DecideForwardResult {
  // Basic validation
  if (message.guildId === null) {
    return {
      kind: "skip",
      reason: "not_in_guild",
    };
  }

  if (message.guildId !== runtime.guildId) {
    return {
      kind: "skip",
      reason: "wrong_guild",
    };
  }

  if (message.channelId !== runtime.sourceChannelId) {
    return {
      kind: "skip",
      reason: "wrong_channel",
    };
  }

  if (message.authorBot) {
    return {
      kind: "skip",
      reason: "bot_author",
    };
  }

  if (message.webhookId !== null) {
    return {
      kind: "skip",
      reason: "webhook_message",
    };
  }

  // Check if user is registered (old routes-based approach)
  const routes = runtime.routesByUserId ?? new Map();
  const route = routes.get(message.authorId);

  if (!route) {
    return {
      kind: "skip",
      reason: "unregistered_user",
    };
  }

  if (route.enabled === false) {
    return {
      kind: "skip",
      reason: "disabled_route",
    };
  }

  // Build forward request
  const sanitizedContent = sanitizeContent(message.content);
  const files = buildForwardFiles(message.attachments);

  if (sanitizedContent === "" && files.length === 0) {
    return {
      kind: "skip",
      reason: "empty_after_sanitization",
    };
  }

  return {
    kind: "forward",
    route,
    sanitizedContent,
    payload: buildForwardPayload(sanitizedContent, files),
    hasAttachments: files.length > 0,
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
