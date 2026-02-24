/** ConfigPig — TypeScript SDK for managing configs via API. */

export { Client } from "./client.js";
export type { ClientConfig } from "./client.js";
export { configure, getConfig } from "./drop-in.js";
export type {
  APIResponse,
  Config,
  ConfigLabel,
  ConfigSummary,
  ConfigVersion,
  ConfigureOptions,
  CreateConfigOptions,
  CreateExportOptions,
  CreateLabelOptions,
  Export,
  FetchOptions,
  FetchResult,
  GetConfigOptions,
  HealthCheck,
  LabelInfo,
  TeamLabel,
  UpdateConfigOptions,
} from "./types.js";
