import dotenv from 'dotenv';

dotenv.config();

export interface EnvironmentConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  jwtSecret: string;
  tokenTtl: string;
  isProd: boolean;
}

const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
const isProd = nodeEnv === 'production';

let jwtSecret = process.env.JWT_SECRET || 'cryo-erp-2-local-dev-secret-key';
if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'cryo-erp-2-local-dev-secret-key')) {
  console.warn(
    '[SECURITY WARNING] JWT_SECRET is unset or using default development secret in production mode! Set a strong random JWT_SECRET in production.',
  );
}

export const env: EnvironmentConfig = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  jwtSecret,
  tokenTtl: process.env.TOKEN_TTL || '24h',
  isProd,
};
