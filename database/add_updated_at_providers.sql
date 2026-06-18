-- Migration: agregar columna updated_at a providers
-- Ejecutar una sola vez en la base de datos

ALTER TABLE `providers`
  ADD COLUMN `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
  AFTER `created_at`;

-- Inicializar con el valor de created_at para los registros existentes
UPDATE `providers` SET `updated_at` = `created_at`;
