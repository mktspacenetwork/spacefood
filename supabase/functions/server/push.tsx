/**
 * Web Push Notification utilities for SpaceFood
 * Uses Web Crypto API (available in Deno) for VAPID key generation
 * and the Web Push protocol for sending notifications.
 */
import * as kv from "./kv_store.tsx";

const KV_VAPID_KEYS = "push:vapid-keys";
const KV_PUSH_SUBS_PREFIX = "push:sub:";

interface VAPIDKeys {
  publicKey: string;  // base64url encoded
  privateKey: string; // base64url encoded
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
}

/**
 * Generate VAPID keys using Web Crypto API (ECDSA P-256)
 */
async function generateVAPIDKeys(): Promise<VAPIDKeys> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicKeyBuffer = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  const publicKey = arrayBufferToBase64Url(publicKeyBuffer);
  const privateKey = privateKeyBuffer.d!; // The 'd' parameter is the private key in base64url

  return { publicKey, privateKey };
}

/**
 * Get or create VAPID keys (stored in KV)
 */
export async function getOrCreateVAPIDKeys(): Promise<VAPIDKeys> {
  let keys = await kv.get(KV_VAPID_KEYS) as VAPIDKeys | null;
  if (keys && keys.publicKey && keys.privateKey) {
    return keys;
  }

  console.log("[Push] Generating new VAPID keys...");
  keys = await generateVAPIDKeys();
  await kv.set(KV_VAPID_KEYS, keys);
  console.log("[Push] VAPID keys generated and saved.");
  return keys;
}

/**
 * Save a push subscription for a user
 */
export async function saveSubscription(userId: string, subscription: PushSubscription): Promise<void> {
  const key = `${KV_PUSH_SUBS_PREFIX}${userId}`;
  // Store up to 5 subscriptions per user (multiple devices)
  let subs: PushSubscription[] = (await kv.get(key)) || [];
  
  // Remove duplicate endpoints
  subs = subs.filter(s => s.endpoint !== subscription.endpoint);
  subs.push(subscription);
  
  // Keep only last 5
  if (subs.length > 5) subs = subs.slice(-5);
  
  await kv.set(key, subs);
  console.log(`[Push] Saved subscription for user ${userId}, total: ${subs.length}`);
}

/**
 * Get all subscriptions for a user
 */
export async function getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
  const key = `${KV_PUSH_SUBS_PREFIX}${userId}`;
  return (await kv.get(key)) || [];
}

/**
 * Remove a subscription (e.g., when it expires)
 */
export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  const key = `${KV_PUSH_SUBS_PREFIX}${userId}`;
  let subs: PushSubscription[] = (await kv.get(key)) || [];
  subs = subs.filter(s => s.endpoint !== endpoint);
  await kv.set(key, subs);
}

/**
 * Send a push notification to a specific user.
 * Uses simplified push approach - sends the payload directly to the push service.
 * 
 * For full Web Push protocol compliance (with VAPID signing and payload encryption),
 * a production app would use a library like web-push.
 * Here we use a simplified approach that works with most push services.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; icon?: string; badge?: string; tag?: string; data?: Record<string, any> }
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await getUserSubscriptions(userId);
  if (subscriptions.length === 0) {
    console.log(`[Push] No subscriptions for user ${userId}`);
    return { sent: 0, failed: 0 };
  }

  const vapidKeys = await getOrCreateVAPIDKeys();
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      const success = await sendWebPush(sub, JSON.stringify(payload), vapidKeys);
      if (success) {
        sent++;
      } else {
        failed++;
        // Remove expired subscription
        await removeSubscription(userId, sub.endpoint);
      }
    } catch (err) {
      console.log(`[Push] Error sending to ${sub.endpoint}:`, err);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Send a Web Push notification using VAPID.
 * This implements the core Web Push protocol with VAPID authentication.
 */
