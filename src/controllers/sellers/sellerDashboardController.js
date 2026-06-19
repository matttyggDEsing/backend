'use strict';

const { pool } = require('../../config/db');
const { successResponse } = require('../../utils/response');

// ── Stats principales ──────────────────────────────────────────────────────
const getDashboard = async (req, res, next) => {
  try {
    const sellerId = req.user.id;

    // Ventas del día
    const [[today]] = await pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
       FROM seller_sales
       WHERE seller_id = ? AND DATE(created_at) = CURDATE()`,
      [sellerId]
    );

    // Ventas de la semana
    const [[week]] = await pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
       FROM seller_sales
       WHERE seller_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [sellerId]
    );

    // Clientes activos (con al menos 1 compra)
    const [[customers]] = await pool.query(
      `SELECT COUNT(*) AS total FROM seller_customers
       WHERE seller_id = ? AND total_orders > 0`,
      [sellerId]
    );

    // Total servicios vendidos (cantidad de ítems)
    const [[services]] = await pool.query(
      `SELECT COALESCE(SUM(ssi.quantity), 0) AS total_quantity
       FROM seller_sale_items ssi
       JOIN seller_sales ss ON ss.id = ssi.sale_id
       WHERE ss.seller_id = ?`,
      [sellerId]
    );

    // Gráfico de ventas últimos 30 días
    const [chart] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS sales, COALESCE(SUM(total), 0) AS revenue
       FROM seller_sales
       WHERE seller_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at) ORDER BY date ASC`,
      [sellerId]
    );

    // Rellenar días vacíos en el gráfico
    const chartFilled = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const found = chart.find(r => {
        const rd = r.date?.toISOString?.().slice(0, 10) ?? r.date;
        return rd === dateStr;
      });
      chartFilled.push({
        date:    dateStr,
        sales:   found ? Number(found.sales)   : 0,
        revenue: found ? Number(found.revenue) : 0,
      });
    }

    // Top 5 servicios vendidos por este vendedor
    const [topServices] = await pool.query(
      `SELECT s.name, SUM(ssi.quantity) AS total_qty, SUM(ssi.subtotal) AS total_revenue
       FROM seller_sale_items ssi
       JOIN seller_sales ss ON ss.id = ssi.sale_id
       JOIN services s ON s.id = ssi.service_id
       WHERE ss.seller_id = ?
       GROUP BY ssi.service_id, s.name
       ORDER BY total_qty DESC LIMIT 5`,
      [sellerId]
    );

    // Últimas 10 ventas
    const [recentSales] = await pool.query(
      `SELECT ss.id, ss.total, ss.status, ss.payment_method, ss.created_at,
              sc.first_name, sc.last_name
       FROM seller_sales ss
       JOIN seller_customers sc ON sc.id = ss.customer_id
       WHERE ss.seller_id = ?
       ORDER BY ss.created_at DESC LIMIT 10`,
      [sellerId]
    );

    // Ranking semanal (posición del vendedor entre todos los vendedores)
    const [rankingWeek] = await pool.query(
      `SELECT seller_id, COALESCE(SUM(total), 0) AS total_revenue,
              RANK() OVER (ORDER BY COALESCE(SUM(total), 0) DESC) AS rank_pos
       FROM seller_sales
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY seller_id`,
    );
    const rankingWeekMe = rankingWeek.find(r => r.seller_id === sellerId);

    // Ranking mensual
    const [rankingMonth] = await pool.query(
      `SELECT seller_id, COALESCE(SUM(total), 0) AS total_revenue,
              RANK() OVER (ORDER BY COALESCE(SUM(total), 0) DESC) AS rank_pos
       FROM seller_sales
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY seller_id`,
    );
    const rankingMonthMe = rankingMonth.find(r => r.seller_id === sellerId);

    return successResponse(res, {
      today:       { count: Number(today.count),     revenue: Number(today.revenue) },
      week:        { count: Number(week.count),      revenue: Number(week.revenue) },
      customers:   Number(customers.total),
      services_sold: Number(services.total_quantity),
      chart:       chartFilled,
      top_services: topServices,
      recent_sales: recentSales,
      ranking: {
        week:  rankingWeekMe  ? { position: Number(rankingWeekMe.rank_pos),  revenue: Number(rankingWeekMe.total_revenue),  total: rankingWeek.length }  : null,
        month: rankingMonthMe ? { position: Number(rankingMonthMe.rank_pos), revenue: Number(rankingMonthMe.total_revenue), total: rankingMonth.length } : null,
      },
    });
  } catch (err) { next(err); }
};

module.exports = { getDashboard };
