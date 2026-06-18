-- ============================================================
-- NexaPanel — add_settings_table.sql
-- Crea la tabla `settings` para persistir configuración del panel
-- Ejecutar: node database/runSql.js database/add_settings_table.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS `settings` (
  `key`        VARCHAR(100)   NOT NULL,
  `value`      LONGTEXT       NOT NULL,
  `created_at` TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP      NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valores iniciales
INSERT IGNORE INTO `settings` (`key`, `value`) VALUES
  ('maintenance_mode',  '{"enabled":false,"message":""}'),
  ('payment_methods',   '{"crypto":{"enabled":false,"address":"","network":""},"paypal":{"enabled":false,"email":""},"stripe":{"enabled":false,"public_key":"","secret_key":""},"manual":{"enabled":true,"instructions":""}}'),
  ('exchange_rates',    '{"USD":1,"ARS":1000,"BRL":5,"EUR":0.92}'),
  ('general',           '{"site_name":"NexaPanel","site_url":"","support_email":"","currency":"USD","min_deposit":1,"max_deposit":10000}');



