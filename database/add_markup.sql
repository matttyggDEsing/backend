-- ============================================================
-- NexaPanel — add_markup.sql
-- Agrega soporte para markup de precios por categoría y global
-- Ejecutar: node database/runSql.js database/add_markup.sql
-- ============================================================

-- cost_rate = precio real del proveedor (se guarda al sincronizar)
ALTER TABLE `services`
  ADD COLUMN IF NOT EXISTS `cost_rate` DECIMAL(10,4) NOT NULL DEFAULT 0.0000
  COMMENT 'Precio real del proveedor por 1000 unidades'
  AFTER `rate`;

-- Copiar rate actual a cost_rate para servicios existentes
UPDATE `services` SET `cost_rate` = `rate` WHERE `cost_rate` = 0;

-- Tabla de configuración de markup por categoría
CREATE TABLE IF NOT EXISTS `markup_config` (
  `id`          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `category_id` INT UNSIGNED   NULL DEFAULT NULL COMMENT 'NULL = markup global',
  `markup_pct`  DECIMAL(8,2)   NOT NULL DEFAULT 200.00 COMMENT 'Porcentaje sobre cost_rate (200 = precio x3)',
  `min_margin`  DECIMAL(10,4)  NOT NULL DEFAULT 0.0100 COMMENT 'Margen mínimo absoluto en USD/1000',
  `created_at`  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP      NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_markup_category` (`category_id`),
  CONSTRAINT `fk_markup_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Markup global por defecto: +200% (precio = cost * 3)
INSERT IGNORE INTO `markup_config` (`category_id`, `markup_pct`) VALUES (NULL, 200.00);



