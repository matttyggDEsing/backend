-- ═══════════════════════════════════════════════════════════════
-- NexaPanel – Schema SQL completo
-- Compatible con MySQL 8.0+
-- ═══════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- ─── Usuarios ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(120) NOT NULL,
  `email`      VARCHAR(255) NOT NULL,
  `password`   VARCHAR(255) NOT NULL,
  `api_key`    VARCHAR(64)  NOT NULL,
  `role`       ENUM('user','admin') NOT NULL DEFAULT 'user',
  `status`     ENUM('active','suspended','banned') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email`   (`email`),
  UNIQUE KEY `uq_users_api_key` (`api_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Wallets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `wallets` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `balance`    DECIMAL(14,6) NOT NULL DEFAULT '0.000000',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallets_user` (`user_id`),
  CONSTRAINT `fk_wallets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Transacciones de Wallet ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `wallet_transactions` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       INT UNSIGNED NOT NULL,
  `type`          ENUM('credit','debit') NOT NULL,
  `amount`        DECIMAL(14,6) NOT NULL,
  `balance_after` DECIMAL(14,6) NOT NULL,
  `description`   VARCHAR(255) NOT NULL,
  `status`        ENUM('completed','pending','failed','refunded') NOT NULL DEFAULT 'completed',
  `reference_id`  INT UNSIGNED NULL COMMENT 'ID de orden o depósito relacionado',
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wt_user` (`user_id`),
  KEY `idx_wt_created` (`created_at`),
  CONSTRAINT `fk_wt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Solicitudes de Depósito ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `deposit_requests` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NOT NULL,
  `amount`       DECIMAL(14,2) NOT NULL,
  `method`       ENUM('crypto','paypal','stripe','manual') NOT NULL DEFAULT 'manual',
  `external_ref` VARCHAR(255) NULL COMMENT 'ID de transacción del procesador de pago',
  `status`       ENUM('pending','completed','rejected','expired') NOT NULL DEFAULT 'pending',
  `notes`        TEXT NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dr_user`   (`user_id`),
  KEY `idx_dr_status` (`status`),
  CONSTRAINT `fk_dr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Proveedores SMM ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `providers` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(120) NOT NULL,
  `api_url`     VARCHAR(255) NOT NULL,
  `api_key`     VARCHAR(255) NOT NULL,
  `status`      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `balance`     DECIMAL(14,6) NULL,
  `last_sync`   DATETIME NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Servicios ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `services` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider_service_id` VARCHAR(20) NOT NULL COMMENT 'ID del servicio en el proveedor',
  `name`                VARCHAR(255) NOT NULL,
  `category`            VARCHAR(120) NOT NULL,
  `type`                VARCHAR(80)  NOT NULL DEFAULT 'Default',
  `rate_usd`            DECIMAL(10,6) NOT NULL COMMENT 'Costo del proveedor por 1000 unidades',
  `rate_markup`         DECIMAL(10,6) NOT NULL COMMENT 'Precio de venta por 1000 unidades',
  `min_qty`             INT UNSIGNED NOT NULL DEFAULT 10,
  `max_qty`             INT UNSIGNED NOT NULL DEFAULT 1000000,
  `refill`              TINYINT(1) NOT NULL DEFAULT 0,
  `cancel_enabled`      TINYINT(1) NOT NULL DEFAULT 0,
  `description`         TEXT NULL,
  `active`              TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_services_provider_id` (`provider_service_id`),
  KEY `idx_services_category` (`category`),
  KEY `idx_services_active`   (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Órdenes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `orders` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`           INT UNSIGNED NOT NULL,
  `service_id`        INT UNSIGNED NOT NULL,
  `provider_order_id` VARCHAR(50) NULL COMMENT 'ID de orden en el proveedor',
  `link`              VARCHAR(512) NOT NULL,
  `quantity`          INT UNSIGNED NOT NULL,
  `charge`            DECIMAL(14,6) NOT NULL COMMENT 'Monto cobrado al usuario',
  `cost`              DECIMAL(14,6) NOT NULL COMMENT 'Costo real del proveedor',
  `start_count`       INT UNSIGNED NULL,
  `remains`           INT UNSIGNED NULL,
  `status`            ENUM('pending','in_progress','completed','partial','cancelled','failed') NOT NULL DEFAULT 'pending',
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_orders_user`   (`user_id`),
  KEY `idx_orders_status` (`status`),
  CONSTRAINT `fk_orders_user`    FOREIGN KEY (`user_id`)    REFERENCES `users`    (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_orders_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tickets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tickets` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `order_id`   INT UNSIGNED NULL COMMENT 'Orden relacionada, si aplica',
  `subject`    VARCHAR(255) NOT NULL,
  `status`     ENUM('open','answered','closed') NOT NULL DEFAULT 'open',
  `priority`   ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_user`   (`user_id`),
  KEY `idx_tickets_status` (`status`),
  CONSTRAINT `fk_tickets_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tickets_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Mensajes de Ticket ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ticket_messages` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id`  INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `message`    TEXT NOT NULL,
  `is_staff`   TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tm_ticket` (`ticket_id`),
  CONSTRAINT `fk_tm_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tm_user`   FOREIGN KEY (`user_id`)   REFERENCES `users`   (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
