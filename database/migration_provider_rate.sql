-- ============================================================
-- MIGRATION: Agrega provider_rate a services
-- Ejecutar UNA SOLA VEZ en producción
-- ============================================================

-- Agrega columna para guardar el precio real del proveedor
ALTER TABLE services
  ADD COLUMN `provider_rate` DECIMAL(10,4) NOT NULL DEFAULT 0.0000
    COMMENT 'Precio real del proveedor por 1000 unidades (costo)'
  AFTER `rate`;

-- Inicializar provider_rate con el rate actual (hasta que se re-sincronice)
UPDATE services SET provider_rate = rate WHERE provider_rate = 0;



