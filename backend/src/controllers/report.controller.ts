import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// Daily sales report
export const dailySalesReport = async (req: Request, res: Response) => {
  const start_date = String(req.query.start_date || '');
  const end_date = String(req.query.end_date || '');
  if (!start_date || !end_date) throw new AppError('start_date and end_date are required', 400);

  const { data, error } = await supabase
    .from('sales')
    .select(`
      id, invoice_no, sale_date, subtotal, discount, tax, total, payment_method, payment_status, sale_status,
      customer:customers(id, name),
      user:users(id, full_name),
      sale_items(product_id, quantity, unit_price, discount, total, product:products(id, name))
    `)
    .gte('sale_date', start_date)
    .lte('sale_date', end_date)
    .order('sale_date', { ascending: false });

  if (error) throw new AppError('Failed to fetch sales', 500);

  const sales = (data || []) as any[];

  let totalSales = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let totalItems = 0;
  const salesByPaymentMethod: any = {};
  const productCounts: any = {};

  sales.forEach((sale: any) => {
    totalSales += Number(sale.total);
    totalDiscount += Number(sale.discount);
    totalTax += Number(sale.tax);
    totalItems += sale.sale_items ? sale.sale_items.length : 0;

    const pm = sale.payment_method || 'unknown';
    if (!salesByPaymentMethod[pm]) {
      salesByPaymentMethod[pm] = { count: 0, total: 0 };
    }
    salesByPaymentMethod[pm].count += 1;
    salesByPaymentMethod[pm].total += Number(sale.total);

    if (sale.sale_items) {
      sale.sale_items.forEach((item: any) => {
        const pid = item.product_id;
        const productObj = Array.isArray(item.product) ? item.product[0] : item.product;
        const productName = productObj?.name || 'Unknown';
        if (!productCounts[pid]) {
          productCounts[pid] = { name: productName, quantity: 0, revenue: 0 };
        }
        productCounts[pid].quantity += Number(item.quantity);
        productCounts[pid].revenue += Number(item.total);
      });
    }
  });

  res.json({
    summary: {
      total_sales: totalSales,
      total_discount: totalDiscount,
      total_tax: totalTax,
      total_transactions: sales.length,
      total_items: totalItems,
    },
    sales_by_payment_method: salesByPaymentMethod,
    product_breakdown: productCounts,
    sales,
  });
};

// Monthly sales summary (12 months of given year)
export const monthlySalesReport = async (req: Request, res: Response) => {
  const yearParam = req.query.year;
  const currentYear = yearParam ? parseInt(String(yearParam)) : new Date().getFullYear();
  if (isNaN(currentYear)) throw new AppError('Invalid year', 400);

  const startDate = `${currentYear}-01-01`;
  const endDate = `${currentYear}-12-31`;

  const { data, error } = await supabase
    .from('sales')
    .select('sale_date, total, payment_method')
    .gte('sale_date', startDate)
    .lte('sale_date', endDate);

  if (error) throw new AppError('Failed to fetch sales', 500);

  const sales = (data || []) as any[];

  const monthlyData: any = {};
  for (let i = 1; i <= 12; i++) {
    monthlyData[i] = { month: i, total: 0, count: 0 };
  }

  sales.forEach((sale: any) => {
    const month = new Date(sale.sale_date).getMonth() + 1;
    monthlyData[month].total += Number(sale.total);
    monthlyData[month].count += 1;
  });

  res.json(Object.values(monthlyData));
};

// Stock valuation report
export const stockValuationReport = async (req: Request, res: Response) => {
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id, name, sku, unit, cost_price, selling_price,
      stock_batches(id, batch_number, expiry_date, quantity_remaining, cost_price)
    `);

  if (error) throw new AppError('Failed to fetch stock', 500);

  const productList = (products || []) as any[];

  let totalCostValue = 0;
  let totalSellingValue = 0;
  const productValuation = productList.map((product: any) => {
    let totalQty = 0;
    let costValue = 0;
    (product.stock_batches || []).forEach((batch: any) => {
      const qty = Number(batch.quantity_remaining);
      totalQty += qty;
      costValue += qty * Number(batch.cost_price || product.cost_price);
    });
    totalCostValue += costValue;
    totalSellingValue += totalQty * Number(product.selling_price);
    return {
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      total_quantity: totalQty,
      cost_value: costValue,
      selling_value: totalQty * Number(product.selling_price),
    };
  });

  res.json({
    total_cost_value: totalCostValue,
    total_selling_value: totalSellingValue,
    products: productValuation,
  });
};

// Profit report (approximate, based on cost vs selling)
export const profitReport = async (req: Request, res: Response) => {
  const start_date = String(req.query.start_date || '');
  const end_date = String(req.query.end_date || '');
  if (!start_date || !end_date) throw new AppError('start_date and end_date are required', 400);

  const { data: saleItems, error } = await supabase
    .from('sale_items')
    .select(`
      id, sale_id, product_id, quantity, unit_price, discount, total,
      product:products(id, name, cost_price, selling_price),
      sale:sales(id, sale_date)
    `)
    .gte('sale.sale_date', start_date)
    .lte('sale.sale_date', end_date);

  if (error) throw new AppError('Failed to fetch sales items', 500);

  const items = (saleItems || []) as any[];

  let totalRevenue = 0;
  let totalCost = 0;
  const productProfit: any = {};

  items.forEach((item: any) => {
    const revenue = Number(item.total);
    const productObj = Array.isArray(item.product) ? item.product[0] : item.product;
    const productCost = Number(productObj?.cost_price || 0);
    const cost = Number(item.quantity) * productCost;
    totalRevenue += revenue;
    totalCost += cost;

    const pid = item.product_id;
    if (!productProfit[pid]) {
      productProfit[pid] = {
        name: productObj?.name || 'Unknown',
        revenue: 0,
        cost: 0,
        profit: 0,
      };
    }
    productProfit[pid].revenue += revenue;
    productProfit[pid].cost += cost;
    productProfit[pid].profit = productProfit[pid].revenue - productProfit[pid].cost;
  });

  res.json({
    total_revenue: totalRevenue,
    total_cost: totalCost,
    gross_profit: totalRevenue - totalCost,
    gross_margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
    product_profit: Object.values(productProfit),
  });
};

// Top selling products
export const topSellingProducts = async (req: Request, res: Response) => {
  const limitParam = req.query.limit;
  const limitNum = limitParam ? parseInt(String(limitParam)) : 10;
  if (isNaN(limitNum) || limitNum <= 0) throw new AppError('Invalid limit', 400);

  const start_date = String(req.query.start_date || '1900-01-01');
  const end_date = String(req.query.end_date || '2100-01-01');

  const { data, error } = await supabase
    .from('sale_items')
    .select(`
      product_id,
      product:products(id, name, unit),
      quantity,
      total
    `)
    .gte('sale.sale_date', start_date)
    .lte('sale.sale_date', end_date)
    .order('total', { ascending: false })
    .limit(limitNum);

  if (error) throw new AppError('Failed to fetch top products', 500);

  const items = (data || []) as any[];

  const aggregated: any = {};
  items.forEach((item: any) => {
    const pid = item.product_id;
    const productObj = Array.isArray(item.product) ? item.product[0] : item.product;
    if (!aggregated[pid]) {
      aggregated[pid] = {
        product_id: pid,
        name: productObj?.name || 'Unknown',
        unit: productObj?.unit || '',
        total_quantity: 0,
        total_revenue: 0,
      };
    }
    aggregated[pid].total_quantity += Number(item.quantity);
    aggregated[pid].total_revenue += Number(item.total);
  });

  res.json(Object.values(aggregated));
};
