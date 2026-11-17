Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? 'null';
const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Server is not configured' }, 500);
  const caller = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await caller.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return json({ error: 'Invalid session' }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let input: { organization_id?: unknown; name?: unknown; email?: unknown; phone?: unknown; service_address?: unknown };
  try { input = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const organizationId = typeof input.organization_id === 'string' ? input.organization_id : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const serviceAddress = typeof input.service_address === 'string' ? input.service_address.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return json({ error: 'A valid organization_id is required' }, 400);
  if (name.length < 1 || name.length > 160) return json({ error: 'Name must be between 1 and 160 characters' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'A valid email is required' }, 400);
  if (phone.length > 40 || serviceAddress.length > 300) return json({ error: 'Phone or address is too long' }, 400);

  const { data: profile, error: profileError } = await admin.from('profiles').select('role')
    .eq('user_id', auth.user.id).maybeSingle();
  if (profileError) return json({ error: 'Unable to verify employee access' }, 500);
  if (profile?.role !== 'employee') return json({ error: 'Employee access required' }, 403);
  const { data: membership, error: membershipError } = await admin.from('organization_members')
    .select('role, active').eq('organization_id', organizationId).eq('user_id', auth.user.id).maybeSingle();
  if (membershipError) return json({ error: 'Unable to verify company access' }, 500);
  if (!membership?.active) return json({ error: 'Active company membership required' }, 403);

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { display_name: name } });
  if (inviteError || !invited.user) return json({ error: inviteError?.message ?? 'Invite failed' }, 400);
  const userId = invited.user.id;
  const { error: profileInsertError } = await admin.from('profiles').insert({ user_id: userId, role: 'customer', display_name: name });
  if (profileInsertError) {
    await admin.auth.admin.deleteUser(userId);
    return json({ error: 'Could not create customer profile' }, 500);
  }
  const { data: customer, error: customerError } = await admin.from('customers').insert({
    organization_id: organizationId, user_id: userId, name, email, phone, service_address: serviceAddress,
  }).select('id, organization_id, user_id, name, email, phone, service_address, created_at').single();
  if (customerError) {
    await admin.from('profiles').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId);
    return json({ error: 'Could not create customer record' }, 500);
  }
  return json({ customer }, 201);
});

