import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseDotenv } from "dotenv";
import YAML from "yaml";

import type { AppConfig } from "./types.js";

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const DEFAULT_TIMES_DB_PATH = "data/times.sqlite";

interface LoadedRoutesConfig {
  sourceChannelId: string;
}

interface LoadAppConfigOptions {
  cwd?: string;
  envPath?: string;
  routesPath?: string;
  baseEnv?: Record<string, string | undefined>;
}

export async function loadAppConfig(
  options: LoadAppConfigOptions = {},
): Promise<AppConfig> {
  const cwd = options.cwd ?? process.cwd();
  const envPath = path.resolve(cwd, options.envPath ?? ".env");
  const routesPath = path.resolve(cwd, options.routesPath ?? "routes.yaml");
  const fileEnv = await loadOptionalEnvFile(envPath);
  const envConfig = parseEnvConfig({
    ...fileEnv,
    ...(options.baseEnv ?? process.env),
  });

  if (!envConfig.enableMessageContentIntent) {
    throw new Error(
      "DISCORD_ENABLE_MESSAGE_CONTENT_INTENT must be true because message persistence requires Message Content Intent.",
    );
  }

  const routesRaw = await readRequiredFile(routesPath, "routes.yaml");
  const routesConfig = parseRoutesConfig(routesRaw);

  return {
    ...envConfig,
    timesDbPath: path.resolve(cwd, envConfig.timesDbPath),
    ...routesConfig,
  };
}

export function parseEnvConfig(
  env: Record<string, string | undefined>,
): Pick<
  AppConfig,
  "discordToken" | "guildId" | "enableMessageContentIntent" | "timesCategoryId" | "timesDbPath"
> {
  const discordToken = readRequiredString(env.DISCORD_TOKEN, "DISCORD_TOKEN");
  const guildId = readSnowflake(env.GUILD_ID, "GUILD_ID");
  const enableMessageContentIntent = readBooleanString(
    env.DISCORD_ENABLE_MESSAGE_CONTENT_INTENT,
    "DISCORD_ENABLE_MESSAGE_CONTENT_INTENT",
    true,
  );
  const timesCategoryId = readSnowflake(
    env.TIMES_CATEGORY_ID,
    "TIMES_CATEGORY_ID",
  );
  const timesDbPath = readOptionalString(
    env.TIMES_DB_PATH,
    DEFAULT_TIMES_DB_PATH,
  );

  return {
    discordToken,
    guildId,
    enableMessageContentIntent,
    timesCategoryId,
    timesDbPath,
  };
}

export function parseRoutesConfig(raw: string): LoadedRoutesConfig {
  const document = YAML.parseDocument(raw);

  if (document.errors.length > 0) {
    throw new Error(
      `routes.yaml is not valid YAML: ${document.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  const parsed = document.toJSON();
  const root = expectRecord(parsed, "routes.yaml");
  const sourceChannelId = readSnowflake(
    root.sourceChannelId,
    "routes.yaml sourceChannelId",
  );

  return {
    sourceChannelId,
  };
}

async function loadOptionalEnvFile(
  envPath: string,
): Promise<Record<string, string | undefined>> {
  try {
    const raw = await readFile(envPath, "utf8");
    return parseDotenv(raw);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw new Error(`Failed to read ${envPath}: ${formatError(error)}`);
  }
}

async function readRequiredFile(filePath: string, label: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read ${label}: ${formatError(error)}`);
  }
}

function readRequiredString(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function readOptionalString(value: unknown, defaultValue: string): string {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("TIMES_DB_PATH must be a non-empty string when provided.");
  }

  return value.trim();
}

function readSnowflake(value: unknown, label: string): string {
  const normalized = readRequiredString(value, label);

  if (!SNOWFLAKE_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a valid Discord snowflake.`);
  }

  return normalized;
}

function readBooleanString(
  value: unknown,
  label: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be "true" or "false" when provided.`);
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`${label} must be "true" or "false" when provided.`);
}

function expectRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function isNodeError(
  error: unknown,
): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
