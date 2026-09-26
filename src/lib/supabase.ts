import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Sem estas variáveis a app funciona em "modo local" (dados só no browser),
 * como na v0.1/v0.2. Com elas, há login, papéis e sync com o Supabase.
 */
export const supabase: SupabaseClient | null =
  url && key && typeof window !== "undefined"
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

export const cloudConfigured = Boolean(url && key);
