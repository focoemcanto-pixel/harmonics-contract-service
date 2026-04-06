const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL não definida.');
  }

  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não definida.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

module.exports = { getSupabaseAdmin };
