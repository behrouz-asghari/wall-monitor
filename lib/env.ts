/**
 * Environment variable helpers.
 *
 * All server-side secrets are read lazily (never at module top level) so that
 * `next build` succeeds without a fully configured environment and so that no
 * secret can ever be inlined into a client bundle.
 */

export class MissingEnvError extends Error {
  readonly variable: string;

  constructor(variable: string, hint?: string) {
    super(
      `Missing required environment variable "${variable}".` +
        (hint ? ` ${hint}` : "") +
        " See .env.example.",
    );
    this.name = "MissingEnvError";
    this.variable = variable;
  }
}

/** Read a required environment variable, throwing a helpful error when absent. */
export function requireEnv(name: string, hint?: string): string {
  const value = process.env[name];
  if (value === undefined || value === null || value.trim() === "") {
    throw new MissingEnvError(name, hint);
  }
  return value;
}

/** Read an optional environment variable with a fallback. */
export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
