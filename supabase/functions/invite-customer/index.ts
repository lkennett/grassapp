import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser(authorization.slice(7));
  if (authError || !authData.user) return json({ error: 'Invalid session' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (profileError) return json({ error: 'Unable to verify employee access' }, 500);
  if (profile?.role !== 'employee') return json({ error: 'Employee access required' }, 403);

  let input: { name?: unknown; email?: unknown; phone?: unknown; service_address?: unknown };
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const serviceAddress = typeof input.service_address === 'string' ? input.service_address.trim() : '';
  if (name.length < 1 || name.length > 160) return json({ error: 'Name must be between 1 and 160 characters' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'A valid email is required' }, 400);
  if (phone.length > 40 || serviceAddress.length > 300) return json({ error: 'Phone or address is too long' }, 400);

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: name },
  });
  if (inviteError || !invited.user) return json({ error: inviteError?.message ?? 'Invite failed' }, 400);

  const userId = invited.user.id;
  const { error: profileInsertError } = await admin.from('profiles').insert({
    user_id: userId,
    role: 'customer',
    display_name: name,
  });
  if (profileInsertError) {
    await admin.auth.admin.deleteUser(userId);
    return json({ error: 'Could not create customer profile' }, 500);
  }

  const { data: customer, error: customerInsertError } = await admin
    .from('customers')
    .insert({ user_id: userId, name, email, phone, service_address: serviceAddress })
    .select('id, user_id, name, email, phone, service_address, created_at')
    .single();
  if (customerInsertError) {
    await admin.from('profiles').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId);
    return json({ error: 'Could not create customer record' }, 500);
  }

  return json({ customer }, 201);
});
