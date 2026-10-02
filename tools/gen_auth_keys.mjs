// Prints JWT_PRIVATE_KEY and JWKS for Convex Auth as JSON (used by tools/setup_auth_env.sh).
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
const keys = await generateKeyPair('RS256', { extractable: true });
const priv = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ');
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }] });
process.stdout.write(JSON.stringify({ JWT_PRIVATE_KEY: priv, JWKS: jwks }));
