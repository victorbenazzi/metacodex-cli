export const MCX_VERSION = "0.0.1";
export const MCX_BIN = "mcx";
export const MCX_PRODUCT = "metacodex-cli";
export const PI_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
export const PI_SKIP_VERSION_CHECK_ENV = "PI_SKIP_VERSION_CHECK";

/** Pi checks pi.dev and tells people to run `pi update`. mcx pins the engine. */
export function pinEngineUpdates(env: NodeJS.ProcessEnv = process.env): void {
  env[PI_SKIP_VERSION_CHECK_ENV] = "1";
}
