import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

interface Sale {
  id: string;
  invoice_no: string;
  sale_date: string;
  total: number;
  subtotal: number;
  tax: number;
  discount: number;
  amount_paid: number;
  change_due: number;
  payment_method: string;
  payment_status: string;
  sale_status: string;
  customer_name?: string;
  customer: { id: string; name: string; phone?: string } | null;
  user: { id: string; full_name: string } | null;
  cashier?: { id: string; full_name: string } | null;
  sale_items?: { 
    id: string; 
    quantity: number; 
    unit_price: number;
    total: number;
    product: { name: string; unit: string; sku?: string } 
  }[];
}

interface SaleDetail extends Sale {
  sale_items: {
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
    total: number;
    product: { id: string; name: string; unit: string; sku?: string };
  }[];
  payments: any[];
}

interface DashboardStats {
  total_sales: number;
  today_sales: number;
  today_sales_count: number;
  total_transactions: number;
  cashier_performance?: any[];
}

export default function AdminSales() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [voiding, setVoiding] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'analytics'>('history');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  
  const [filters, setFilters] = useState({
    search: '',
    start_date: '',
    end_date: '',
    payment_method: '',
    payment_status: '',
    sale_status: '',
  });

  const initialLoadDone = useRef(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/dashboard/admin');
      setDashboard(res.data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  }, []);

  const fetchSales = useCallback(async (pageNum: number, isRefresh = false) => {
    if (!isRefresh) {
      setLoading(true);
    }
    
    try {
      const today = new Date().toISOString().split('T')[0];
      let startDate = today;
      
      if (dateRange === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
      } else if (dateRange === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().split('T')[0];
      } else if (dateRange === 'all') {
        startDate = '';
      }

      const params: any = {
        page: pageNum,
        limit,
        start_date: filters.start_date || startDate || undefined,
        end_date: filters.end_date || today || undefined,
        payment_method: filters.payment_method || undefined,
        payment_status: filters.payment_status || undefined,
        sale_status: filters.sale_status || undefined,
      };

      // Only add search if provided
      if (filters.search) {
        params.search = filters.search;
      }
      
      console.log('Fetching sales with params:', params);
      
      const res = await api.get('/sales', { params });
      console.log('Sales response:', res.data);
      
      const salesData = res.data.data || res.data || [];
      setSales(Array.isArray(salesData) ? salesData : []);
      setTotalCount(res.data.total || salesData.length || 0);
      setPage(res.data.page || pageNum);
    } catch (error: any) {
      console.error('Failed to fetch sales:', error);
      console.error('Error response:', error.response?.data);
      
      if (error.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        router.push('/login');
      } else if (!isRefresh) {
        toast.error(error.response?.data?.error || 'Failed to fetch sales');
      }
    } finally {
      if (!isRefresh) {
        setLoading(false);
        initialLoadDone.current = true;
      }
    }
  }, [dateRange, filters, limit, router]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchDashboard();
    fetchSales(1, false);
  }, [user, fetchDashboard, fetchSales]);

  // Auto-refresh every 10 seconds
  useRealtimeRefresh(() => {
    if (initialLoadDone.current) {
      fetchSales(page, true);
      fetchDashboard();
    }
  }, 10000);

  const applyFilters = () => {
    setPage(1);
    fetchSales(1, false);
  };

  const clearFilters = () => {
    setFilters({ 
      search: '', 
      start_date: '', 
      end_date: '', 
      payment_method: '',
      payment_status: '',
      sale_status: '',
    });
    setDateRange('all');
    setPage(1);
    fetchSales(1, false);
  };

  const fetchSaleDetail = async (id: string) => {
    try {
      const res = await api.get(`/sales/${id}`);
      setSelectedSale(res.data);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Failed to fetch sale details:', error);
      toast.error('Failed to fetch sale details');
    }
  };

  const openVoidModal = (sale: Sale) => {
    setSelectedSale(sale as SaleDetail);
    setVoidReason('');
    setShowVoidModal(true);
  };

  const handleVoid = async () => {
    if (!selectedSale) return;
    if (!voidReason.trim()) {
      toast.error('Please provide a reason for voiding');
      return;
    }
    
    setVoiding(true);
    try {
      await api.put(`/sales/${selectedSale.id}/void`, { reason: voidReason });
      toast.success('Sale voided successfully');
      setShowVoidModal(false);
      setShowDetailModal(false);
      setSelectedSale(null);
      fetchSales(page, false);
      fetchDashboard();
    } catch (error: any) {
      console.error('Failed to void sale:', error);
      toast.error(error.response?.data?.error || 'Failed to void sale');
    } finally {
      setVoiding(false);
    }
  };

  const getCashierName = (sale: Sale): string => {
    if (sale.cashier?.full_name) {
      return sale.cashier.full_name;
    }
    if (sale.user?.full_name) {
      return sale.user.full_name;
    }
    return 'Unknown';
  };

  const exportCSV = () => {
    if (sales.length === 0) {
      toast.error('No data to export');
      return;
    }
    const headers = ['Receipt No', 'Date', 'Customer', 'Items', 'Total', 'Payment Method', 'Payment Status', 'Cashier'];
    const rows = sales.map((sale) => [
      sale.invoice_no,
      new Date(sale.sale_date).toLocaleDateString(),
      sale.customer?.name || sale.customer_name || 'Walk-in Customer',
      sale.sale_items ? sale.sale_items.map((item) => `${item.product.name} ×${item.quantity}`).join(' | ') : '',
      sale.total,
      sale.payment_method.toUpperCase(),
      sale.payment_status,
      getCashierName(sale),
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReceipt = (sale: Sale) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${sale.invoice_no}</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
            .total { font-size: 1.2em; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>DERAMMY AGROVET</h2>
            <p>P.O BOX 345, NANDI HILLS</p>
            <p>Tel: 0717149902, 0724985188</p>
            <h3>SALES RECEIPT</h3>
          </div>
          <p><strong>Receipt:</strong> ${sale.invoice_no}</p>
          <p><strong>Date:</strong> ${new Date(sale.sale_date).toLocaleString()}</p>
          <p><strong>Customer:</strong> ${sale.customer?.name || sale.customer_name || 'Walk-in Customer'}</p>
          <p><strong>Payment:</strong> ${sale.payment_method.toUpperCase()}</p>
          <p><strong>Cashier:</strong> ${getCashierName(sale)}</p>
          <table>
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${sale.sale_items?.map(item => `
                <tr>
                  <td>${item.product.name}</td>
                  <td>${item.quantity}</td>
                  <td>KES ${item.unit_price}</td>
                  <td>KES ${item.total}</td>
                </tr>
              `).join('') || ''}
            </tbody>
          </table>
          <p class="total">TOTAL: KES ${sale.total}</p>
          <p style="text-align: center; margin-top: 40px;">Thank you for shopping at</p>
          <p style="text-align: center;"><strong>DERAMMY AGROVET</strong></p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const totalRevenue = dashboard?.total_sales || 0;
  const todayRevenue = dashboard?.today_sales || 0;
  const todayTransactions = dashboard?.today_sales_count || 0;
  const totalTransactions = dashboard?.total_transactions || 0;
  const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  const paymentBreakdown = useMemo(() => {
    const breakdown: Record<string, { count: number; total: number }> = {};
    sales.forEach((sale) => {
      if (!breakdown[sale.payment_method]) {
        breakdown[sale.payment_method] = { count: 0, total: 0 };
      }
      breakdown[sale.payment_method].count++;
      breakdown[sale.payment_method].total += Number(sale.total);
    });
    return breakdown;
  }, [sales]);

  const totalPages = Math.ceil(totalCount / limit);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Layout>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>
            <i className="fas fa-chart-line" style={{ marginRight: '12px', color: '#0288D1' }}></i>
            Sales Management
          </h1>
          <p className="text-muted">Monitor sales performance, track transactions, and manage revenue</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => { fetchSales(page, false); fetchDashboard(); }} title="Refresh">
            <i className="fas fa-refresh" style={{ marginRight: '4px' }}></i> Refresh
          </button>
          <button className="btn btn-outline btn-sm" onClick={exportCSV} title="Export CSV">
            <i className="fas fa-file-csv" style={{ marginRight: '4px' }}></i> Export CSV
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex gap-2 mb-4">
        <button 
          className={`btn ${dateRange === 'today' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setDateRange('today')}
        >
          Today
        </button>
        <button 
          className={`btn ${dateRange === 'week' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setDateRange('week')}
        >
          This Week
        </button>
        <button 
          className={`btn ${dateRange === 'month' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setDateRange('month')}
        >
          This Month
        </button>
        <button 
          className={`btn ${dateRange === 'all' ? 'btn-primary' : 'btn-outline'} btn-sm`}
          onClick={() => setDateRange('all')}
        >
          All Time
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs mb-4">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <i className="fas fa-chart-bar" style={{ marginRight: '6px' }}></i>
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <i className="fas fa-history" style={{ marginRight: '6px' }}></i>
          Sales History
        </button>
        <button 
          className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <i className="fas fa-chart-pie" style={{ marginRight: '6px' }}></i>
          Analytics
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card summary-card">
              <div className="card-icon-wrapper" style={{ background: '#E3F2FD' }}>
                <i className="fas fa-money-bill-wave card-icon" style={{ color: '#1976D2' }}></i>
              </div>
              <h4>Total Revenue</h4>
              <p className="summary-value">{formatCurrency(totalRevenue)}</p>
              <span className="summary-subtitle">All time</span>
            </div>
            <div className="card summary-card">
              <div className="card-icon-wrapper" style={{ background: '#E8F5E9' }}>
                <i className="fas fa-receipt card-icon" style={{ color: '#4CAF50' }}></i>
              </div>
              <h4>Total Transactions</h4>
              <p className="summary-value">{totalTransactions}</p>
              <span className="summary-subtitle">{todayTransactions} today</span>
            </div>
            <div className="card summary-card">
              <div className="card-icon-wrapper" style={{ background: '#FFF3E0' }}>
                <i className="fas fa-calendar-day card-icon" style={{ color: '#F57C00' }}></i>
              </div>
              <h4>Today Revenue</h4>
              <p className="summary-value">{formatCurrency(todayRevenue)}</p>
              <span className="summary-subtitle">{todayTransactions} transactions</span>
            </div>
            <div className="card summary-card">
              <div className="card-icon-wrapper" style={{ background: '#FCE4EC' }}>
                <i className="fas fa-chart-line card-icon" style={{ color: '#D32F2F' }}></i>
              </div>
              <h4>Avg. Transaction</h4>
              <p className="summary-value">{formatCurrency(avgTransaction)}</p>
              <span className="summary-subtitle">Per sale</span>
            </div>
          </div>

          {/* Recent Sales Preview */}
          <div className="card mt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="card-title">
                <i className="fas fa-clock" style={{ marginRight: '8px', color: '#0288D1' }}></i>
                Recent Sales
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setActiveTab('history')}>
                View All
              </button>
            </div>
            {sales.slice(0, 5).map((sale) => (
              <div key={sale.id} className="flex justify-between items-center mb-3 p-3" style={{ background: '#F8F9FA', borderRadius: '8px' }}>
                <div>
                  <strong>{sale.invoice_no}</strong>
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                    {sale.customer?.name || sale.customer_name || 'Walk-in Customer'} | {formatDateTime(sale.sale_date)}
                  </p>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                    Cashier: {getCashierName(sale)}
                  </p>
                </div>
                <div className="text-right">
                  <strong style={{ color: '#4CAF50' }}>{formatCurrency(Number(sale.total))}</strong>
                  <p className="text-muted" style={{ fontSize: '0.8rem' }}>{sale.payment_method.toUpperCase()}</p>
                </div>
              </div>
            ))}
            {sales.length === 0 && (
              <p className="alert alert-info">No sales found for this period.</p>
            )}
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <>
          {/* Filters */}
          <div className="card mb-4">
            <div className="filters">
              <input
                type="text"
                placeholder="Search receipt, customer, cashier..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && applyFilters()}
                className="input"
              />
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="input"
                title="Start Date"
              />
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="input"
                title="End Date"
              />
              <select
                value={filters.payment_method}
                onChange={(e) => setFilters({ ...filters, payment_method: e.target.value })}
                className="input"
              >
                <option value="">All Payments</option>
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="credit">Credit</option>
                <option value="mixed">Mixed</option>
              </select>
              <button className="btn btn-primary" onClick={applyFilters}>
                <i className="fas fa-search" style={{ marginRight: '4px' }}></i> Apply
              </button>
              <button className="btn btn-outline" onClick={clearFilters}>Clear</button>
            </div>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="pos-loading-state">
              <div className="spinner"></div>
              <p>Loading sales...</p>
            </div>
          ) : (
            <>
              {/* Sales Table */}
              <div className="card">
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Receipt No</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Payment</th>
                        <th>Cashier</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((sale) => (
                        <tr key={sale.id}>
                          <td><strong>{sale.invoice_no}</strong></td>
                          <td>
                            {formatDate(sale.sale_date)}<br />
                            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                              {new Date(sale.sale_date).toLocaleTimeString()}
                            </span>
                          </td>
                          <td>
                            {sale.customer?.name || sale.customer_name || 'Walk-in Customer'}
                          </td>
                          <td>
                            {sale.sale_items && sale.sale_items.length > 0
                              ? sale.sale_items.slice(0, 2).map((item) => (
                                  <div key={item.id} style={{ fontSize: '0.85rem' }}>
                                    {item.product.name} ×{item.quantity}
                                  </div>
                                ))
                              : '—'}
                            {sale.sale_items && sale.sale_items.length > 2 && (
                              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                +{sale.sale_items.length - 2} more
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: 'bold', color: '#4CAF50' }}>
                            {formatCurrency(Number(sale.total))}
                          </td>
                          <td>
                            <span className="badge" style={{ 
                              background: sale.payment_method === 'cash' ? '#E8F5E9' : 
                                          sale.payment_method === 'mpesa' ? '#E3F2FD' : '#FFF3E0',
                              color: sale.payment_method === 'cash' ? '#4CAF50' : 
                                    sale.payment_method === 'mpesa' ? '#1976D2' : '#F57C00'
                            }}>
                              {sale.payment_method.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <strong>{getCashierName(sale)}</strong>
                          </td>
                          <td>
                            <div className="flex gap-1">
                              <button 
                                className="btn btn-sm btn-outline" 
                                onClick={() => fetchSaleDetail(sale.id)}
                                title="View Details"
                              >
                                <i className="fas fa-eye"></i>
                              </button>
                              <button 
                                className="btn btn-sm btn-outline" 
                                onClick={() => printReceipt(sale)}
                                title="Print Receipt"
                              >
                                <i className="fas fa-print"></i>
                              </button>
                              {sale.sale_status === 'completed' && user?.role !== 'cashier' && (
                                <button 
                                  className="btn btn-sm btn-danger" 
                                  onClick={() => openVoidModal(sale)}
                                  title="Void Sale"
                                >
                                  <i className="fas fa-ban"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {sales.length === 0 && (
                        <tr>
                          <td colSpan={8} className="text-center">
                            <i className="fas fa-inbox" style={{ fontSize: '2rem', marginBottom: '8px' }}></i>
                            <p>No sales found</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                  <button 
                    className="btn btn-outline btn-sm" 
                    disabled={page <= 1} 
                    onClick={() => fetchSales(page - 1, false)}
                  >
                    <i className="fas fa-chevron-left" style={{ marginRight: '4px' }}></i> Previous
                  </button>
                  <span>
                    Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalCount} total)
                  </span>
                  <button 
                    className="btn btn-outline btn-sm" 
                    disabled={page >= totalPages} 
                    onClick={() => fetchSales(page + 1, false)}
                  >
                    Next <i className="fas fa-chevron-right" style={{ marginLeft: '4px' }}></i>
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'analytics' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h3 className="card-title mb-4">
                <i className="fas fa-chart-pie" style={{ marginRight: '8px', color: '#F57C00' }}></i>
                Payment Methods
              </h3>
              {Object.entries(paymentBreakdown).map(([method, data]) => (
                <div key={method} className="flex justify-between items-center mb-3">
                  <div>
                    <strong>{method.toUpperCase()}</strong>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>{data.count} transactions</p>
                  </div>
                  <div className="text-right">
                    <strong style={{ color: '#4CAF50' }}>{formatCurrency(data.total)}</strong>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                      {((data.total / (totalRevenue || 1)) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
              {Object.keys(paymentBreakdown).length === 0 && (
                <p className="text-muted">No data available</p>
              )}
            </div>

            <div className="card">
              <h3 className="card-title mb-4">
                <i className="fas fa-users" style={{ marginRight: '8px', color: '#0288D1' }}></i>
                Cashier Performance
              </h3>
              {dashboard?.cashier_performance?.map((cashier: any) => (
                <div key={cashier.id} className="flex justify-between items-center mb-3">
                  <div>
                    <strong>{cashier.full_name}</strong>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>{cashier.total_count} transactions</p>
                  </div>
                  <div className="text-right">
                    <strong style={{ color: '#4CAF50' }}>{formatCurrency(Number(cashier.total_sales))}</strong>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                      Avg: {formatCurrency(Number(cashier.total_sales) / (cashier.total_count || 1))}
                    </p>
                  </div>
                </div>
              ))}
              {!dashboard?.cashier_performance?.length && (
                <p className="text-muted">No data available</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Sale Detail Modal */}
      {showDetailModal && selectedSale && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #1976D2 0%, #1565C0 100%)', color: 'white' }}>
              <h3 className="modal-title">
                <i className="fas fa-receipt" style={{ marginRight: '8px' }}></i>
                Sale Details
              </h3>
              <button className="modal-close" onClick={() => setShowDetailModal(false)} style={{ color: 'white' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: '20px', padding: '16px', background: '#F8F9FA', borderRadius: '8px' }}>
                <h4 style={{ margin: '0', color: '#1976D2' }}>DERAMMY AGROVET</h4>
                <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#666' }}>P.O BOX 345, NANDI HILLS</p>
                <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#666' }}>Tel: 0717149902, 0724985188</p>
                <h3 style={{ margin: '12px 0 0 0', color: '#333' }}>SALES RECEIPT</h3>
                <p style={{ margin: '4px 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#1976D2' }}>
                  {selectedSale.invoice_no}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="card" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
                  <p><strong>Date:</strong> {formatDateTime(selectedSale.sale_date)}</p>
                  <p><strong>Customer:</strong> {selectedSale.customer?.name || selectedSale.customer_name || 'Walk-in Customer'}</p>
                  {selectedSale.customer?.phone && (
                    <p><strong>Phone:</strong> {selectedSale.customer.phone}</p>
                  )}
                </div>
                <div className="card" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
                  <p><strong>Cashier:</strong> {getCashierName(selectedSale)}</p>
                  <p><strong>Payment Method:</strong> {selectedSale.payment_method.toUpperCase()}</p>
                  <p><strong>Payment Status:</strong> {selectedSale.payment_status}</p>
                  <p><strong>Sale Status:</strong> {selectedSale.sale_status}</p>
                </div>
              </div>

              <h4 className="mb-2" style={{ color: '#1976D2' }}>
                <i className="fas fa-list" style={{ marginRight: '8px' }}></i>
                Items
              </h4>
              <div className="table-responsive">
                <table className="table">
                  <thead style={{ background: '#F5F5F5' }}>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.sale_items?.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.product.name}</strong></td>
                        <td>{item.quantity} {item.product.unit}</td>
                        <td>{formatCurrency(Number(item.unit_price))}</td>
                        <td>{formatCurrency(Number(item.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '20px', padding: '16px', background: '#F8F9FA', borderRadius: '8px' }}>
                <div className="flex justify-between mb-2">
                  <span>Subtotal:</span>
                  <strong>{formatCurrency(Number(selectedSale.subtotal || selectedSale.total))}</strong>
                </div>
                {selectedSale.tax > 0 && (
                  <div className="flex justify-between mb-2">
                    <span>VAT (16%):</span>
                    <strong>{formatCurrency(Number(selectedSale.tax))}</strong>
                  </div>
                )}
                {selectedSale.discount > 0 && (
                  <div className="flex justify-between mb-2">
                    <span>Discount:</span>
                    <strong style={{ color: '#D32F2F' }}>-{formatCurrency(Number(selectedSale.discount))}</strong>
                  </div>
                )}
                <div className="flex justify-between" style={{ borderTop: '2px solid #1976D2', paddingTop: '12px', marginTop: '8px' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>TOTAL:</span>
                  <strong style={{ fontSize: '1.2rem', color: '#1976D2' }}>
                    {formatCurrency(Number(selectedSale.total))}
                  </strong>
                </div>
                {selectedSale.amount_paid > 0 && (
                  <div className="flex justify-between mt-2">
                    <span>Amount Paid:</span>
                    <strong style={{ color: '#4CAF50' }}>{formatCurrency(Number(selectedSale.amount_paid))}</strong>
                  </div>
                )}
                {selectedSale.change_due > 0 && (
                  <div className="flex justify-between mt-2">
                    <span>Change Due:</span>
                    <strong>{formatCurrency(Number(selectedSale.change_due))}</strong>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => printReceipt(selectedSale)}>
                <i className="fas fa-print" style={{ marginRight: '4px' }}></i> Print
              </button>
              {selectedSale.sale_status === 'completed' && user?.role !== 'cashier' && (
                <button 
                  className="btn btn-danger" 
                  onClick={() => {
                    setShowDetailModal(false);
                    openVoidModal(selectedSale);
                  }}
                >
                  <i className="fas fa-ban" style={{ marginRight: '4px' }}></i> Void Sale
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setShowDetailModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Void Sale Modal */}
      {showVoidModal && selectedSale && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-ban" style={{ marginRight: '8px', color: '#D32F2F' }}></i>
                Void Sale
              </h3>
              <button className="modal-close" onClick={() => setShowVoidModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warning mb-3">
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
                Are you sure you want to void this sale? Items will be restocked.
              </div>
              <p><strong>Receipt:</strong> {selectedSale.invoice_no}</p>
              <p><strong>Total:</strong> {formatCurrency(Number(selectedSale.total))}</p>
              <div className="form-group">
                <label>Reason for Voiding *</label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="Enter reason for voiding this sale..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowVoidModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleVoid} disabled={voiding}>
                {voiding ? 'Processing...' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
