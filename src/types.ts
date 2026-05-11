export type Snowflake = string;

export interface AppConfig {
  discordToken: string;
  guildId: Snowflake;
  enableMessageContentIntent: boolean;
  sourceChannelId: Snowflake;
  timesCategoryId: Snowflake;
  timesDbPath: string;
  timesAggregateChannelId?: Snowflake;
}

export interface ForwardAttachment {
  url: string;
  name?: string;
}

export interface MessageSnapshot {
  id: string;
  guildId: Snowflake | null;
  channelId: Snowflake;
  authorId: Snowflake;
  authorBot: boolean;
  webhookId: Snowflake | null;
  content: string;
  attachments: ForwardAttachment[];
}

export interface ForwardFile {
  attachment: string;
  name?: string;
}

export interface ForwardPayload {
  content?: string;
  files?: ForwardFile[];
  allowedMentions: {
    parse: [];
  };
}

export interface ForwardingContext {
  guildId: Snowflake;
  sourceChannelId: Snowflake;
}

export interface StoredUser {
  userId: Snowflake;
  guildId: Snowflake;
  username: string;
  displayName: string | null;
  destinationChannelId: Snowflake;
  destinationChannelName: string;
  isActive: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertUserInput {
  userId: Snowflake;
  guildId: Snowflake;
  username: string;
  displayName: string | null;
  destinationChannelId: Snowflake;
  destinationChannelName: string;
  seenAt: string;
}

export interface StoredMessage {
  sourceMessageId: Snowflake;
  userId: Snowflake;
  guildId: Snowflake;
  sourceChannelId: Snowflake;
  destinationChannelId: Snowflake;
  forwardedMessageId: Snowflake;
  content: string;
  hasAttachments: boolean;
  sourceCreatedAt: string;
  sourceEditedAt: string | null;
  sourceDeletedAt: string | null;
  recordCreatedAt: string;
  recordUpdatedAt: string;
}

export interface SaveMessageInput {
  sourceMessageId: Snowflake;
  userId: Snowflake;
  guildId: Snowflake;
  sourceChannelId: Snowflake;
  destinationChannelId: Snowflake;
  forwardedMessageId: Snowflake;
  content: string;
  hasAttachments: boolean;
  sourceCreatedAt: string;
  recordedAt: string;
}

export interface RouteConfig {
  userId?: string;
  destinationChannelId?: string;
  enabled?: boolean;
}

