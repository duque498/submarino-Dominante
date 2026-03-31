const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const VAPID_PUBLIC_KEY = "BNxR5zHhzJdpN8MN4Qr9QyRNp4Dvt-tDb8bJR8jGcBMFrb8WKtSN9ibxEKKWt7dcbJg2LvHKuwFT2mNmbPg8qNw";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- Web Push crypto utilities (RFC 8291 / RFC 8188) ---

function base64UrlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  const binary = atob(b + pad);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    result.set(b, offset);
    offset += b.length;
  }
  return result;
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const infoStr = `Content-Encoding: ${type}\0`;
  const info = encoder.encode(infoStr);
  const clientLen = new Uint8Array(2);
  clientLen[0] = 0;
  clientLen[1] = clientPublicKey.length;
  const serverLen = new Uint8Array(2);
  serverLen[0] = 0;
  serverLen[1] = serverPublicKey.length;
  return concatBuffers(
    encoder.encode("WebPush: info\0"),
    clientPublicKey,
    serverPublicKey
  );
}

async function hkdfSha256(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", keyMaterial, salt.length ? salt : new Uint8Array(32)));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = concatBuffers(info, new Uint8Array([1]));
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  return okm.slice(0, length);
}

async function createJWT(endpoint: string): Promise<string> {
  const origin = new URL(endpoint).origin;
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        aud: origin,
        exp: now + 12 * 3600,
        sub: "mailto:radar@alpha.app",
      })
    )
  );
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);

  // Import VAPID private key
  const rawKey = base64UrlDecode(VAPID_PRIVATE_KEY);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: base64UrlEncode(rawKey),
    x: base64UrlEncode(base64UrlDecode(VAPID_PUBLIC_KEY).slice(1, 33)),
    y: base64UrlEncode(base64UrlDecode(VAPID_PUBLIC_KEY).slice(33, 65)),
  };

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signingInput));

  return `${header}.${payload}.${base64UrlEncode(sig)}`;
}

async function encryptPayload(
  p256dhKey: string,
  authSecret: string,
  payload: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const clientPublicKey = base64UrlDecode(p256dhKey);
  const clientAuth = base64UrlDecode(authSecret);
  const plaintext = new TextEncoder().encode(payload);

  // Generate server ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeyPair.publicKey));

  // Import client public key
  const clientKey = await crypto.subtle.importKey("raw", clientPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);

  // Derive shared secret
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeyPair.privateKey, 256));

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF to derive PRK (from auth secret + shared secret)
  const encoder = new TextEncoder();
  const authInfo = encoder.encode("Content-Encoding: auth\0");
  const prk = await hkdfSha256(clientAuth, sharedSecret, authInfo, 32);

  // Derive content encryption key
  const cekInfo = concatBuffers(
    encoder.encode("Content-Encoding: aes128gcm\0"),
    new Uint8Array([0]),
    new Uint8Array([(clientPublicKey.length >> 8) & 0xff, clientPublicKey.length & 0xff]),
    clientPublicKey,
    new Uint8Array([(serverPublicKeyRaw.length >> 8) & 0xff, serverPublicKeyRaw.length & 0xff]),
    serverPublicKeyRaw
  );
  const contentKey = await hkdfSha256(salt, prk, cekInfo, 16);

  // Derive nonce
  const nonceInfo = concatBuffers(
    encoder.encode("Content-Encoding: nonce\0"),
    new Uint8Array([0]),
    new Uint8Array([(clientPublicKey.length >> 8) & 0xff, clientPublicKey.length & 0xff]),
    clientPublicKey,
    new Uint8Array([(serverPublicKeyRaw.length >> 8) & 0xff, serverPublicKeyRaw.length & 0xff]),
    serverPublicKeyRaw
  );
  const nonce = await hkdfSha256(salt, prk, nonceInfo, 12);

  // Encrypt with AES-GCM
  const aesKey = await crypto.subtle.importKey("raw", contentKey, { name: "AES-GCM" }, false, ["encrypt"]);
  // Add padding (2 bytes for padding length + delimiter)
  const paddedPlaintext = concatBuffers(plaintext, new Uint8Array([2]));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, paddedPlaintext));

  // Build aes128gcm content coding header
  const recordSize = new Uint8Array(4);
  const rs = encrypted.length + 86; // header size
  recordSize[0] = (rs >> 24) & 0xff;
  recordSize[1] = (rs >> 16) & 0xff;
  recordSize[2] = (rs >> 8) & 0xff;
  recordSize[3] = rs & 0xff;

  const header = concatBuffers(
    salt,
    recordSize,
    new Uint8Array([serverPublicKeyRaw.length]),
    serverPublicKeyRaw
  );

  return {
    ciphertext: concatBuffers(header, encrypted),
    salt,
    serverPublicKey: serverPublicKeyRaw,
  };
}

async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payloadStr: string) {
  const { ciphertext } = await encryptPayload(subscription.p256dh, subscription.auth, payloadStr);
  const jwt = await createJWT(subscription.endpoint);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    },
    body: ciphertext,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Push failed (${response.status}): ${text}`);
  }

  return response;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, tag, data, requireInteraction } = await req.json();

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (error) throw error;
    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body, tag, data, requireInteraction: requireInteraction ?? true });

    let sent = 0;
    const errors: string[] = [];

    for (const sub of subs) {
      try {
        await sendWebPush(sub, payload);
        sent++;
      } catch (e) {
        errors.push(e.message);
        // If endpoint is gone (410), delete subscription
        if (e.message.includes("410")) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", user_id);
        }
      }
    }

    return new Response(JSON.stringify({ sent, total: subs.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
