import { describe, expect, it } from "vitest";

import { decideForward, sanitizeContent } from "../src/forwarding.js";
import type { ForwardingRuntime, MessageSnapshot, RouteConfig } from "../src/types.js";

describe("sanitizeContent", () => {
  it("removes mentions and trims whitespace", () => {
    expect(
      sanitizeContent("hello <@123456789012345678> <#223456789012345678> @everyone"),
    ).toBe("hello");
  });
});

describe("decideForward", () => {
  it("forwards matching user messages with sanitized content and attachments", () => {
    const runtime = createRuntime([
      {
        userId: "323456789012345678",
        destinationChannelId: "423456789012345678",
        enabled: true,
      },
    ]);
    const decision = decideForward(
      createMessage({
        authorId: "323456789012345678",
        content: "hello <@123456789012345678> @here world",
        attachments: [{ url: "https://cdn.example.com/file.png", name: "file.png" }],
      }),
      runtime,
    );

    expect(decision.kind).toBe("forward");

    if (decision.kind !== "forward") {
      return;
    }

    expect(decision.route.destinationChannelId).toBe("423456789012345678");
    expect(decision.sanitizedContent).toBe("hello world");
    expect(decision.payload).toEqual({
      content: "hello world",
      files: [
        {
          attachment: "https://cdn.example.com/file.png",
          name: "file.png",
        },
      ],
      allowedMentions: {
        parse: [],
      },
    });
  });

  it("forwards attachments even when content becomes empty after sanitization", () => {
    const runtime = createRuntime([
      {
        userId: "323456789012345678",
        destinationChannelId: "423456789012345678",
        enabled: true,
      },
    ]);
    const decision = decideForward(
      createMessage({
        authorId: "323456789012345678",
        content: "<@123456789012345678> @everyone",
        attachments: [{ url: "https://cdn.example.com/file.png" }],
      }),
      runtime,
    );

    expect(decision.kind).toBe("forward");

    if (decision.kind !== "forward") {
      return;
    }

    expect(decision.payload).toEqual({
      files: [{ attachment: "https://cdn.example.com/file.png" }],
      allowedMentions: {
        parse: [],
      },
    });
  });

  it("skips empty messages after sanitization when there are no attachments", () => {
    const runtime = createRuntime([
      {
        userId: "323456789012345678",
        destinationChannelId: "423456789012345678",
        enabled: true,
      },
    ]);
    const decision = decideForward(
      createMessage({
        authorId: "323456789012345678",
        content: "<@123456789012345678> @everyone",
      }),
      runtime,
    );

    expect(decision).toEqual({
      kind: "skip",
      reason: "empty_after_sanitization",
    });
  });

  it.each([
    [
      "direct message",
      createMessage({ guildId: null }),
      "not_in_guild",
    ],
    [
      "wrong guild",
      createMessage({ guildId: "999999999999999999" }),
      "wrong_guild",
    ],
    [
      "wrong channel",
      createMessage({ channelId: "999999999999999999" }),
      "wrong_channel",
    ],
    [
      "unregistered user",
      createMessage({ authorId: "999999999999999999" }),
      "no_route",
    ],
    [
      "disabled route",
      createMessage({ authorId: "523456789012345678" }),
      "route_disabled",
    ],
    [
      "bot author",
      createMessage({ authorBot: true }),
      "bot_author",
    ],
    [
      "webhook message",
      createMessage({ webhookId: "623456789012345678" }),
      "webhook_message",
    ],
  ])("skips %s", (_label, message, reason) => {
    const runtime = createRuntime([
      {
        userId: "323456789012345678",
        destinationChannelId: "423456789012345678",
        enabled: true,
      },
      {
        userId: "523456789012345678",
        destinationChannelId: "623456789012345678",
        enabled: false,
      },
    ]);

    expect(decideForward(message, runtime)).toEqual({
      kind: "skip",
      reason,
    });
  });
});

function createRuntime(
  routes: RouteConfig[],
): ForwardingRuntime<RouteConfig> {
  return {
    guildId: "123456789012345678",
    sourceChannelId: "223456789012345678",
    routesByUserId: new Map(routes.map((route) => [route.userId, route])),
  };
}

function createMessage(
  overrides: Partial<MessageSnapshot>,
): MessageSnapshot {
  return {
    id: "723456789012345678",
    guildId: "123456789012345678",
    channelId: "223456789012345678",
    authorId: "323456789012345678",
    authorBot: false,
    webhookId: null,
    content: "hello",
    attachments: [],
    ...overrides,
  };
}
