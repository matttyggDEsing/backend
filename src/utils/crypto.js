const crypto = require('crypto');

/**
 * Genera una API key aleatoria y segura de 64 caracteres hex.
 */
const generateApiKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Genera un token de verificación de 32 bytes.
 */
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = { generateApiKey, generateToken };






