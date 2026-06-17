// src/controllers/authController.js — REEMPLAZO COMPLETO
// FIX: agrega updateProfile y updatePassword

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { generateApiKey } = require('../utils/crypto');
const { sendWelcome } = require('../services/mailer');
const { successResponse, errorResponse } = require('../utils/response');
const env = require('../config/env');

const signToken = (id, role) =>
  jwt.sign({ id, role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existing = await userModel.findByEmail(email);
    if (existing) return errorResponse(res, 'El email ya está registrado', 409);

    const hashedPassword = await bcrypt.hash(password, 12);
    const apiKey = generateApiKey();

    const userId = await userModel.create({ name, email, password: hashedPassword, apiKey });
    const user = await userModel.findById(userId);

    setImmediate(() => sendWelcome({ ...user, api_key: apiKey }));

    const token = signToken(userId, 'user');

    return successResponse(
      res,
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          balance: user.balance,
          api_key: apiKey,
        },
      },
      'Registro exitoso',
      201,
    );
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await userModel.findByEmail(email);
    if (!user) return errorResponse(res, 'Credenciales inválidas', 401);

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return errorResponse(res, 'Credenciales inválidas', 401);

    if (user.status === 'banned') {
      return errorResponse(res, 'Cuenta suspendida. Contacta soporte.', 403);
    }

    const token = signToken(user.id, user.role);
    const fullUser = await userModel.findById(user.id);

    return successResponse(res, {
      token,
      user: {
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        role: fullUser.role,
        balance: fullUser.balance,
        api_key: fullUser.api_key,
      },
    });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) return errorResponse(res, 'Usuario no encontrado', 404);
    return successResponse(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance,
      api_key: user.api_key,
      total_orders: user.total_orders,
      total_spent: user.total_spent,
      created_at: user.created_at,
    });
  } catch (err) {
    next(err);
  }
};

// ─── FIX: updateProfile ───────────────────────────────────────
/**
 * PATCH /api/auth/profile
 * Actualiza nombre y email del usuario autenticado.
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const userId = req.user.id;

    // Si cambió el email, verificar que no esté tomado por otro usuario
    if (email !== req.user.email) {
      const existing = await userModel.findByEmail(email);
      if (existing && existing.id !== userId) {
        return errorResponse(res, 'Ese email ya está en uso por otra cuenta', 409);
      }
    }

    await userModel.update(userId, { name, email });

    const updatedUser = await userModel.findById(userId);
    return successResponse(res, {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      balance: updatedUser.balance,
      api_key: updatedUser.api_key,
      total_orders: updatedUser.total_orders,
      total_spent: updatedUser.total_spent,
    }, 'Perfil actualizado correctamente');
  } catch (err) {
    next(err);
  }
};

// ─── FIX: updatePassword ──────────────────────────────────────
/**
 * PATCH /api/auth/password
 * Actualiza la contraseña verificando la contraseña actual.
 */
const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Necesitamos la contraseña hasheada → usar findByEmail con id
    const { pool } = require('../config/db');
    const [[userRow]] = await pool.query(
      'SELECT password FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!userRow) return errorResponse(res, 'Usuario no encontrado', 404);

    const passwordMatch = await bcrypt.compare(currentPassword, userRow.password);
    if (!passwordMatch) {
      return errorResponse(res, 'La contraseña actual es incorrecta', 401);
    }

    const hashedNew = await bcrypt.hash(newPassword, 12);
    await userModel.update(userId, { password: hashedNew });

    return successResponse(res, null, 'Contraseña actualizada correctamente');
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, me, updateProfile, updatePassword };
