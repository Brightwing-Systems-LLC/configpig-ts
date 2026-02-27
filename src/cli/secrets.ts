/** pig set-secret / pig get-secret — encrypt and store/retrieve secrets. */

import { Client } from "../client.js";

interface SetSecretArgs {
  configSlug: string;
  key: string;
  value: string;
  environment: string;
  apiKey: string;
  baseUrl: string;
}

interface GetSecretArgs {
  configSlug: string;
  key: string;
  environment: string;
  apiKey: string;
  baseUrl: string;
}

export async function cmdSetSecret(args: SetSecretArgs): Promise<void> {
  let value = args.value;

  // Read from stdin if value is "-"
  if (value === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    value = Buffer.concat(chunks).toString("utf-8").trim();
  }

  const client = new Client({
    apiKey: args.apiKey || undefined,
    baseUrl: args.baseUrl || undefined,
  });

  const resp = await client.setSecretPlaintext(
    args.configSlug,
    args.key,
    value,
    { environment: args.environment }
  );

  if (resp.ok) {
    console.log(
      `Secret '${args.key}' stored for config '${args.configSlug}' (${args.environment}).`
    );
  } else {
    process.stderr.write(`Error: ${resp.error}\n`);
    process.exit(1);
  }
}

export async function cmdGetSecret(args: GetSecretArgs): Promise<void> {
  const client = new Client({
    apiKey: args.apiKey || undefined,
    baseUrl: args.baseUrl || undefined,
  });

  const resp = await client.getSecretDecrypted(args.configSlug, args.key, {
    environment: args.environment,
  });

  if (resp.ok && resp.data !== undefined) {
    console.log(resp.data);
  } else {
    process.stderr.write(`Error: ${resp.error}\n`);
    process.exit(1);
  }
}
