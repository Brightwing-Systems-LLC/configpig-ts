# ConfigPig — TypeScript SDK

TypeScript SDK for [ConfigPig](https://configpig.com), a managed config file registry for teams.

## Installation

```bash
npm install configpig
```

## Configuration

Set environment variables or pass directly to the client:

```bash
export CONFIGPIG_API_KEY="sk-api01-your-key-here"
export CONFIGPIG_URL="https://configpig.com"  # optional, this is the default
```

## Quick Start — `getConfig()`

The simplest way to use ConfigPig. One function, no boilerplate:

```typescript
import { getConfig } from "configpig";

// Fetch a config
const content = await getConfig("my-config");

// With a specific label
const content = await getConfig("my-config", { label: "production" });

// With format conversion
const content = await getConfig("my-config", { outputFormat: "yaml" });

// With a fallback if the service is unreachable
const content = await getConfig("my-config", { fallback: '{"default": true}' });

// With TTL caching (seconds)
const content = await getConfig("my-config", { ttl: 300 });
```

Set global defaults so you don't repeat yourself:

```typescript
import { configure } from "configpig";

configure({
  apiKey: "sk-api01-...",
  baseUrl: "https://configpig.com",
  defaultLabel: "latest",
  defaultTtl: 300,
});
```

## Using the Full Client

For advanced use cases (creating configs, managing versions, labels, etc.):

```typescript
import { Client } from "configpig";

const client = new Client();

// List all configs
const result = await client.listConfigs();
if (result.ok) {
  for (const cfg of result.data!) {
    console.log(`${cfg.slug}: ${cfg.name}`);
  }
}

// Get a specific config
const result = await client.getConfig("my-config");
if (result.ok) {
  console.log(result.data!.name);
}

// Fetch config content with optional format conversion
const result = await client.fetch("my-config", { label: "latest", outputFormat: "yaml" });
if (result.ok) {
  console.log(result.data!.content);
}

// Create a new config
const result = await client.createConfig({
  name: "App Settings",
  slug: "app-settings",
  content: '{"debug": false, "log_level": "info"}',
  format: "json",
  tags: ["app"],
});

// Create a new version
const result = await client.createVersion("app-settings", {
  content: '{"debug": false, "log_level": "warn"}',
  changeNote: "Changed log level to warn",
});

// Promote a version to a label
const result = await client.promote("app-settings", { version: 2, label: "production" });
```

## API Reference

All methods return `APIResponse<T>` with fields:
- `ok: boolean` — whether the request succeeded
- `statusCode: number` — HTTP status code
- `data?: T` — response data (when `ok` is true)
- `error?: string` — error message (when `ok` is false)

### Configs

| Method | Description |
|---|---|
| `listConfigs(options?)` | List all configs |
| `getConfig(slug)` | Get config details |
| `createConfig(options)` | Create a new config |
| `updateConfig(slug, options)` | Update config metadata |
| `deleteConfig(slug)` | Delete a config |

### Versions

| Method | Description |
|---|---|
| `listVersions(slug)` | List all versions |
| `getVersion(slug, versionNumber)` | Get specific version |
| `createVersion(slug, options)` | Create a new version |

### Fetch

| Method | Description |
|---|---|
| `fetch(slug, options?)` | Fetch config content with optional format conversion |

### Labels

| Method | Description |
|---|---|
| `listLabels()` | List team labels |
| `createLabel(options)` | Create a team label |
| `deleteLabel(name)` | Delete a team label |
| `listConfigLabels(slug)` | List labels for a config |
| `assignLabel(slug, options)` | Assign label to version |

### Promote / Rollback

| Method | Description |
|---|---|
| `promote(slug, options)` | Assign label to a version |
| `rollback(slug, options)` | Rollback label to previous version |

### Exports

| Method | Description |
|---|---|
| `listExports()` | List exports |
| `createExport(options)` | Create an export |
| `getExport(exportId)` | Get export details |
| `deleteExport(exportId)` | Delete an export |

### System

| Method | Description |
|---|---|
| `healthCheck()` | Check API health |

## License

MIT — Bright Wing Solutions LLC
