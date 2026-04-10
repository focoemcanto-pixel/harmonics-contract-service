import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

export function getSupabaseAdminClient() {
  if (cachedClient) return cachedClient;

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL não definida.');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não definida.');
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}
