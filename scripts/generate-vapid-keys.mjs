// Prints a fresh VAPID key pair for Web Push. Put both values in the server env
// (Vercel → Settings → Environment Variables) as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString("base64url")}`);
