import mongoose from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null; indexes?: Promise<unknown> };

const globalForMongoose = globalThis as unknown as { mongooseCache?: Cache };
const cache: Cache = globalForMongoose.mongooseCache ?? { conn: null, promise: null };
globalForMongoose.mongooseCache = cache;

export async function connectDB() {
  if (cache.conn) return cache.conn;
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
  // Make sure unique indexes (e.g. product barcode) exist before the first write on a fresh database.
  cache.indexes ??= Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await cache.indexes;
  return cache.conn;
}
