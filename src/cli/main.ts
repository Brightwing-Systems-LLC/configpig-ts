#!/usr/bin/env node

/**
 * CLI entry point for the `pig` command.
 *
 * Usage:
 *     pig init                          — Generate a master key
 *     pig set-secret <slug> <key> <val> — Store an encrypted secret
 *     pig get-secret <slug> <key>       — Retrieve and decrypt a secret
 *     pig wrap <file>                   — Scan config for secrets
 *     pig daemon start|run-once         — Rotation daemon
 */

import { Command } from "commander";
import { cmdInit } from "./init.js";
import { cmdSetSecret, cmdGetSecret } from "./secrets.js";
import { cmdWrap } from "./wrap.js";
import { cmdDaemon } from "./daemon.js";

const program = new Command();

program
  .name("pig")
  .description("ConfigPig CLI — zero-knowledge secrets management")
  .option(
    "--api-key <key>",
    "API key (default: CONFIGPIG_API_KEY env var)",
    process.env.CONFIGPIG_API_KEY ?? ""
  )
  .option(
    "--base-url <url>",
    "Base URL (default: CONFIGPIG_URL env var or https://configpig.com)",
    process.env.CONFIGPIG_URL ?? "https://configpig.com"
  );

// pig init
program
  .command("init")
  .description("Generate a master key from a passphrase")
  .action(() => cmdInit());

// pig set-secret
program
  .command("set-secret <config-slug> <key> <value>")
  .description("Store an encrypted secret")
  .option("-e, --environment <env>", "Environment", "default")
  .action((configSlug, key, value, opts) => {
    const parent = program.opts();
    cmdSetSecret({
      configSlug,
      key,
      value,
      environment: opts.environment,
      apiKey: parent.apiKey,
      baseUrl: parent.baseUrl,
    });
  });

// pig get-secret
program
  .command("get-secret <config-slug> <key>")
  .description("Retrieve and decrypt a secret")
  .option("-e, --environment <env>", "Environment", "default")
  .action((configSlug, key, opts) => {
    const parent = program.opts();
    cmdGetSecret({
      configSlug,
      key,
      environment: opts.environment,
      apiKey: parent.apiKey,
      baseUrl: parent.baseUrl,
    });
  });

// pig wrap
program
  .command("wrap <file>")
  .description("Scan a config file for secrets and replace with vault references")
  .requiredOption(
    "-c, --config-slug <slug>",
    "Config namespace slug to store secrets under"
  )
  .option("-e, --environment <env>", "Environment", "default")
  .option("-y, --yes", "Auto-confirm all detected secrets", false)
  .action((file, opts) => {
    const parent = program.opts();
    cmdWrap({
      file,
      configSlug: opts.configSlug,
      environment: opts.environment,
      autoConfirm: opts.yes,
      apiKey: parent.apiKey,
      baseUrl: parent.baseUrl,
    });
  });

// pig daemon
const daemon = program
  .command("daemon")
  .description("Rotation daemon — poll for and execute secret rotations");

daemon
  .command("start")
  .description("Start the daemon polling loop")
  .option("-i, --interval <seconds>", "Poll interval in seconds", "60")
  .action((opts) => {
    const parent = program.opts();
    cmdDaemon({
      subcommand: "start",
      interval: parseInt(opts.interval, 10),
      apiKey: parent.apiKey,
      baseUrl: parent.baseUrl,
    });
  });

daemon
  .command("run-once")
  .description("Run a single poll cycle then exit")
  .action(() => {
    const parent = program.opts();
    cmdDaemon({
      subcommand: "run-once",
      interval: 60,
      apiKey: parent.apiKey,
      baseUrl: parent.baseUrl,
    });
  });

program.parse();
