/** pig init — generate a master key from a passphrase. */

import * as readline from "node:readline";
import { deriveMasterKey } from "../crypto/vault.js";

/** Read a line from stdin with echo disabled (hidden input). */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Mute output to hide passphrase
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((
      chunk: string | Uint8Array,
      ...args: unknown[]
    ): boolean => {
      if (typeof chunk === "string" && chunk.includes(prompt)) {
        return origWrite(chunk, ...(args as [BufferEncoding, (err?: Error | null) => void]));
      }
      return true;
    }) as typeof process.stdout.write;

    rl.question(prompt, (answer) => {
      process.stdout.write = origWrite;
      origWrite("\n");
      rl.close();
      resolve(answer);
    });
  });
}

export async function cmdInit(): Promise<void> {
  const passphrase = await readHidden(
    "Enter a passphrase for your master key: "
  );
  if (!passphrase) {
    process.stderr.write("Error: passphrase cannot be empty.\n");
    process.exit(1);
  }

  const confirm = await readHidden("Confirm passphrase: ");
  if (passphrase !== confirm) {
    process.stderr.write("Error: passphrases do not match.\n");
    process.exit(1);
  }

  const [masterKey, salt] = await deriveMasterKey(passphrase);
  const keyHex = Buffer.from(masterKey).toString("hex");
  const saltHex = Buffer.from(salt).toString("hex");

  console.log();
  console.log("Master key generated successfully.");
  console.log();
  console.log(
    "Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
  );
  console.log();
  console.log(`  export CONFIGPIG_MASTER_KEY=${keyHex}`);
  console.log();
  console.log(
    "IMPORTANT: Store this salt securely — you need it to re-derive the key:"
  );
  console.log(`  Salt: ${saltHex}`);
  console.log();
  console.log(
    "The master key never leaves your machine. ConfigPig cannot read your secrets."
  );
}
