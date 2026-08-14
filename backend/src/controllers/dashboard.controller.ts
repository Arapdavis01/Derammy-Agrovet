import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// Admin Dashboard
export const getAdminDashboard = async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayISO = today.toISOString();
  const tomorrowISO = tomorrow.toISOString();

  // Run all queries in parallel
  const [
    stockBatchesResult,
    todaySalesResult,
    totalSalesResult,
    creditOutstandingResult,
    returnsTodayResult,
    purchasesCountResult,
    productsCountResult,
    lowStockResult,
    expiringSoonResult,
    cashierPerformanceResult,
    creditCustomersResult,
    topProductsTodayResult,
  ] = await Promise.all([
    // Stock batches with cost price for stock value calculation
    supabase
      .from('stock_batches')
      .select('quantity_remaining, cost_price, product:products(cost_price)')
      .gt('quantity_remaining', 0),
    // Today's sales
    supabase
      .from('sales')
      .select('total, sale_date')
      .gte('sale_date', todayISO)
      .lt('sale_date', tomorrowISO),
    // Total sales (all time)
    supabase
      .from('sales')
      .select('total'),
    // Credit outstanding
    supabase
      .from('customers')
      .select('credit_balance')
      .gt('credit_balance', 0),
    // Returns today
    supabase
      .from('returns')
      .select('id')
      .gte('return_date', todayISO)
      .lt('return_date', tomorrowISO),
    // Purchases count (all)
    supabase
      .from('purchases')
      .select('id', { count: 'exact', head: true }),
    // Products count
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true }),
    // Low stock: fetch products with reorder level
    supabase
      .from('products')
      .select('id, name, reorder_level'),
    // Expiring soon (30 days)
    supabase
      .from('stock_batches')
      .select('id, product_id, expiry_date, quantity_remaining')
      .gt('quantity_remaining', 0)
      .lte('expiry_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    // Cashier performance: group sales by user
    supabase
      .from('sales')
      .select('user_id, total, sale_date, user:users(id, full_name)'),
    // Credit customers with debt
    supabase
      .from('customers')
      .select('id, name, credit_balance, credit_limit')
      .gt('credit_balance', 0)
      .order('credit_balance', { ascending: false }),
    // Top products today
    supabase
      .from('sale_items')
      .select(`
        product_id, quantity, total,
        product:products(id, name, unit),
        sale:sales(id, sale_date)
      `)
      .gte('sale.sale_date', todayISO)
      .lt('sale.sale_date', tomorrowISO),
  ]);

  // Compute stock value from stock_batches
  const stockValue = (stockBatchesResult.data || []).reduce((sum, batch) => {
    const qty = Number(batch.quantity_remaining);
    const cost = Number(batch.cost_price ?? (Array.isArray(batch.product) ? batch.product[0]?.cost_price : batch.product?.cost_price) ?? 0);
    return sum + qty * cost;
  }, 0);

  const todaySalesData = todaySalesResult.data || [];
  const todaySalesTotal = todaySalesData.reduce((sum, s) => sum + Number(s.total), 0);
  const todaySalesCount = todaySalesData.length;

  const totalSalesData = totalSalesResult.data || [];
  const totalSales = totalSalesData.reduce((sum, s) => sum + Number(s.total), 0);

  const creditOutstanding = creditOutstandingResult.data?.reduce((sum, c) => sum + Number(c.credit_balance), 0) || 0;
  const creditCustomersCount = creditOutstandingResult.data?.length || 0;

  const returnsTodayCount = returnsTodayResult.data?.length || 0;

  const purchasesCount = purchasesCountResult.count || 0;
  const productsCount = productsCountResult.count || 0;

  // Low stock computation: products where total stock < reorder_level
  const productsList = lowStockResult.data || [];
  const stockQuantities = await Promise.all(productsList.map(async (p) => {
    const { data } = await supabase
      .from('stock_batches')
      .select('quantity_remaining')
      .eq('product_id', p.id);
    const totalQty = data?.reduce((sum, b) => sum + Number(b.quantity_remaining), 0) || 0;
    return { ...p, total_qty: totalQty };
  }));
  const lowStockItems = stockQuantities.filter((p) => p.total_qty < Number(p.reorder_level));
  const lowStockCount = lowStockItems.length;

  const expiringSoonCount = expiringSoonResult.data?.length || 0;

  // Cashier performance: aggregate today and total per user
  const cashierMap = new Map();
  for (const sale of (cashierPerformanceResult.data || [])) {
    const userId = sale.user_id;
    if (!cashierMap.has(userId)) {
      // Handle if user relation is an array (should not be, but safe)
      const userObj = Array.isArray(sale.user) ? sale.user[0] : sale.user;
      cashierMap.set(userId, {
        user_id: userId,
        full_name: userObj?.full_name || 'Unknown',
        today_sales: 0,
        today_count: 0,
        total_sales: 0,
        total_count: 0,
      });
    }
    const entry = cashierMap.get(userId);
    entry.total_sales += Number(sale.total);
    entry.total_count += 1;
    const saleDate = new Date(sale.sale_date);
    if (saleDate >= today && saleDate < tomorrow) {
      entry.today_sales += Number(sale.total);
      entry.today_count += 1;
    }
  }
  const cashierPerformance = Array.from(cashierMap.values());

  const creditCustomers = creditCustomersResult.data || [];

  // Top products today
  const productMap = new Map();
  for (const item of (topProductsTodayResult.data || [])) {
    const pid = item.product_id;
    if (!productMap.has(pid)) {
      const productObj = Array.isArray(item.product) ? item.product[0] : item.product;
      productMap.set(pid, { product_id: pid, name: productObj?.name || 'Unknown', quantity: 0, revenue: 0 });
    }
    const entry = productMap.get(pid);
    entry.quantity += Number(item.quantity);
    entry.revenue += Number(item.total);
  }
  const topProductsToday = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  res.json({
    stock_value: stockValue,
    today_sales: todaySalesTotal,
    today_sales_count: todaySalesCount,
    total_sales: totalSales,
    credit_outstanding: creditOutstanding,
    credit_customers_count: creditCustomersCount,
    returns_today: returnsTodayCount,
    purchases_count: purchasesCount,
    products_count: productsCount,
    low_stock_count: lowStockCount,
    expiring_soon_count: expiringSoonCount,
    cashier_performance: cashierPerformance,
    credit_customers: creditCustomers,
    top_products_today: topProductsToday,
  });
};

