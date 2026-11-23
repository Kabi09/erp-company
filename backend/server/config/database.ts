import mongoose, { type ClientSession, type ConnectOptions } from 'mongoose';
import { env, maskMongoUri } from './environment';

let isConnected = false;
let supportsTransactions = false;

export async function connectDatabase(customUri?: string): Promise<typeof mongoose> {
  const uri = customUri || env.mongoUri;

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const isServerless = Boolean(process.env.VERCEL);
  const options: ConnectOptions = {
    maxPoolSize: isServerless ? 10 : 50,
    minPoolSize: isServerless ? 1 : 5,
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

    // Detect transaction / replica set capability (use `hello: 1` as fallback for Atlas M0 shared clusters)
    try {
      const adminDb = mongoose.connection.db?.admin();
      const replStatus = await adminDb?.command({ replSetGetStatus: 1 }).catch(() => null);
      if (replStatus && replStatus.ok === 1) {
        supportsTransactions = true;
        console.log(`[MongoDB] Multi-document transaction capability: ACTIVE (Replica Set: ${replStatus.set})`);
      } else {
        const hello = await adminDb?.command({ hello: 1 }).catch(() => null);
        if (hello && (hello.setName || uri.startsWith('mongodb+srv://'))) {
          supportsTransactions = true;
          console.log(
            `[MongoDB] Multi-document transaction capability: ACTIVE (Cluster: ${hello.setName || 'Atlas SRV'})`,
          );
        } else {
          supportsTransactions = false;
          console.log(
            '[MongoDB] Running on Standalone instance. Transactions will execute with atomic single-doc updates unless replica set is strictly required.',
          );
        }
      }
    } catch {
      supportsTransactions = uri.startsWith('mongodb+srv://');
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
    supportsTransactions = false;
    console.log('[MongoDB] Connection cleanly closed.');
  }
}

export function isDbConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

export function doesSupportTransactions(): boolean {
  return supportsTransactions;
}

export function isReplicaSetActive(): boolean {
  return supportsTransactions;
}

/**
 * Transaction Execution Helper:
 * If running on a Replica Set (Atlas or local replica set), executes within an atomic multi-document transaction session.
 * If running on standalone development MongoDB and transactions are required (env.requireReplicaSet is true or options.requireReplicaSet is true),
 * throws an explicit configuration error rather than silently failing to provide multi-doc ACID guarantees.
 * Otherwise in development mode, executes operations directly with atomic single-document operations.
 */
export async function withTransaction<T>(
  operation: (session: ClientSession | null) => Promise<T>,
  options?: { requireReplicaSet?: boolean },
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
    if (env.requireReplicaSet || options?.requireReplicaSet) {
      throw new Error(
        'TRANSACTION_TOPOLOGY_REQUIRED: MongoDB replica set (local rs0 or MongoDB Atlas) is required for critical multi-document transactional operations. Standalone MongoDB cannot guarantee ACID rollback across multiple collections.',
      );
    }
    return await operation(null);
  }
}
