/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": "application/json", ...headers },
  });
}

function bytesToB64Url(bytes: Uint8Array) {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64UrlToBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(secret: string, salt: string) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function decryptJson(secret: string, salt: string, blob: string) {
  if (!blob?.startsWith('v1.')) throw new Error('Invalid credentials');
  const [_v, ivB64, ctB64] = blob.split('.');
  const iv = b64UrlToBytes(ivB64);
  const ct = b64UrlToBytes(ctB64);
  const key = await deriveAesKey(secret, salt);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
  const txt = new TextDecoder().decode(plain);
  return JSON.parse(txt);
}

async function encryptJson(secret: string, salt: string, payload: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret, salt);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return `v1.${bytesToB64Url(iv)}.${bytesToB64Url(ciphertext)}`;
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";

async function refreshIfNeeded(connectionId: string, credsBlob: string) {
  const stateSecret = Deno.env.get('MS_STATE_SECRET') || '';
  const tokenSecret = Deno.env.get('MS_TOKEN_SECRET') || stateSecret;
  const creds = await decryptJson(tokenSecret, connectionId, credsBlob) as any;

  const now = Math.floor(Date.now() / 1000);
  if (creds?.access_token && creds?.expires_at && creds.expires_at > now + 30) {
    return { creds, updatedBlob: null as string | null };
  }

  const clientId = Deno.env.get('MS_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET') || '';
  if (!clientId || !clientSecret) throw new Error('Missing MS_CLIENT_ID/MS_CLIENT_SECRET');
  if (!creds?.refresh_token) throw new Error('Missing refresh token (reconnect Microsoft 365)');

  const redirectUri = `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/microsoft-oauth`;
  const tokenRes = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { ...SECURITY_HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
      redirect_uri: redirectUri,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(tokenJson?.error_description || tokenJson?.error || 'Refresh failed');

  const next = {
    ...creds,
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token || creds.refresh_token,
    expires_at: now + Number(tokenJson.expires_in || 3600) - 60,
    scope: tokenJson.scope,
    token_type: tokenJson.token_type,
  };
  const updatedBlob = await encryptJson(tokenSecret, connectionId, next);
  return { creds: next, updatedBlob };
}

async function graphGet(accessToken: string, path: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { ...SECURITY_HEADERS, authorization: `Bearer ${accessToken }` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || 'Graph API error');
  return json;
}

type GraphDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  folder?: unknown;
  file?: { mimeType?: string };
};

function normalizeItems(items: GraphDriveItem[]) {
  return (items || []).map((it) => ({
    id: it.id,
    name: it.name,
    kind: it.folder ? 'folder' : 'file',
    web_url: it.webUrl || null,
    mime_type: it.file?.mimeType || null,
  }));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json();
    const action = body?.action as string;
    const companyId = body?.company_id as string;
    const connectionId = body?.connection_id as string;
    if (!companyId || !connectionId) return json({ error: 'Missing company_id/connection_id' }, 400);

    const supabase = getSupabaseAdmin();
    const { data: conn, error: cErr } = await supabase
      .from('integration_connections')
      .select('id, company_id, credentials_encrypted')
      .eq('id', connectionId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conn) return json({ error: 'Connection not found' }, 404);
    if (!conn.credentials_encrypted) return json({ error: 'Microsoft 365 not connected yet' }, 400);

    const { creds, updatedBlob } = await refreshIfNeeded(connectionId, conn.credentials_encrypted);
    if (updatedBlob) {
      await supabase.from('integration_connections').update({ credentials_encrypted: updatedBlob }).eq('id', connectionId);
    }

    if (action === 'list_drives') {
      // Combine the default drive + any other drives visible to the user
      const defaultDrive = await graphGet(creds.access_token, '/me/drive');
      const drivesRes = await graphGet(creds.access_token, '/me/drives');
      const seen = new Set<string>();
      const drives: { id: string; name: string }[] = [];

      if (defaultDrive?.id) {
        seen.add(defaultDrive.id);
        drives.push({ id: defaultDrive.id, name: defaultDrive?.name || 'My OneDrive' });
      }
      for (const d of (drivesRes?.value || []) as any[]) {
        if (!d?.id || seen.has(d.id)) continue;
        seen.add(d.id);
        drives.push({ id: d.id, name: d.name || 'Drive' });
      }
      return json({ drives });
    }

    if (action === 'list_folders') {
      const driveId = body?.drive_id as string;
      const parentId = (body?.parent_id as string) || 'root';
      if (!driveId) return json({ error: 'Missing drive_id' }, 400);

      const path = parentId === 'root'
        ? `/drives/${encodeURIComponent(driveId)}/root/children?$select=id,name,folder,webUrl`
        : `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder,webUrl`;

      const res = await graphGet(creds.access_token, path);
      const folders = ((res?.value || []) as any[])
        .filter((it) => !!it.folder)
        .map((it) => ({ id: it.id, name: it.name, web_url: it.webUrl || null }));
      return json({ folders });
    }

    if (action === 'list_items') {
      const driveId = body?.drive_id as string;
      const parentId = (body?.parent_id as string) || 'root';
      const limit = Number(body?.limit || 50);
      if (!driveId) return json({ error: 'Missing drive_id' }, 400);

      // Includes both folders + files (for a picker). webUrl gives a user-friendly deep link.
      const path = parentId === 'root'
        ? `/drives/${encodeURIComponent(driveId)}/root/children?$top=${encodeURIComponent(String(limit))}&$select=id,name,folder,file,webUrl`
        : `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children?$top=${encodeURIComponent(String(limit))}&$select=id,name,folder,file,webUrl`;

      const res = await graphGet(creds.access_token, path);
      const items = normalizeItems((res?.value || []) as GraphDriveItem[]);
      return json({ items });
    }

    if (action === 'get_item') {
      const driveId = body?.drive_id as string;
      const itemId = body?.item_id as string;
      if (!driveId || !itemId) return json({ error: 'Missing drive_id/item_id' }, 400);
      const it = await graphGet(
        creds.access_token,
        `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,folder,file,webUrl`,
      );
      return json({ item: normalizeItems([it as GraphDriveItem])[0] });
    }

    return json({ error: 'Unsupported action' }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message || 'Request failed' }, 400);
  }
});
