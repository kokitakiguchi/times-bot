import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadAppConfig } from "../src/config.js";

describe("loadAppConfig", () => {
  it("loads .env and routes.yaml and defaults enabled to true", async () => {
    const cwd = await createTempProject();

    await writeFile(
      path.join(cwd, ".env"),
      "DISCORD_TOKEN=test-token\nGUILD_ID=123456789012345678\nTIMES_CATEGORY_ID=123456789012345699\n",
      "utf8",
    );
    await writeFile(
      path.join(cwd, "routes.yaml"),
      'sourceChannelId: "223456789012345678"\n',
      "utf8",
    );

    const config = await loadAppConfig({ cwd, baseEnv: {} });

    expect(config.discordToken).toBe("test-token");
    expect(config.guildId).toBe("123456789012345678");
    expect(config.enableMessageContentIntent).toBe(true);
    expect(config.sourceChannelId).toBe("223456789012345678");
    expect(config.timesCategoryId).toBe("123456789012345699");
  });

  it("fails when required env values are missing", async () => {
    const cwd = await createTempProject();

    await writeFile(path.join(cwd, "routes.yaml"), 'sourceChannelId: "223456789012345678"\n', "utf8");

    await expect(loadAppConfig({ cwd, baseEnv: {} })).rejects.toThrow(
      "DISCORD_TOKEN is required.",
    );
  });

  it("fails when TIMES_CATEGORY_ID is missing", async () => {
    const cwd = await createTempProject();

    await writeFile(
      path.join(cwd, ".env"),
      "DISCORD_TOKEN=test-token\nGUILD_ID=123456789012345678\n",
      "utf8",
    );
    await writeFile(
      path.join(cwd, "routes.yaml"),
      'sourceChannelId: "223456789012345678"\n',
      "utf8",
    );

    await expect(loadAppConfig({ cwd, baseEnv: {} })).rejects.toThrow(
      "TIMES_CATEGORY_ID is required.",
    );
  });

  it("fails on invalid yaml", async () => {
    const cwd = await createTempProject();

    await writeFile(
      path.join(cwd, ".env"),
      "DISCORD_TOKEN=test-token\nGUILD_ID=123456789012345678\nTIMES_CATEGORY_ID=123456789012345699\n",
      "utf8",
    );
    await writeFile(path.join(cwd, "routes.yaml"), "sourceChannelId: [\n", "utf8");

    await expect(loadAppConfig({ cwd, baseEnv: {} })).rejects.toThrow(
      /routes\.yaml is not valid YAML:/,
    );
  });

  it("fails on missing required route fields", async () => {
    const cwd = await createTempProject();

    await writeFile(
      path.join(cwd, ".env"),
      "DISCORD_TOKEN=test-token\nGUILD_ID=123456789012345678\nTIMES_CATEGORY_ID=123456789012345699\n",
      "utf8",
    );
    await writeFile(
      path.join(cwd, "routes.yaml"),
      "sourceChannelId:\n",
      "utf8",
    );

    await expect(loadAppConfig({ cwd, baseEnv: {} })).rejects.toThrow(
      "routes.yaml sourceChannelId is required.",
    );
  });

  it("allows disabling Message Content Intent from env", async () => {
    const cwd = await createTempProject();

    await writeFile(
      path.join(cwd, ".env"),
      [
        "DISCORD_TOKEN=test-token",
        "GUILD_ID=123456789012345678",
        "TIMES_CATEGORY_ID=123456789012345699",
        "DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(cwd, "routes.yaml"),
      'sourceChannelId: "223456789012345678"\n',
      "utf8",
    );

    // Should fail because Message Content Intent is required for message persistence
    await expect(loadAppConfig({ cwd, baseEnv: {} })).rejects.toThrow(
      "DISCORD_ENABLE_MESSAGE_CONTENT_INTENT must be true because message persistence requires Message Content Intent.",
    );
  });

  it("fails on invalid Message Content Intent env values", async () => {
    const cwd = await createTempProject();

    await writeFile(
      path.join(cwd, ".env"),
      [
        "DISCORD_TOKEN=test-token",
        "GUILD_ID=123456789012345678",
        "TIMES_CATEGORY_ID=123456789012345699",
        "DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=maybe",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(cwd, "routes.yaml"),
      'sourceChannelId: "223456789012345678"\n',
      "utf8",
    );

    await expect(loadAppConfig({ cwd, baseEnv: {} })).rejects.toThrow(
      'DISCORD_ENABLE_MESSAGE_CONTENT_INTENT must be "true" or "false" when provided.',
    );
  });
});

async function createTempProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "times-bot-"));
}
