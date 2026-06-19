-- ============================================================
-- NexaPanel — seed.sql
-- Datos iniciales para desarrollo y producción
-- ⚠️ CAMBIAR LA CONTRASEÑA DEL ADMIN ANTES DE PRODUCCIÓN
-- ============================================================

SET NAMES utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- Categorías de redes sociales
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO `categories` (`name`, `slug`, `emoji`, `description`, `is_active`, `sort_order`) VALUES
  ('Instagram', 'instagram', '📸', 'Servicios para Instagram: seguidores, likes, vistas y más', 1, 1),
  ('TikTok',    'tiktok',    '🎵', 'Servicios para TikTok: seguidores, vistas, likes y más',   1, 2),
  ('YouTube',   'youtube',   '▶️', 'Servicios para YouTube: vistas, suscriptores, likes',       1, 3),
  ('Facebook',  'facebook',  '👥', 'Servicios para Facebook: likes, seguidores, páginas',       1, 4),
  ('Telegram',  'telegram',  '✈️', 'Servicios para Telegram: miembros, vistas, reacciones',     1, 5),
  ('Twitter',   'twitter',   '𝕏',  'Servicios para Twitter/X: seguidores, likes, retweets',    1, 6),
  ('Spotify',   'spotify',   '🎧', 'Servicios para Spotify: reproducciones, oyentes, seguidores', 1, 7);

-- ─────────────────────────────────────────────────────────────
-- Usuario administrador por defecto
-- Contraseña: Admin123!  (hash bcrypt de 12 rondas)
-- ⚠️ CAMBIAR INMEDIATAMENTE EN PRODUCCIÓN
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO `users`
  (`name`, `email`, `password`, `role`, `balance`, `api_key`, `status`, `email_verified`)
VALUES (
  'Admin',
  'admin@nexapanel.io',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBaQ.K4tq3o2Ge',
  'admin',
  0.0000,
  LOWER(CONCAT(
    SUBSTR(MD5(RAND()), 1, 8),
    SUBSTR(MD5(RAND()), 1, 8),
    SUBSTR(MD5(RAND()), 1, 8),
    SUBSTR(MD5(RAND()), 1, 8)
  )),
  'active',
  1
);






