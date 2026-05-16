import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { StoredMessage, StoredUser, UpsertUserInput, SaveMessageInput } from "./types.js";

export interface TimesStore {
  upsertUser(input: UpsertUserInput): void;
  getUser(userId: string): StoredUser | undefined;
  saveMessage(input: SaveMessageInput): void;
  getMessage(sourceMessageId: string): StoredMessage | undefined;
  updateMessageContent(sourceMessageId: string, content: string, editedAt: string): void;
  deleteMessage(sourceMessageId: string, deletedAt: string): void;
  close(): void;
}

export async function initializeTimes(dbPath: string): Promise<TimesStore> {
  // Ensure the directory exists
  const dir = path.dirname(dbPath);
  await mkdir(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      destination_channel_id TEXT NOT NULL UNIQUE,
      destination_channel_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      source_message_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      source_channel_id TEXT NOT NULL,
      destination_channel_id TEXT NOT NULL,
      forwarded_message_id TEXT NOT NULL,
      content TEXT NOT NULL,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      source_created_at TEXT NOT NULL,
      source_edited_at TEXT,
      source_deleted_at TEXT,
      record_created_at TEXT NOT NULL,
      record_updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_guild_id ON messages(guild_id);
    CREATE INDEX IF NOT EXISTS idx_messages_source_channel_id ON messages(source_channel_id);
    CREATE INDEX IF NOT EXISTS idx_users_guild_id ON users(guild_id);
  `);

  return {
    upsertUser(input: UpsertUserInput): void {
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO users (
          user_id, guild_id, username, display_name, 
          destination_channel_id, destination_channel_name,
          first_seen_at, last_seen_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          username = excluded.username,
          display_name = excluded.display_name,
          last_seen_at = excluded.last_seen_at,
          updated_at = ?
      `);

      stmt.run(
        input.userId,
        input.guildId,
        input.username,
        input.displayName,
        input.destinationChannelId,
        input.destinationChannelName,
        input.seenAt,
        input.seenAt,
        now,
        now,
        now,
      );
    },

    getUser(userId: string): StoredUser | undefined {
      const stmt = db.prepare("SELECT * FROM users WHERE user_id = ?");
      const row = stmt.get(userId) as any;

      if (!row) {
        return undefined;
      }

      return {
        userId: row.user_id,
        guildId: row.guild_id,
        username: row.username,
        displayName: row.display_name,
        destinationChannelId: row.destination_channel_id,
        destinationChannelName: row.destination_channel_name,
        isActive: row.is_active === 1,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    saveMessage(input: SaveMessageInput): void {
      const stmt = db.prepare(`
        INSERT INTO messages (
          source_message_id, user_id, guild_id, source_channel_id,
          destination_channel_id, forwarded_message_id, content, has_attachments,
          source_created_at, record_created_at, record_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        input.sourceMessageId,
        input.userId,
        input.guildId,
        input.sourceChannelId,
        input.destinationChannelId,
        input.forwardedMessageId,
        input.content,
        input.hasAttachments ? 1 : 0,
        input.sourceCreatedAt,
        input.recordedAt,
        input.recordedAt,
      );
    },

    getMessage(sourceMessageId: string): StoredMessage | undefined {
      const stmt = db.prepare("SELECT * FROM messages WHERE source_message_id = ?");
      const row = stmt.get(sourceMessageId) as any;

      if (!row) {
        return undefined;
      }

      return {
        sourceMessageId: row.source_message_id,
        userId: row.user_id,
        guildId: row.guild_id,
        sourceChannelId: row.source_channel_id,
        destinationChannelId: row.destination_channel_id,
        forwardedMessageId: row.forwarded_message_id,
        content: row.content,
        hasAttachments: row.has_attachments === 1,
        sourceCreatedAt: row.source_created_at,
        sourceEditedAt: row.source_edited_at,
        sourceDeletedAt: row.source_deleted_at,
        recordCreatedAt: row.record_created_at,
        recordUpdatedAt: row.record_updated_at,
      };
    },

    updateMessageContent(sourceMessageId: string, content: string, editedAt: string): void {
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        UPDATE messages
        SET content = ?, source_edited_at = ?, record_updated_at = ?
        WHERE source_message_id = ?
      `);

      stmt.run(content, editedAt, now, sourceMessageId);
    },

    deleteMessage(sourceMessageId: string, deletedAt: string): void {
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        UPDATE messages
        SET source_deleted_at = ?, record_updated_at = ?
        WHERE source_message_id = ?
      `);

      stmt.run(deletedAt, now, sourceMessageId);
    },

    close(): void {
      db.close();
    },
  };
}
