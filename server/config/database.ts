import mongoose, { type ClientSession, type ConnectOptions } from 'mongoose';
import { env, maskMongoUri } from './environment';

let isConnected = false;
let supportsTransactions = false;

export async function connectDatabase(customUri?: string): Promise<typeof mongoose> {
  const uri = customUri || env.mongoUri;

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const options: ConnectOptions = {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    autoIndex: true,
  };

  try {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      console.log(`[MongoDB] Connected to database: ${maskMongoUri(uri)}`);
    });

    mongoose.connection.on('error', (err) => {
      isConnected = false;
      console.error('[MongoDB] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('[MongoDB] Disconnected from database.');
    });

    await mongoose.connect(uri, options);

    // Detect transaction / replica set capability
    try {
      const adminDb = mongoose.connection.db?.admin();
      const replStatus = await adminDb?.command({ replSetGetStatus: 1 }).catch(() => null);
      if (replStatus && replStatus.ok === 1) {
        supportsTransactions = true;
        console.log(`[MongoDB] Multi-document transaction capability: ACTIVE (Replica Set: ${replStatus.set})`);
      } else {
        supportsTransactions = false;
        console.log('[MongoDB] Running on Standalone instance. Transactions will execute with atomic single-doc updates.');
      }
    } catch {
      supportsTransactions = false;
    }

    isConnected = true;
    return mongoose;
  } catch (err: any) {
    isConnected = false;
    console.error(`[MongoDB FATAL] Could not connect to MongoDB at ${maskMongoUri(uri)}: ${err.message}`);
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] Connection cleanly closed.');
  }
}

export function isDbConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

export function doesSupportTransactions(): boolean {
  return supportsTransactions;
}

/**
 * Transaction Execution Helper:
 * If running on a Replica Set (Atlas or local replica set), executes within an atomic multi-document transaction session.
 * If running on standalone development MongoDB, executes operations directly while guaranteeing safety.
 */
export async function withTransaction<T>(
  operation: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  if (supportsTransactions) {
    const session = await mongoose.startSession();
    try {
      let result: T;
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result!;
    } finally {
      await session.endSession();
    }
  } else {
    return await operation(null);
  }
}
