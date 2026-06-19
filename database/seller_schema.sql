-- ============================================================
-- NexaPanel — seller_schema.sql
-- Tablas para el Módulo Vendedor
-- Ejecutar con: node database/runSql.js database/seller_schema.sql
-- ============================================================

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ─────────────────────────────────────────────────────────────
-- Agregar rol 'seller' al ENUM de users
-- ─────────────────────────────────────────────────────────────
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('user','staff','admin','seller') NOT NULL DEFAULT 'user';

-- ─────────────────────────────────────────────────────────────
-- TABLA: seller_customers
-- Clientes propios de cada vendedor
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seller_customers` (
  `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `seller_id`    INT UNSIGNED    NOT NULL COMMENT 'FK al usuario con rol seller',
  `first_name`   VARCHAR(100)    NOT NULL,
  `last_name`    VARCHAR(100)    NOT NULL,
  `email`        VARCHAR(255)    NULL DEFAULT NULL,
  `whatsapp`     VARCHAR(50)     NULL DEFAULT NULL,
  `instagram`    VARCHAR(100)    NULL DEFAULT NULL,
  `facebook`     VARCHAR(100)    NULL DEFAULT NULL,
  `notes`        TEXT            NULL,
  `total_spent`  DECIMAL(12,4)   NOT NULL DEFAULT 0.0000,
  `total_orders` INT UNSIGNED    NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sc_seller`  (`seller_id`),
  KEY `idx_sc_email`   (`email`),
  CONSTRAINT `fk_sc_seller` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: seller_sales
-- Ventas creadas por el vendedor
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seller_sales` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `seller_id`      INT UNSIGNED    NOT NULL,
  `customer_id`    INT UNSIGNED    NOT NULL,
  `total`          DECIMAL(12,4)   NOT NULL DEFAULT 0.0000,
  `payment_method` ENUM('transferencia','mercadopago','crypto','efectivo','otro') NOT NULL DEFAULT 'efectivo',
  `voucher_path`   VARCHAR(500)    NULL DEFAULT NULL COMMENT 'Ruta del comprobante subido',
  `status`         ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  `notes`          TEXT            NULL,
  `created_at`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ss_seller`   (`seller_id`),
  KEY `idx_ss_customer` (`customer_id`),
  KEY `idx_ss_status`   (`status`),
  KEY `idx_ss_created`  (`created_at`),
  CONSTRAINT `fk_ss_seller`   FOREIGN KEY (`seller_id`)   REFERENCES `users`            (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ss_customer` FOREIGN KEY (`customer_id`) REFERENCES `seller_customers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: seller_sale_items
-- Ítems/servicios de cada venta
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seller_sale_items` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `sale_id`     INT UNSIGNED    NOT NULL,
  `service_id`  INT UNSIGNED    NOT NULL,
  `quantity`    INT UNSIGNED    NOT NULL DEFAULT 1,
  `unit_price`  DECIMAL(10,4)   NOT NULL,
  `subtotal`    DECIMAL(12,4)   NOT NULL,
  `link`        VARCHAR(1000)   NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ssi_sale`    (`sale_id`),
  KEY `idx_ssi_service` (`service_id`),
  CONSTRAINT `fk_ssi_sale`    FOREIGN KEY (`sale_id`)    REFERENCES `seller_sales`    (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssi_service` FOREIGN KEY (`service_id`) REFERENCES `services`        (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- TABLA: seller_receipts
-- Recibos generados para las ventas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `seller_receipts` (
  `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `receipt_number` VARCHAR(20)   NOT NULL UNIQUE COMMENT 'Número de recibo formateado, ej: REC-00042',
  `sale_id`       INT UNSIGNED    NOT NULL,
  `seller_id`     INT UNSIGNED    NOT NULL,
  `customer_id`   INT UNSIGNED    NOT NULL,
  `total`         DECIMAL(12,4)   NOT NULL,
  `payment_method` VARCHAR(100)   NOT NULL,
  `status`        ENUM('paid','pending','cancelled') NOT NULL DEFAULT 'paid',
  `notes`         TEXT            NULL,
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sr_sale`     (`sale_id`),
  KEY `idx_sr_seller`   (`seller_id`),
  KEY `idx_sr_customer` (`customer_id`),
  CONSTRAINT `fk_sr_sale`     FOREIGN KEY (`sale_id`)     REFERENCES `seller_sales`     (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sr_seller`   FOREIGN KEY (`seller_id`)   REFERENCES `users`            (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sr_customer` FOREIGN KEY (`customer_id`) REFERENCES `seller_customers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;
