-- ============================================================
-- NexaPanel — schema.sql  (VERSIÓN CORREGIDA)
-- MySQL 8.x  |  Charset: utf8mb4  |  Collation: utf8mb4_unicode_ci
-- CAMBIOS vs versión anterior:
--   • users.role: agregado 'staff'
--   • tickets: agregado order_id, 'urgent' en priority ENUM
--   • ticket_messages: from_admin → is_staff  (fix crítico)
--   • NUEVO: tablas wallets, wallet_transactions, deposit_requests
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
  `role`           ENUM('user','staff','admin') NOT NULL DEFAULT 'user',
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
-- TABLA: wallets   ← NUEVA (requerida por walletModel.js)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `wallets` (
  `id`         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED  NOT NULL,
  `balance`    DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  `created_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallets_user` (`user_id`),
  CONSTRAINT `fk_wallets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: wallet_transactions   ← NUEVA
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `wallet_transactions` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`       INT UNSIGNED  NOT NULL,
  `type`          ENUM('credit','debit') NOT NULL,
  `amount`        DECIMAL(14,6) NOT NULL,
  `balance_after` DECIMAL(14,6) NOT NULL,
  `description`   VARCHAR(500)  NOT NULL,
  `status`        ENUM('completed','pending','failed','refunded') NOT NULL DEFAULT 'completed',
  `reference_id`  INT UNSIGNED  NULL COMMENT 'ID de orden o depósito relacionado',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wt_user`    (`user_id`),
  KEY `idx_wt_created` (`created_at`),
  CONSTRAINT `fk_wt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: deposit_requests   ← NUEVA
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `deposit_requests` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED  NOT NULL,
  `amount`       DECIMAL(14,2) NOT NULL,
  `method`       ENUM('crypto','paypal','stripe','manual') NOT NULL DEFAULT 'manual',
  `external_ref` VARCHAR(255)  NULL COMMENT 'ID de transacción del procesador de pago',
  `status`       ENUM('pending','completed','rejected','expired') NOT NULL DEFAULT 'pending',
  `notes`        TEXT          NULL,
  `created_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dr_user`   (`user_id`),
  KEY `idx_dr_status` (`status`),
  CONSTRAINT `fk_dr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: tickets
-- FIX: agregado order_id, 'urgent' en priority ENUM
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tickets` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `order_id`   INT UNSIGNED NULL DEFAULT NULL COMMENT 'Orden relacionada, si aplica',
  `subject`    VARCHAR(500) NOT NULL,
  `status`     ENUM('open','pending','closed') NOT NULL DEFAULT 'open',
  `priority`   ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_user`   (`user_id`),
  KEY `idx_tickets_status` (`status`),
  CONSTRAINT `fk_tickets_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tickets_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: ticket_messages
-- FIX CRÍTICO: from_admin → is_staff  (ticketModel.js usa is_staff)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ticket_messages` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id`  INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `is_staff`   TINYINT(1)   NOT NULL DEFAULT 0,
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

SET foreign_key_checks = 1;



