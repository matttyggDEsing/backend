const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 5) {
      logger.warn('[Redis] No se pudo conectar. Cache desactivado.');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect', () => logger.info('[Redis] Conexión establecida'));
redis.on('error', (err) => logger.warn('[Redis] Error:', err.message));

const testConnection = async () => {
  try {
    await redis.connect();
    await redis.ping();
    logger.info('[Redis] Ping OK');
  } catch (err) {
    logger.warn('[Redis] Redis no disponible — cache desactivado:', err.message);
  }
};

module.exports = { redis, testConnection };






