const winston = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level.toUpperCase()}] ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5_242_880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 10_485_760, // 10MB
      maxFiles: 10,
    }),
  ],
});

module.exports = logger;






