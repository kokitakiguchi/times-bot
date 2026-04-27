export type Snowflake = string;

export interface RouteConfig {
  userId: Snowflake;
  destinationChannelId: Snowflake;
  enabled: boolean;
}

export interface AppConfig {
  discordToken: string;
  guildId: Snowflake;
  enableMessageContentIntent: boolean;
  sourceChannelId: Snowflake;
  routes: RouteConfig[];
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

export interface ForwardingRuntime<T extends RouteConfig = RouteConfig> {
  guildId: Snowflake;
  sourceChannelId: Snowflake;
  routesByUserId: ReadonlyMap<Snowflake, T>;
}
