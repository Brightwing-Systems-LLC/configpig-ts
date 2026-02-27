/**
 * pig daemon — lightweight rotation daemon.
 *
 * Polls the ConfigPig server for pending rotation events, executes them
 * using the appropriate provider adapter, re-encrypts the new secret,
 * and uploads the ciphertext back to the server.
 */

import { Client } from "../client.js";
import { loadMasterKey, encryptSecret, fingerprint } from "../crypto/vault.js";
import { getProvider } from "../rotation/registry.js";

interface DaemonArgs {
  subcommand: "start" | "run-once";
  interval: number;
  apiKey: string;
  baseUrl: string;
}

async function failEvent(
  baseUrl: string,
  apiKey: string,
  eventId: string,
  error: string
): Promise<void> {
  console.error(`Rotation failed [${eventId}]: ${error}`);
  await fetch(`${baseUrl}/api/v1/rotation/events/${eventId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "failed", error_message: error }),
  });
}

async function updateEventStatus(
  baseUrl: string,
  apiKey: string,
  eventId: string,
  body: Record<string, unknown>
): Promise<void> {
  await fetch(`${baseUrl}/api/v1/rotation/events/${eventId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function pollAndExecute(
  client: Client,
  masterKey: Uint8Array,
  baseUrl: string,
  apiKey: string
): Promise<number> {
  // Fetch pending rotation events
  const resp = await fetch(`${baseUrl}/api/v1/rotation/pending`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resp.ok) {
    console.warn(`Failed to fetch pending rotations: ${resp.status}`);
    return 0;
  }

  const events = (await resp.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(events)) return 0;

  let processed = 0;

  for (const event of events) {
    const eventId = String(event.id);
    const configSlug = String(event.config_slug);
    const secretKey = String(event.secret_key);
    const environment = String(event.environment ?? "default");
    const providerName = String(event.provider ?? "custom");

    console.log(
      `Processing rotation: ${configSlug}/${secretKey} (${environment}) [${providerName}]`
    );

    // Mark executing
    await updateEventStatus(baseUrl, apiKey, eventId, {
      status: "executing",
    });

    // Get current secret (decrypted)
    const secretResp = await client.getSecretDecrypted(
      configSlug,
      secretKey,
      { environment }
    );
    if (!secretResp.ok || secretResp.data === undefined) {
      await failEvent(
        baseUrl,
        apiKey,
        eventId,
        `Could not fetch secret: ${secretResp.error}`
      );
      continue;
    }

    const currentValue = secretResp.data;

    // Get provider and rotate
    let provider;
    try {
      provider = getProvider(
        providerName,
        (event.provider_config as Record<string, unknown>) ?? undefined
      );
    } catch (err) {
      await failEvent(baseUrl, apiKey, eventId, String(err));
      continue;
    }

    const result = await provider.rotate(currentValue);
    if (!result.success) {
      await failEvent(baseUrl, apiKey, eventId, result.error);
      continue;
    }

    // Mark encrypting
    await updateEventStatus(baseUrl, apiKey, eventId, {
      status: "encrypting",
    });

    // Encrypt new secret
    const newCiphertext = encryptSecret(masterKey, result.newSecret);
    const newFp = await fingerprint(newCiphertext);

    // Upload to server
    const updateResp = await fetch(
      `${baseUrl}/api/v1/secrets/${configSlug}/keys/${secretKey}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          environment,
          ciphertext: newCiphertext,
          fingerprint: newFp,
        }),
      }
    );

    if (!updateResp.ok) {
      await failEvent(
        baseUrl,
        apiKey,
        eventId,
        `Failed to upload rotated secret (HTTP ${updateResp.status})`
      );
      continue;
    }

    // Mark uploaded
    await updateEventStatus(baseUrl, apiKey, eventId, {
      status: "uploaded",
      new_fingerprint: newFp,
    });

    // Mark confirmed
    await updateEventStatus(baseUrl, apiKey, eventId, {
      status: "confirmed",
    });

    console.log(`Rotation complete: ${configSlug}/${secretKey}`);
    processed++;
  }

  return processed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cmdDaemon(args: DaemonArgs): Promise<void> {
  const masterKey = loadMasterKey();
  const baseUrl = (args.baseUrl || "https://configpig.com").replace(
    /\/+$/,
    ""
  );

  const client = new Client({
    apiKey: args.apiKey || undefined,
    baseUrl: args.baseUrl || undefined,
    masterKey,
  });

  if (args.subcommand === "run-once") {
    const processed = await pollAndExecute(
      client,
      masterKey,
      baseUrl,
      args.apiKey
    );
    if (processed) {
      console.log(`Processed ${processed} rotation event(s).`);
    } else {
      console.log("No pending rotation events.");
    }
    return;
  }

  // start — polling loop
  let running = true;

  const shutdown = () => {
    running = false;
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(
    `Rotation daemon started — polling every ${args.interval}s.`
  );
  console.log("Press Ctrl+C to stop.\n");

  while (running) {
    try {
      const processed = await pollAndExecute(
        client,
        masterKey,
        baseUrl,
        args.apiKey
      );
      if (processed) {
        console.log(`Processed ${processed} rotation event(s)`);
      }
    } catch (err) {
      console.error("Error in daemon poll loop:", err);
    }

    // Sleep in 1-second increments for signal responsiveness
    for (let i = 0; i < args.interval && running; i++) {
      await sleep(1000);
    }
  }

  console.log("\nDaemon stopped.");
}
