import "server-only";

/**
 * Server-only environment access (ADR-0002 Config layer).
 * Never expose these through NEXT_PUBLIC_ variables.
 */
export type AuthConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** The single owner account's email (ADR-0003 D2). S01 asks only for the password. */
  ownerEmail: string;
};

export class ConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `Missing server environment variables: ${missing.join(", ")}. ` +
        "Fix: copy .env.example to .env.local and fill in the values, " +
        "or set them in the Vercel project settings.",
    );
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

export function readAuthConfig(env: Env = process.env): AuthConfig {
  const values = {
    SUPABASE_URL: env.SUPABASE_URL?.trim(),
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY?.trim(),
    OWNER_EMAIL: env.OWNER_EMAIL?.trim(),
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) throw new ConfigError(missing);
  return {
    supabaseUrl: values.SUPABASE_URL!,
    supabaseAnonKey: values.SUPABASE_ANON_KEY!,
    ownerEmail: values.OWNER_EMAIL!,
  };
}

/** Like readAuthConfig but returns null instead of throwing. */
export function tryReadAuthConfig(env: Env = process.env): AuthConfig | null {
  try {
    return readAuthConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }
}
