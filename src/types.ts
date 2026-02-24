/** Response types for the ConfigPig API. */

export interface APIResponse<T> {
  ok: boolean;
  statusCode: number;
  data?: T;
  error?: string;
}

// ── Config types ──

export interface LabelInfo {
  label_name: string;
  version_number: number;
  is_system: boolean;
  updated_at: string;
}

export interface Config {
  id: string;
  slug: string;
  name: string;
  description: string;
  format: string;
  tags: string[];
  version_count: number;
  labels: LabelInfo[];
  created_at: string;
  updated_at: string;
}

export interface ConfigSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  format: string;
  tags: string[];
  version_count: number;
  updated_at: string;
}

export interface ConfigVersion {
  id: string;
  version_number: number;
  content: string;
  change_note: string;
  created_by: string | null;
  created_at: string;
}

export interface FetchResult {
  content: string;
  format: string;
  version_number: number;
  label: string;
}

// ── Label types ──

export interface TeamLabel {
  id: string;
  name: string;
  is_protected: boolean;
  is_system: boolean;
  description: string;
  created_at: string;
}

export interface ConfigLabel {
  label_name: string;
  version_number: number;
  is_system: boolean;
  updated_at: string;
}

// ── Export types ──

export interface Export {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

// ── System types ──

export interface HealthCheck {
  status: string;
  version: string;
  timestamp: string;
}

// ── Request types ──

export interface CreateConfigOptions {
  name: string;
  slug: string;
  content: string;
  description?: string;
  format?: string;
  tags?: string[];
  changeNote?: string;
}

export interface UpdateConfigOptions {
  name?: string;
  description?: string;
  tags?: string[];
}

export interface FetchOptions {
  label?: string;
  outputFormat?: string;
}

export interface CreateLabelOptions {
  name: string;
  isProtected?: boolean;
  description?: string;
}

export interface CreateExportOptions {
  name: string;
  description?: string;
}

// ── Drop-in function types ──

export interface GetConfigOptions {
  label?: string;
  outputFormat?: string;
  fallback?: string;
  ttl?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface ConfigureOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultLabel?: string;
  defaultTtl?: number;
}
