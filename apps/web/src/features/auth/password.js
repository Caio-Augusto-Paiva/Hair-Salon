import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

const ARGON2_ALGORITHM = "argon2id";
const ENVELOPE_VERSION = "1";
const MEMORY_COST = 65_536;
const PASSES = 3;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const TAG_BYTES = 32;
const HASH_PATTERN = /^argon2id\$v=1\$m=65536,t=3,p=1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;

/** @param {string} password */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const tag = await deriveTag(password, salt);

  return `${ARGON2_ALGORITHM}$v=${ENVELOPE_VERSION}$m=${MEMORY_COST},t=${PASSES},p=${PARALLELISM}$${salt.toString("base64url")}$${tag.toString("base64url")}`;
}

/**
 * @param {string} password
 * @param {string} storedHash
 */
export async function verifyPassword(password, storedHash) {
  const parsedHash = parseStoredHash(storedHash);

  if (!parsedHash) {
    return false;
  }

  const derivedTag = await deriveTag(password, parsedHash.salt);
  return timingSafeEqual(derivedTag, parsedHash.tag);
}

/**
 * @param {string} password
 * @param {Buffer} salt
 */
function deriveTag(password, salt) {
  return new Promise((resolve, reject) => {
    argon2(
      ARGON2_ALGORITHM,
      {
        message: password,
        nonce: salt,
        memory: MEMORY_COST,
        passes: PASSES,
        parallelism: PARALLELISM,
        tagLength: TAG_BYTES,
      },
      (error, tag) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(tag);
      },
    );
  });
}

/** @param {string} storedHash */
function parseStoredHash(storedHash) {
  const match = HASH_PATTERN.exec(storedHash);

  if (!match) {
    return null;
  }

  const [, saltValue, tagValue] = match;
  const salt = Buffer.from(saltValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");

  if (salt.length !== SALT_BYTES || tag.length !== TAG_BYTES) {
    return null;
  }

  return { salt, tag };
}
