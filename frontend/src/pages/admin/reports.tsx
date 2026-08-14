import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Reports.module.css';

export default function AdminReports() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeReport, setActiveReport] = useState<'daily' | 'monthly' | 'stock' | 'profit' | 'top'>('daily');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [limit, setLimit] = useState('10');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    // Set default date range to today
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    fetchReport();
  }, [user, activeReport, startDate, endDate, year, limit]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let res;
      switch (activeReport) {
        case 'daily':
          if (!startDate || !endDate) {
            toast.error('Please select start and end date');
            setLoading(false);
            return;
          }
          res = await api.get('/reports/daily-sales', {
            params: { start_date: startDate, end_date: endDate },
          });
          setReportData(res.data);
          break;
        case 'monthly':
          res = await api.get('/reports/monthly-sales', {
            params: { year: year },
          });
          setReportData(res.data);
          break;
        case 'stock':
          res = await api.get('/reports/stock-valuation');
          setReportData(res.data);
          break;
        case 'profit':
          if (!startDate || !endDate) {
            toast.error('Please select start and end date');
            setLoading(false);
            return;
          }
          res = await api.get('/reports/profit', {
            params: { start_date: startDate, end_date: endDate },
          });
          setReportData(res.data);
          break;
        case 'top':
          res = await api.get('/reports/top-products', {
            params: { start_date: startDate, end_date: endDate, limit: limit },
          });
          setReportData(res.data);
          break;
        default:
          setReportData(null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    fetchReport();
  };

  const renderDailyReport = () => {
    if (!reportData) return null;
    const { summary, sales_by_payment_method, product_breakdown, sales } = reportData;
    return (
      <>
        <div className={styles.summaryCards}>
          <div className={styles.summaryCard}>
            <h4>Total Sales</h4>
            <p>KES {summary.total_sales.toLocaleString()}</p>
          </div>
          <div className={styles.summaryCard}>
            <h4>Discounts</h4>
            <p>KES {summary.total_discount.toLocaleString()}</p>
          </div>
          <div className={styles.summaryCard}>
            <h4>Tax</h4>
            <p>KES {summary.total_tax.toLocaleString()}</p>
          </div>
          <div className={styles.summaryCard}>
            <h4>Transactions</h4>
            <p>{summary.total_transactions}</p>
          </div>
        </div>

        <h3 className="mt-6">Sales by Payment Method</h3>
        <table className="table">
          <thead>
            <tr><th>Method</th><th>Count</th><th>Total</th></tr>
          </thead>
          <tbody>
            {Object.entries(sales_by_payment_method).map(([method, data]: any) => (
              <tr key={method}>
                <td>{method}</td>
                <td>{data.count}</td>
                <td>KES {data.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt-6">Product Breakdown</h3>
        <table className="table">
          <thead>
            <tr><th>Product</th><th>Quantity Sold</th><th>Revenue</th></tr>
          </thead>
          <tbody>
            {Object.values(product_breakdown).map((p: any) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.quantity}</td>
                <td>KES {p.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt-6">Sales List</h3>
        <table className="table">
          <thead>
            <tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th></tr>
          </thead>
          <tbody>
            {sales.map((sale: any) => (
              <tr key={sale.id}>
                <td>{sale.invoice_no}</td>
                <td>{new Date(sale.sale_date).toLocaleString()}</td>
                <td>{sale.customer?.name || 'Walk-in'}</td>
                <td>KES {sale.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  };

  const renderMonthlyReport = () => {
    if (!reportData) return null;
    // Simple bar chart using CSS
    const maxTotal = Math.max(...reportData.map((m: any) => m.total), 1);
    return (
      <>
        <div className={styles.barChart}>
          {reportData.map((month: any) => (
            <div key={month.month} className={styles.barContainer}>
              <div className={styles.barLabel}>{getMonthName(month.month)}</div>
              <div className={styles.bar}>
                <div
                  className={styles.barFill}
                  style={{ height: `${(month.total / maxTotal) * 100}%` }}
                ></div>
              </div>
              <div className={styles.barValue}>KES {month.total.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <table className="table mt-6">
          <thead>
            <tr><th>Month</th><th>Total Sales</th><th>Transaction Count</th></tr>
          </thead>
          <tbody>
            {reportData.map((month: any) => (
              <tr key={month.month}>
                <td>{getMonthName(month.month)}</td>
                <td>KES {month.total.toLocaleString()}</td>
                <td>{month.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  };

  const renderStockValuation = () => {
    if (!reportData) return null;
    return (
      <>
        <div className={styles.summaryCards}>
          <div className={styles.summaryCard}>
            <h4>Total Cost Value</h4>
            <p>KES {reportData.total_cost_value.toLocaleString()}</p>
          </div>
          <div className={styles.summaryCard}>
            <h4>Total Selling Value</h4>
            <p>KES {reportData.total_selling_value.toLocaleString()}</p>
          </div>
        </div>
        <table className="table mt-6">
          <thead>
            <tr><th>Product</th><th>Total Quantity</th><th>Cost Value</th><th>Selling Value</th></tr>
          </thead>
          <tbody>
            {reportData.products.map((p: any) => (
              <tr key={p.product_id}>
                <td>{p.name}</td>
                <td>{p.total_quantity} {p.unit}</td>
                <td>KES {p.cost_value.toLocaleString()}</td>
                <td>KES {p.selling_value.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  };

  const renderProfitReport = () => {
    if (!reportData) return null;
    return (
      <>
        <div className={styles.summaryCards}>
          <div className={styles.summaryCard}>
            <h4>Revenue</h4>
            <p>KES {reportData.total_revenue.toLocaleString()}</p>
          </div>
          <div className={styles.summaryCard}>
            <h4>Cost</h4>
            <p>KES {reportData.total_cost.toLocaleString()}</p>
          </div>
          <div className={styles.summaryCard}>
            <h4>Gross Profit</h4>
            <p>KES {reportData.gross_profit.toLocaleString()}</p>
          </div>
          <div className={styles.summaryCard}>
            <h4>Gross Margin</h4>
            <p>{reportData.gross_margin.toFixed(2)}%</p>
          </div>
        </div>
        <table className="table mt-6">
          <thead>
            <tr><th>Product</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr>
          </thead>
          <tbody>
            {reportData.product_profit.map((p: any) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>KES {p.revenue.toLocaleString()}</td>
                <td>KES {p.cost.toLocaleString()}</td>
                <td>KES {p.profit.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  };

  const renderTopProducts = () => {
    if (!reportData) return null;
    return (
      <table className="table">
        <thead>
          <tr><th>Product</th><th>Total Quantity</th><th>Total Revenue</th></tr>
        </thead>
        <tbody>
          {reportData.map((p: any) => (
            <tr key={p.product_id}>
              <td>{p.name}</td>
              <td>{p.total_quantity}</td>
              <td>KES {p.total_revenue.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const getMonthName = (monthNum: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthNum - 1];
  };

  return (
    <Layout>
      <h1>Reports & Analytics</h1>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeReport === 'daily' ? styles.active : ''}`} onClick={() => setActiveReport('daily')}>Daily Sales</button>
        <button className={`${styles.tab} ${activeReport === 'monthly' ? styles.active : ''}`} onClick={() => setActiveReport('monthly')}>Monthly Sales</button>
        <button className={`${styles.tab} ${activeReport === 'stock' ? styles.active : ''}`} onClick={() => setActiveReport('stock')}>Stock Valuation</button>
        <button className={`${styles.tab} ${activeReport === 'profit' ? styles.active : ''}`} onClick={() => setActiveReport('profit')}>Profit</button>
        <button className={`${styles.tab} ${activeReport === 'top' ? styles.active : ''}`} onClick={() => setActiveReport('top')}>Top Products</button>
      </div>

      {/* Date range filters for daily, profit, top */}
      {(activeReport === 'daily' || activeReport === 'profit' || activeReport === 'top') && (
        <div className={styles.filters}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
          {activeReport === 'top' && (
            <select value={limit} onChange={(e) => setLimit(e.target.value)} className="input">
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
            </select>
          )}
          <button className="btn btn-outline" onClick={handleApplyFilters}>Apply</button>
        </div>
      )}

      {/* Year filter for monthly */}
      {activeReport === 'monthly' && (
        <div className={styles.filters}>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="input">
            {[2023, 2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="btn btn-outline" onClick={handleApplyFilters}>Apply</button>
        </div>
      )}

      {loading ? (
        <p>Loading report...</p>
      ) : (
        <div className="mt-4">
          {activeReport === 'daily' && renderDailyReport()}
          {activeReport === 'monthly' && renderMonthlyReport()}
          {activeReport === 'stock' && renderStockValuation()}
          {activeReport === 'profit' && renderProfitReport()}
          {activeReport === 'top' && renderTopProducts()}
        </div>
      )}
    </Layout>
  );
}
