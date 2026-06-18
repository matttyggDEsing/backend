-- ============================================================
-- NexaPanel — schema.sql
-- MySQL 8.x  |  Charset: utf8mb4  |  Collation: utf8mb4_unicode_ci
-- Ejecutar con: mysql -u root -p nexapanel_db < schema.sql
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;

-- ─────────────────────────────────────────────────────────────
-- TABLA: users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(100)     NOT NULL,
  `email`          VARCHAR(255)     NOT NULL,
  `password`       VARCHAR(255)     NOT NULL COMMENT 'bcrypt hash',
  `role`           ENUM('user','admin') NOT NULL DEFAULT 'user',
  `balance`        DECIMAL(12,4)    NOT NULL DEFAULT 0.0000,
  `api_key`        VARCHAR(64)      NOT NULL,
  `status`         ENUM('active','banned','pending') NOT NULL DEFAULT 'active',
  `email_verified` TINYINT(1)       NOT NULL DEFAULT 0,
  `total_spent`    DECIMAL(12,4)    NOT NULL DEFAULT 0.0000,
  `total_orders`   INT UNSIGNED     NOT NULL DEFAULT 0,
  `created_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP        NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email`   (`email`),
  UNIQUE KEY `uq_users_api_key` (`api_key`),
  KEY `idx_users_status` (`status`),
  KEY `idx_users_role`   (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: categories
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100) NOT NULL,
  `slug`        VARCHAR(100) NOT NULL,
  `emoji`       VARCHAR(10)  NULL,
  `description` TEXT         NULL,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order`  INT          NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_slug` (`slug`),
  KEY `idx_categories_active` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: providers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `providers` (
  `id`        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `name`      VARCHAR(100)  NOT NULL,
  `api_url`   VARCHAR(500)  NOT NULL,
  `api_key`   TEXT          NOT NULL COMMENT 'Encriptado en producción',
  `balance`   DECIMAL(12,4) NULL DEFAULT NULL COMMENT 'Sincronizado periódicamente',
  `status`    ENUM('active','inactive','error') NOT NULL DEFAULT 'active',
  `last_sync` TIMESTAMP     NULL DEFAULT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_providers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: services
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `services` (
  `id`                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `provider_id`         INT UNSIGNED    NOT NULL,
  `category_id`         INT UNSIGNED    NOT NULL,
  `provider_service_id` INT UNSIGNED    NOT NULL COMMENT 'ID del servicio en el proveedor',
  `name`                VARCHAR(500)    NOT NULL,
  `description`         TEXT            NULL,
  `rate`                DECIMAL(10,4)   NOT NULL COMMENT 'Precio por 1000 unidades en USD',
  `min_order`           INT UNSIGNED    NOT NULL DEFAULT 100,
  `max_order`           INT UNSIGNED    NOT NULL DEFAULT 1000000,
  `type`                VARCHAR(100)    NOT NULL DEFAULT 'Default',
  `refill`              TINYINT(1)      NOT NULL DEFAULT 0,
  `cancel`              TINYINT(1)      NOT NULL DEFAULT 0,
  `is_active`           TINYINT(1)      NOT NULL DEFAULT 1,
  `sort_order`          INT             NOT NULL DEFAULT 0,
  `created_at`          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_services_category` (`category_id`),
  KEY `idx_services_provider` (`provider_id`),
  KEY `idx_services_active`   (`is_active`, `sort_order`),
  CONSTRAINT `fk_services_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_services_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers`   (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: orders
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `orders` (
  `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `user_id`           INT UNSIGNED    NOT NULL,
  `service_id`        INT UNSIGNED    NOT NULL,
  `provider_id`       INT UNSIGNED    NOT NULL,
  `provider_order_id` VARCHAR(100)    NULL DEFAULT NULL COMMENT 'ID de la orden en el proveedor',
  `link`              VARCHAR(1000)   NOT NULL,
  `quantity`          INT UNSIGNED    NOT NULL,
  `start_count`       INT UNSIGNED    NULL DEFAULT NULL,
  `remains`           INT UNSIGNED    NULL DEFAULT NULL,
  `charge`            DECIMAL(12,4)   NOT NULL COMMENT 'Cobrado al usuario',
  `cost`              DECIMAL(12,4)   NOT NULL DEFAULT 0.0000 COMMENT 'Costo en el proveedor',
  `profit`            DECIMAL(12,4)   GENERATED ALWAYS AS (`charge` - `cost`) STORED,
  `status`            ENUM('pending','active','processing','completed','partial','cancelled','error')
                      NOT NULL DEFAULT 'pending',
  `notes`             TEXT            NULL,
  `created_at`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_orders_user`     (`user_id`),
  KEY `idx_orders_service`  (`service_id`),
  KEY `idx_orders_status`   (`status`),
  KEY `idx_orders_provider_order` (`provider_order_id`),
  CONSTRAINT `fk_orders_user`    FOREIGN KEY (`user_id`)    REFERENCES `users`    (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_orders_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_orders_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: transactions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `transactions` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `user_id`        INT UNSIGNED    NOT NULL,
  `order_id`       INT UNSIGNED    NULL DEFAULT NULL,
  `type`           ENUM('credit','debit') NOT NULL,
  `amount`         DECIMAL(12,4)   NOT NULL,
  `balance_before` DECIMAL(12,4)   NOT NULL,
  `balance_after`  DECIMAL(12,4)   NOT NULL,
  `description`    VARCHAR(500)    NOT NULL,
  `method`         VARCHAR(100)    NULL DEFAULT NULL COMMENT 'stripe, paypal, manual, etc.',
  `reference`      VARCHAR(255)    NULL DEFAULT NULL COMMENT 'ID externo de pago',
  `status`         ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'completed',
  `created_at`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tx_user`    (`user_id`),
  KEY `idx_tx_order`   (`order_id`),
  KEY `idx_tx_type`    (`type`),
  KEY `idx_tx_created` (`created_at`),
  CONSTRAINT `fk_tx_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`  (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_tx_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: tickets
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tickets` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `subject`    VARCHAR(500) NOT NULL,
  `status`     ENUM('open','pending','closed') NOT NULL DEFAULT 'open',
  `priority`   ENUM('low','medium','high')     NOT NULL DEFAULT 'medium',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_user`   (`user_id`),
  KEY `idx_tickets_status` (`status`),
  CONSTRAINT `fk_tickets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: ticket_messages
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ticket_messages` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id`  INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `from_admin` TINYINT(1)   NOT NULL DEFAULT 0,
  `message`    TEXT         NOT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tm_ticket` (`ticket_id`),
  CONSTRAINT `fk_tm_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tm_user`   FOREIGN KEY (`user_id`)   REFERENCES `users`   (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: api_logs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `api_logs` (
  `id`            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`       INT UNSIGNED     NOT NULL,
  `action`        VARCHAR(100)     NOT NULL,
  `request_data`  JSON             NULL,
  `response_data` JSON             NULL,
  `ip`            VARCHAR(45)      NULL,
  `status_code`   SMALLINT UNSIGNED NOT NULL DEFAULT 200,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_api_logs_user`    (`user_id`),
  KEY `idx_api_logs_created` (`created_at`),
  CONSTRAINT `fk_api_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: settings (key-value config del panel: mantenimiento,
-- métodos de pago, tasas de cambio, general)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `settings` (
  `key`        VARCHAR(100)   NOT NULL,
  `value`      LONGTEXT       NOT NULL,
  `created_at` TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP      NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `settings` (`key`, `value`) VALUES
  ('maintenance_mode',  '{"enabled":false,"message":""}'),
  ('payment_methods',   '{"crypto":{"enabled":false,"address":"","network":""},"paypal":{"enabled":false,"email":""},"stripe":{"enabled":false,"public_key":"","secret_key":""},"manual":{"enabled":true,"instructions":""}}'),
  ('exchange_rates',    '{"USD":1,"ARS":1000,"BRL":5,"EUR":0.92}'),
  ('general',           '{"site_name":"NexaPanel","site_url":"","support_email":"","currency":"USD","min_deposit":1,"max_deposit":10000}');

SET foreign_key_checks = 1;



