// src/routes/auth.js — REEMPLAZO COMPLETO
// FIX: agrega PATCH /auth/profile y PATCH /auth/password

const router = require('express').Router();
const Joi = require('joi');
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const { login, register } = require('../middleware/rateLimiter');

const registerSchema = Joi.object({
  name:     Joi.string().min(2).max(100).required(),
  email:    Joi.string().email().required(),
  password: Joi.string().min(8).max(100).required(),
});

const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
});

// ─── FIX: schemas para actualizar perfil y contraseña ─────────
const updateProfileSchema = Joi.object({
  name:  Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
});

const updatePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword:     Joi.string().min(8).max(100).required(),
});

router.post('/register', register, validate(registerSchema), authController.register);
router.post('/login',    login,    validate(loginSchema),    authController.login);
router.get('/me',        auth,                               authController.me);

// ─── FIX: nuevas rutas de perfil ─────────────────────────────
router.patch('/profile',  auth, validate(updateProfileSchema),  authController.updateProfile);
router.patch('/password', auth, validate(updatePasswordSchema), authController.updatePassword);

module.exports = router;
