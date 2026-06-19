const cron = require('node-cron');
const orderModel = require('../models/orderModel');
const providerModel = require('../models/providerModel');
const { pool } = require('../config/db');
const smm = require('./smmProvider');
const logger = require('../utils/logger');

const BATCH_SIZE = 100;

const STATUS_MAP = {
  Pending:    'pending',
  Processing: 'processing',
  Active:     'active',
  'In progress': 'active',
  Completed:  'completed',
  Partial:    'partial',
  Canceled:   'cancelled',
  Cancelled:  'cancelled',
};

const processOrders = async () => {
  try {
    const orders = await orderModel.getPendingOrders();
    if (!orders.length) return;

    logger.info(`[OrderProcessor] Procesando ${orders.length} órdenes...`);

    // Agrupar por proveedor
    const byProvider = {};
    for (const order of orders) {
      if (!byProvider[order.provider_id]) byProvider[order.provider_id] = [];
      byProvider[order.provider_id].push(order);
    }

    for (const [providerId, providerOrders] of Object.entries(byProvider)) {
      // FIX: antes se consultaba el estado contra el proveedor global de .env
      // sin importar a qué proveedor pertenecía cada grupo de órdenes. Ahora
      // se buscan las credenciales reales del proveedor antes de consultar.
      const provider = await providerModel.findById(providerId);
      if (!provider) {
        logger.error(`[OrderProcessor] Proveedor #${providerId} no encontrado, se omiten ${providerOrders.length} órdenes`);
        continue;
      }

      // Procesar en lotes de BATCH_SIZE
      for (let i = 0; i < providerOrders.length; i += BATCH_SIZE) {
        const batch = providerOrders.slice(i, i + BATCH_SIZE);
        const ids = batch.map((o) => o.provider_order_id).filter(Boolean);

        if (!ids.length) continue;

        try {
          const statusData = await smm.getMultipleStatus(ids, provider.api_url, provider.api_key);

          for (const order of batch) {
            const info = statusData[order.provider_order_id];
            if (!info) continue;

            const newStatus = STATUS_MAP[info.status] || order.status;
            const startCount = parseInt(info.start_count) || 0;
            const remains = parseInt(info.remains) || 0;

            await orderModel.updateStatus(order.id, newStatus, {
              startCount,
              remains,
              profit: newStatus === 'completed' ? (order.charge - order.cost) : undefined,
            });

            if (newStatus === 'completed') {
              await pool.query(
                `UPDATE users SET total_orders = total_orders + 1,
                                  total_spent = total_spent + ?
                 WHERE id = ?`,
                [order.charge, order.user_id],
              );
            }
          }
        } catch (err) {
          logger.error(`[OrderProcessor] Error en lote: ${err.message}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[OrderProcessor] Error general: ${err.message}`);
  }
};

const start = () => {
  // Correr cada 60 segundos
  cron.schedule('*/1 * * * *', processOrders);
  logger.info('[OrderProcessor] Polling iniciado (cada 60s)');
};

module.exports = { start, processOrders };






