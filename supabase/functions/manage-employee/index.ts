Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'null',
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
  let input: { action?: unknown; organization_id?: unknown; name?: unknown; email?: unknown; user_id?: unknown };
  try { input = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const action = input.action;
  const organizationId = typeof input.organization_id === 'string' ? input.organization_id : '';
  if (!['invite', 'deactivate', 'list'].includes(String(action))) return json({ error: 'Unsupported action' }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return json({ error: 'A valid organization_id is required' }, 400);

  const { data: permission, error: permissionError } = await admin.from('organization_members')
    .select('role, active').eq('organization_id', organizationId).eq('user_id', auth.user.id).maybeSingle();
  if (permissionError) return json({ error: 'Unable to verify company access' }, 500);
  if (!permission?.active || !['owner', 'admin'].includes(permission.role)) {
    return json({ error: 'Company owner or admin access required' }, 403);
  }

  if (action === 'list') {
    const { data, error } = await admin.from('organization_members')
      .select('user_id, role, active, created_at, profiles(display_name)')
      .eq('organization_id', organizationId).order('created_at');
    if (error) return json({ error: 'Could not load company team' }, 500);
    return json({ employees: data });
  }

  if (action === 'invite') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (name.length < 1 || name.length > 120) return json({ error: 'Name must be between 1 and 120 characters' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'A valid email is required' }, 400);
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { display_name: name } });
    if (inviteError || !invited.user) return json({ error: inviteError?.message ?? 'Invite failed' }, 400);
    const userId = invited.user.id;
    const { error: profileError } = await admin.from('profiles').insert({ user_id: userId, role: 'employee', display_name: name });
    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return json({ error: 'Could not create employee profile' }, 500);
    }
    const { error: memberError } = await admin.from('organization_members').insert({
      organization_id: organizationId, user_id: userId, role: 'employee',
    });
    if (memberError) {
      await admin.from('profiles').delete().eq('user_id', userId);
      await admin.auth.admin.deleteUser(userId);
      return json({ error: 'Could not add employee to this company' }, 500);
    }
    return json({ employee: { user_id: userId, email, display_name: name, role: 'employee', active: true } }, 201);
  }

  const userId = typeof input.user_id === 'string' ? input.user_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: 'A valid employee user_id is required' }, 400);
  if (userId === auth.user.id) return json({ error: 'You cannot deactivate your own account here' }, 400);
  const { data: target, error: targetError } = await admin.from('organization_members')
    .select('role, active').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle();
  if (targetError) return json({ error: 'Unable to load employee account' }, 500);
  if (!target) return json({ error: 'Employee is not in this company' }, 404);
  if (target.role !== 'employee') return json({ error: 'Only employee memberships can be deactivated here' }, 400);
  const { error: updateError } = await admin.from('organization_members')
    .update({ active: false }).eq('organization_id', organizationId).eq('user_id', userId);
  if (updateError) return json({ error: 'Could not deactivate employee access' }, 500);
  return json({ success: true });
});

