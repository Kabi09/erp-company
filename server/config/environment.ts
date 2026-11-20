import dotenv from 'dotenv';

dotenv.config();

export interface EnvironmentConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  allowDemoReset: boolean;
  isProd: boolean;
  isTest: boolean;
}

const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const jwtSecret = process.env.JWT_SECRET || (isProd ? '' : 'cryo-erp-2-local-dev-secret-key');

if (isProd && (!jwtSecret || jwtSecret === 'cryo-erp-2-local-dev-secret-key' || jwtSecret.length < 32)) {
  throw new Error(
    '[FATAL SECURITY ERROR] A strong, secure JWT_SECRET (minimum 32 characters) must be configured in production mode!',
  );
}

export const env: EnvironmentConfig = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cryo_erp',
  jwtSecret: jwtSecret || 'cryo-erp-2-local-dev-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || process.env.TOKEN_TTL || '1d',
  allowDemoReset: process.env.ALLOW_DEMO_RESET === 'true',
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
