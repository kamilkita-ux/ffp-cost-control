// Haszowanie haseł — scrypt z wbudowanego modułu Node "crypto" (żadna
// nowa zależność, nic do kompilowania na Railway). Format zapisanego hasha:
// "scrypt:<sól hex>:<hash hex>" — sól jest inna dla każdego hasła, więc
// dwie osoby z tym samym hasłem będą miały różne zapisy w bazie.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  try {
    const derived = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer;
    const expected = Buffer.from(hashHex, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// Losowe hasło "startowe" do nowo tworzonego konta — Kamil przekazuje je
// osobie, a ta może je potem zmienić (patrz /api/auth/change-password).
// 12 znaków, alfabet bez znaków łatwych do pomylenia (0/O, 1/l/I).
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function generateTempPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  return out;
}
