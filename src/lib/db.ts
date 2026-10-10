import mongoose from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null; indexed?: Set<string> };

const globalForMongoose = globalThis as unknown as { mongooseCache?: Cache };
const cache: Cache = globalForMongoose.mongooseCache ?? { conn: null, promise: null };
globalForMongoose.mongooseCache = cache;

export async function connectDB() {
  if (!cache.conn) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.");
    if (!cache.promise) {
      cache.promise = mongoose.connect(uri, { bufferCommands: false });
    }
    try {
      cache.conn = await cache.promise;
    } catch (err) {
      cache.promise = null;
      throw err;
    }
  }
  await ensureIndexes();
  return cache.conn;
}

/**
 * Make sure unique indexes (e.g. product barcode, one open day per branch) exist before the first
 * write on a fresh database. Each page loads its own models, so this checks every model that has
 * been loaded since the last call, not only the ones the first request happened to use.
 */
async function ensureIndexes() {
  const indexed = (cache.indexed ??= new Set());
  const pending = Object.values(mongoose.models).filter((m) => !indexed.has(m.modelName));
  if (!pending.length) return;
  await Promise.all(
    pending.map(async (m) => {
      try {
        await m.init();
      } catch (err) {
        // e.g. old duplicate data blocks a unique index: keep the shop running and say why.
        console.error(`Could not build the indexes for ${m.modelName}:`, err);
      }
      indexed.add(m.modelName);
    }),
  );
}