// Cashier Dashboard (personal)
export const getCashierDashboard = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayISO = today.toISOString();
  const tomorrowISO = tomorrow.toISOString();

  const [
    myTodaySalesResult,
    myTotalSalesResult,
    availableProductsResult,
    outstandingDebtResult,
    creditCustomersResult,
  ] = await Promise.all([
    supabase
      .from('sales')
      .select('total')
      .eq('user_id', userId)
      .gte('sale_date', todayISO)
      .lt('sale_date', tomorrowISO),
    supabase
      .from('sales')
      .select('total')
      .eq('user_id', userId),
    supabase
      .from('stock_batches')
      .select('quantity_remaining, product_id'),
    supabase
      .from('customers')
      .select('credit_balance')
      .gt('credit_balance', 0),
    supabase
      .from('customers')
      .select('id, name, credit_balance')
      .gt('credit_balance', 0)
      .order('credit_balance', { ascending: false }),
  ]);

  const myTodaySales = myTodaySalesResult.data?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
  const myTodayCount = myTodaySalesResult.data?.length || 0;
  const myTotalSales = myTotalSalesResult.data?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
  const myTotalCount = myTotalSalesResult.data?.length || 0;

  // Available products: count distinct products and total units
  const productSet = new Set();
  let totalUnits = 0;
  for (const batch of availableProductsResult.data || []) {
    productSet.add(batch.product_id);
    totalUnits += Number(batch.quantity_remaining);
  }
  const availableProductsCount = productSet.size;

  const outstandingDebt = outstandingDebtResult.data?.reduce((sum, c) => sum + Number(c.credit_balance), 0) || 0;
  const outstandingCustomersCount = outstandingDebtResult.data?.length || 0;

  res.json({
    my_today_sales: myTodaySales,
    my_today_count: myTodayCount,
    my_total_sales: myTotalSales,
    my_total_count: myTotalCount,
    available_products: availableProductsCount,
    total_units: totalUnits,
    outstanding_debt: outstandingDebt,
    outstanding_customers_count: outstandingCustomersCount,
    credit_customers: creditCustomersResult.data || [],
  });
};