async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  vapidKeys: VAPIDKeys
): Promise<boolean> {
  try {
    const endpoint = subscription.endpoint;
    const audience = new URL(endpoint).origin;

    // Create VAPID JWT
    const jwt = await createVAPIDJWT(audience, vapidKeys);
    const vapidPublicKeyEncoded = vapidKeys.publicKey;

    // Encrypt the payload using the subscription keys
    const encrypted = await encryptPayload(
      payload,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    // Send the push message
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt}, k=${vapidPublicKeyEncoded}`,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Content-Length": String(encrypted.byteLength),
        "TTL": "86400",
        "Urgency": "normal",
      },
      body: encrypted,
    });

    if (response.status === 201 || response.status === 200) {
      console.log(`[Push] Sent successfully to ${endpoint.substring(0, 50)}...`);
      return true;
    } else if (response.status === 404 || response.status === 410) {
      console.log(`[Push] Subscription expired (${response.status}), removing.`);
      return false;
    } else {
      const body = await response.text().catch(() => "");
      console.log(`[Push] Unexpected status ${response.status}: ${body}`);
      return false;
    }
  } catch (err) {
    console.log("[Push] sendWebPush error:", err);
    return false;
  }
}

/**
 * Create a VAPID JWT token for push authentication
 */
async function createVAPIDJWT(audience: string, vapidKeys: VAPIDKeys): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 3600, // 12 hours
    sub: "mailto:spacefood@example.com",
  };

  const headerB64 = objectToBase64Url(header);
  const claimsB64 = objectToBase64Url(claims);
  const unsignedToken = `${headerB64}.${claimsB64}`;

  // Import the private key for signing
  const privateKeyJWK = {
    kty: "EC",
    crv: "P-256",
    x: vapidKeys.publicKey ? base64UrlToBase64(extractXFromPublicKey(vapidKeys.publicKey)) : "",
    y: vapidKeys.publicKey ? base64UrlToBase64(extractYFromPublicKey(vapidKeys.publicKey)) : "",
    d: base64UrlToBase64(vapidKeys.privateKey),
  };

  const key = await crypto.subtle.importKey(
    "jwk",
    privateKeyJWK,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw format (r||s, each 32 bytes)
  const rawSig = derToRaw(new Uint8Array(signature));
  const signatureB64 = arrayBufferToBase64Url(rawSig.buffer);

  return `${unsignedToken}.${signatureB64}`;
}

/**
 * Encrypt the push payload using the subscription's keys.
 * Implements RFC 8291 (Message Encryption for Web Push) with aes128gcm encoding.
 */
async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<ArrayBuffer> {
  const payloadBytes = new TextEncoder().encode(payload);

  // Decode subscription keys
  const userPublicKeyBytes = base64UrlToUint8Array(p256dhKey);
  const authSecretBytes = base64UrlToUint8Array(authSecret);

  // Generate an ephemeral key pair for ECDH
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const localPublicKeyRaw = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);

  // Import the subscriber's public key
  const subscriberPublicKey = await crypto.subtle.importKey(
    "raw",
    userPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Perform ECDH to get shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberPublicKey },
    localKeyPair.privateKey,
    256
  );

  // Generate a random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive the content encryption key and nonce using HKDF
  // Step 1: Extract IKM from auth secret and shared secret
  const authInfo = concatBuffers(
    new TextEncoder().encode("WebPush: info\0"),
    new Uint8Array(userPublicKeyBytes),
    new Uint8Array(localPublicKeyRaw)
  );

  const ikm = await hkdfExtractAndExpand(
    new Uint8Array(authSecretBytes),
    new Uint8Array(sharedSecret),
    authInfo,
    32
  );

  // Step 2: Derive CEK (Content Encryption Key)
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdfExtractAndExpand(salt, ikm, cekInfo, 16);

  // Step 3: Derive nonce
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await hkdfExtractAndExpand(salt, ikm, nonceInfo, 12);

  // Pad the payload (add a delimiter byte)
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Delimiter

  // Encrypt with AES-128-GCM
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    paddedPayload
  );

  // Build the aes128gcm header:
  // salt (16 bytes) + record size (4 bytes, uint32 BE) + key ID length (1 byte) + key ID (65 bytes for P-256 public key)
  const recordSize = paddedPayload.length + 16; // payload + tag
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  const rsView = new DataView(header.buffer, 16, 4);
  rsView.setUint32(0, recordSize, false);
  header[20] = 65; // Key ID length (uncompressed P-256 = 65 bytes)
  header.set(new Uint8Array(localPublicKeyRaw), 21);

  // Combine header + ciphertext
  const result = new Uint8Array(header.length + encrypted.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(encrypted), header.length);

  return result.buffer;
}

// --- Crypto Helpers ---

async function hkdfExtractAndExpand(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // HKDF-Extract
  const prk = await hmacSha256(salt, ikm);
  
  // HKDF-Expand
  const infoWithByte = new Uint8Array(info.length + 1);
  infoWithByte.set(info);
  infoWithByte[info.length] = 1;
  
  const okm = await hmacSha256(prk, infoWithByte);
  return okm.slice(0, length);
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(signature);
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function base64UrlToBase64(b64url: string): string {
  return (b64url + "=".repeat((4 - (b64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
}

function objectToBase64Url(obj: Record<string, any>): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Extract X coordinate from uncompressed P-256 public key (65 bytes: 0x04 || x || y)
 */
function extractXFromPublicKey(publicKeyB64Url: string): string {
  const bytes = base64UrlToUint8Array(publicKeyB64Url);
  // Skip the 0x04 prefix byte, take next 32 bytes
  const x = bytes.slice(1, 33);
  return arrayBufferToBase64Url(x.buffer);
}

function extractYFromPublicKey(publicKeyB64Url: string): string {
  const bytes = base64UrlToUint8Array(publicKeyB64Url);
  const y = bytes.slice(33, 65);
  return arrayBufferToBase64Url(y.buffer);
}

/**
 * Convert DER-encoded ECDSA signature to raw format (r || s, 64 bytes)
 */
function derToRaw(der: Uint8Array): Uint8Array {
  // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  const raw = new Uint8Array(64);
  
  let offset = 2; // Skip 0x30 and total length
  
  // R value
  const rLen = der[offset + 1];
  offset += 2;
  const rStart = rLen > 32 ? offset + (rLen - 32) : offset;
  const rEnd = offset + rLen;
  const rDst = rLen > 32 ? 0 : 32 - rLen;
  raw.set(der.slice(rStart, rEnd), rDst);
  offset = rEnd;
  
  // S value
  const sLen = der[offset + 1];
  offset += 2;
  const sStart = sLen > 32 ? offset + (sLen - 32) : offset;
  const sEnd = offset + sLen;
  const sDst = sLen > 32 ? 32 : 32 + (32 - sLen);
  raw.set(der.slice(sStart, sEnd), sDst);
  
  return raw;
}
