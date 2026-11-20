import dotenv from 'dotenv';

dotenv.config();

export interface EnvironmentConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;
  allowDemoReset: boolean;
  requireReplicaSet: boolean;
  corsOrigin: string;
  isProd: boolean;
  isTest: boolean;
}

const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const jwtSecret = process.env.JWT_SECRET || (isProd ? '' : 'cryo-erp-2-local-dev-secret-key-at-least-32chars');
const jwtRefreshSecret =
  process.env.JWT_REFRESH_SECRET || (isProd ? '' : 'cryo-erp-2-refresh-dev-secret-key-at-least-32chars');

if (isProd) {
  if (!jwtSecret || jwtSecret === 'cryo-erp-2-local-dev-secret-key-at-least-32chars' || jwtSecret.length < 32) {
    throw new Error(
      '[FATAL SECURITY ERROR] A strong, secure JWT_SECRET (minimum 32 characters) must be configured in production mode!',
    );
  }
  if (
    !jwtRefreshSecret ||
    jwtRefreshSecret === 'cryo-erp-2-refresh-dev-secret-key-at-least-32chars' ||
    jwtRefreshSecret.length < 32
  ) {
    throw new Error(
      '[FATAL SECURITY ERROR] A strong, secure JWT_REFRESH_SECRET (minimum 32 characters) must be configured in production mode!',
    );
  }
}

export const env: EnvironmentConfig = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cryo_erp',
  jwtSecret: jwtSecret || 'cryo-erp-2-local-dev-secret-key-at-least-32chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshSecret: jwtRefreshSecret || 'cryo-erp-2-refresh-dev-secret-key-at-least-32chars',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  allowDemoReset: process.env.ALLOW_DEMO_RESET === 'true',
  requireReplicaSet: process.env.REQUIRE_REPLICA_SET === 'true' || isProd,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isProd,
  isTest,
};

export function maskMongoUri(uri: string): string {
  try {
    return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@.+)/i, '$1*****$2');
  } catch {
    return 'mongodb://[credentials-hidden]';
  }
}
