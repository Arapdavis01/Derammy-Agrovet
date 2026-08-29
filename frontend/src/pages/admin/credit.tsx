import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  credit_limit: number;
  credit_balance: number;
  status?: string;
}

interface CreditSale {
  id: string;
  invoice_no: string;
  sale_date: string;
  total: number;
  amount_paid: number;
  payment_method: string;
  payment_status: string;
  customer: { id: string; name: string; phone?: string } | null;
  user: { id: string; full_name: string } | null;
}

interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference: string;
  customer: { id: string; name: string } | null;
  user: { id: string; full_name: string } | null;
  cashier?: { id: string; full_name: string } | null;
}

interface AgingBucket {
  customer_id: string;
  name: string;
  balance: number;
  oldest_credit_date: string | null;
  age_days: number;
  bucket: string;
}

export default function AdminCredit() {
  const { user } = useAuth();
  const router = useRouter();

  // Stats
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [customersWithDebt, setCustomersWithDebt] = useState(0);
  const [todayCreditSales, setTodayCreditSales] = useState(0);
  const [todayPayments, setTodayPayments] = useState(0);
  const [totalCreditLimit, setTotalCreditLimit] = useState(0);
  const [availableCredit, setAvailableCredit] = useState(0);

  // Data
  const [recentCreditSales, setRecentCreditSales] = useState<CreditSale[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [topDebtors, setTopDebtors] = useState<Customer[]>([]);
  
  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'aging' | 'debtors'>('overview');
  const [showPaymentDetails, setShowPaymentDetails] = useState<Payment | null>(null);
  const [showCustomerLedger, setShowCustomerLedger] = useState<Customer | null>(null);
  const [customerLedger, setCustomerLedger] = useState<any>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('today');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchAllData();
  }, [user, dateRange]);

  const fetchAllData = async () => {
    setLoading(true);
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
        startDate = '2000-01-01';
      }

      // Fetch all data in parallel
      const [customersRes, outstandingRes, creditSalesRes, paymentsRes, agingRes] = await Promise.allSettled([
        api.get('/customers', { params: { limit: 200 } }),
        api.get('/credit/outstanding'),
        api.get('/sales', { params: { payment_method: 'credit', start_date: startDate, end_date: today, limit: 200 } }),
        api.get('/credit/payments', { params: { limit: 200 } }),
        api.get('/credit/aging'),
      ]);

      // Process customers
      if (customersRes.status === 'fulfilled') {
        const customers = customersRes.value.data.data || [];
        setTotalCustomers(customers.length);
        
        const totalLimit = customers.reduce((sum: number, c: any) => sum + Number(c.credit_limit || 0), 0);
        const totalBalance = customers.reduce((sum: number, c: any) => sum + Number(c.credit_balance || 0), 0);
        setTotalCreditLimit(totalLimit);
        setAvailableCredit(Math.max(0, totalLimit - totalBalance));
        
        // Top debtors
        const debtors = customers
          .filter((c: any) => Number(c.credit_balance) > 0)
          .sort((a: any, b: any) => Number(b.credit_balance) - Number(a.credit_balance))
          .slice(0, 10);
        setTopDebtors(debtors);
      }

      // Process outstanding
      if (outstandingRes.status === 'fulfilled') {
        const outstandingList = outstandingRes.value.data || [];
        setOutstanding(outstandingList.reduce((sum: number, c: any) => sum + Number(c.credit_balance || 0), 0));
        setCustomersWithDebt(outstandingList.length);
      }

      // Process credit sales
      if (creditSalesRes.status === 'fulfilled') {
        const creditSales = creditSalesRes.value.data.data || [];
        setTodayCreditSales(creditSales.reduce((sum: number, s: any) => sum + Number(s.total), 0));
        setRecentCreditSales(creditSales.slice(0, 10));
      }

      // Process payments
      if (paymentsRes.status === 'fulfilled') {
        const allPayments = paymentsRes.value.data.data || paymentsRes.value.data || [];
        const filteredPayments = allPayments.filter((p: any) => 
          p.payment_date >= startDate && p.payment_date <= today + 'T23:59:59'
        );
        setTodayPayments(filteredPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0));
        
        const recent = allPayments
          .sort((a: any, b: any) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
          .slice(0, 20);
        setRecentPayments(recent);
      }

      // Process aging
      if (agingRes.status === 'fulfilled') {
        setAgingData(agingRes.value.data || []);
      }

    } catch (error) {
      console.error('Failed to load credit data:', error);
      toast.error('Failed to load credit data');
    } finally {
      setLoading(false);
    }
  };

  const handleViewCustomerLedger = async (customer: Customer) => {
    setShowCustomerLedger(customer);
    setLoadingLedger(true);
    try {
      const res = await api.get(`/credit/customers/${customer.id}/ledger`);
      setCustomerLedger(res.data);
    } catch (error) {
      console.error('Failed to fetch customer ledger:', error);
      toast.error('Failed to fetch customer ledger');
    } finally {
      setLoadingLedger(false);
    }
  };

  // Filter payments based on search
  const filteredPayments = useMemo(() => {
    if (!searchTerm) return recentPayments;
    const term = searchTerm.toLowerCase();
    return recentPayments.filter(
      (p) =>
        p.customer?.name.toLowerCase().includes(term) ||
        p.reference?.toLowerCase().includes(term) ||
        p.payment_method.toLowerCase().includes(term) ||
        p.user?.full_name.toLowerCase().includes(term)
    );
  }, [recentPayments, searchTerm]);

  // Aging buckets summary
  const agingSummary = useMemo(() => {
    const buckets = {
      current: { count: 0, total: 0 },
      '1_30': { count: 0, total: 0 },
      '31_60': { count: 0, total: 0 },
      '61_90': { count: 0, total: 0 },
      'over_90': { count: 0, total: 0 },
    };
    
    agingData.forEach((item) => {
      if (buckets[item.bucket as keyof typeof buckets]) {
        buckets[item.bucket as keyof typeof buckets].count++;
        buckets[item.bucket as keyof typeof buckets].total += Number(item.balance);
      }
    });
    
    return buckets;
  }, [agingData]);

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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case 'current': return '#4CAF50';
      case '1_30': return '#8BC34A';
      case '31_60': return '#FFC107';
      case '61_90': return '#FF9800';
      case 'over_90': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  return (
    <Layout>
      <div className="welcome-heading">
        <h1>
          <i className="fas fa-credit-card" style={{ marginRight: '12px' }}></i>
          Credit Management
        </h1>
        <p>Manage customer credit accounts, debt limits, and payments</p>
      </div>

      {/* Date Range Filter */}
      <div className="flex justify-between items-center mt-4 mb-4">
        <div className="flex gap-2">
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
        <button className="btn btn-outline btn-sm" onClick={fetchAllData}>
          <i className="fas fa-refresh" style={{ marginRight: '6px' }}></i> Refresh
        </button>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="pos-loading-state">
          <div className="spinner"></div>
          <p>Loading credit data...</p>
        </div>
      ) : (
        <>
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
              className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveTab('payments')}
            >
              <i className="fas fa-receipt" style={{ marginRight: '6px' }}></i>
              Payments
            </button>
            <button 
              className={`tab ${activeTab === 'aging' ? 'active' : ''}`}
              onClick={() => setActiveTab('aging')}
            >
              <i className="fas fa-clock" style={{ marginRight: '6px' }}></i>
              Aging Analysis
            </button>
            <button 
              className={`tab ${activeTab === 'debtors' ? 'active' : ''}`}
              onClick={() => setActiveTab('debtors')}
            >
              <i className="fas fa-users" style={{ marginRight: '6px' }}></i>
              Top Debtors
            </button>
          </div>

          {activeTab === 'overview' && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="card summary-card">
                  <div className="card-icon-wrapper" style={{ background: '#E3F2FD' }}>
                    <i className="fas fa-users card-icon" style={{ color: '#1976D2' }}></i>
                  </div>
                  <h4>Total Customers</h4>
                  <p className="summary-value">{totalCustomers}</p>
                  <span className="summary-subtitle">Registered customers</span>
                </div>
                <div className="card summary-card">
                  <div className="card-icon-wrapper" style={{ background: '#FFF3E0' }}>
                    <i className="fas fa-money-bill-wave card-icon" style={{ color: '#F57C00' }}></i>
                  </div>
                  <h4>Total Outstanding</h4>
                  <p className="summary-value">{formatCurrency(outstanding)}</p>
                  <span className="summary-subtitle">{customersWithDebt} customers with debt</span>
                </div>
                <div className="card summary-card">
                  <div className="card-icon-wrapper" style={{ background: '#E8F5E9' }}>
                    <i className="fas fa-credit-card card-icon" style={{ color: '#4CAF50' }}></i>
                  </div>
                  <h4>Available Credit</h4>
                  <p className="summary-value">{formatCurrency(availableCredit)}</p>
                  <span className="summary-subtitle">Of {formatCurrency(totalCreditLimit)} total limit</span>
                </div>
                <div className="card summary-card">
                  <div className="card-icon-wrapper" style={{ background: '#FCE4EC' }}>
                    <i className="fas fa-exclamation-triangle card-icon" style={{ color: '#D32F2F' }}></i>
                  </div>
                  <h4>Credit Utilization</h4>
                  <p className="summary-value">
                    {totalCreditLimit > 0 ? ((outstanding / totalCreditLimit) * 100).toFixed(1) : 0}%
                  </p>
                  <span className="summary-subtitle">Of total credit limit</span>
                </div>
              </div>

              {/* Today's Stats */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="card">
                  <h3 className="card-title">
                    <i className="fas fa-calendar-day" style={{ marginRight: '8px', color: '#0288D1' }}></i>
                    Today's Credit Sales
                  </h3>
                  <p className="text-2xl font-bold mt-2" style={{ color: '#0288D1' }}>
                    {formatCurrency(todayCreditSales)}
                  </p>
                </div>
                <div className="card">
                  <h3 className="card-title">
                    <i className="fas fa-hand-holding-usd" style={{ marginRight: '8px', color: '#4CAF50' }}></i>
                    Today's Payments
                  </h3>
                  <p className="text-2xl font-bold mt-2" style={{ color: '#4CAF50' }}>
                    {formatCurrency(todayPayments)}
                  </p>
                </div>
              </div>

              {/* Recent Credit Sales */}
              <div className="card mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="card-title">
                    <i className="fas fa-file-invoice-dollar" style={{ marginRight: '8px', color: '#F57C00' }}></i>
                    Recent Credit Sales
                  </h3>
                  <button className="btn btn-sm btn-outline" onClick={() => setActiveTab('payments')}>
                    View All
                  </button>
                </div>
                {recentCreditSales.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Date</th>
                          <th>Customer</th>
                          <th>Total</th>
                          <th>Balance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentCreditSales.slice(0, 5).map((sale) => (
                          <tr key={sale.id}>
                            <td><strong>{sale.invoice_no}</strong></td>
                            <td>{formatDate(sale.sale_date)}</td>
                            <td>{sale.customer?.name || 'Walk-in'}</td>
                            <td>{formatCurrency(Number(sale.total))}</td>
                            <td style={{ color: '#F57C00', fontWeight: 'bold' }}>
                              {formatCurrency(Number(sale.total) - Number(sale.amount_paid || 0))}
                            </td>
                            <td>
                              <span className="status held">Credit</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="alert alert-success">No credit sales in this period!</p>
                )}
              </div>
            </>
          )}

          {activeTab === 'payments' && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h3 className="card-title">
                  <i className="fas fa-receipt" style={{ marginRight: '8px', color: '#4CAF50' }}></i>
                  Debt Payments
                </h3>
                <div className="filters">
                  <input
                    type="text"
                    placeholder="Search by customer, reference, method..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input"
                    style={{ maxWidth: '300px' }}
                  />
                </div>
              </div>

              <p className="text-muted mb-4">
                Total: <strong>{formatCurrency(filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0))}</strong>
              </p>

              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Received By</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDate(payment.payment_date)}</td>
                        <td><strong>{payment.customer?.name || '-'}</strong></td>
                        <td style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                          {formatCurrency(Number(payment.amount))}
                        </td>
                        <td>
                          <span className="badge" style={{ background: '#E8F5E9', color: '#4CAF50' }}>
                            {payment.payment_method.toUpperCase()}
                          </span>
                        </td>
                        <td>{payment.reference || '-'}</td>
                        <td>{payment.user?.full_name || payment.cashier?.full_name || '-'}</td>
                        <td>
                          <button 
                            className="btn btn-sm btn-outline"
                            onClick={() => setShowPaymentDetails(payment)}
                          >
                            <i className="fas fa-eye"></i> View
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredPayments.length === 0 && (
                      <tr><td colSpan={7} className="text-center">No payments found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'aging' && (
            <>
              {/* Aging Summary Cards */}
              <div className="grid grid-cols-5 gap-4 mb-4">
                <div className="card text-center">
                  <h4 className="text-muted">Current</h4>
                  <p className="text-2xl font-bold" style={{ color: '#4CAF50' }}>
                    {formatCurrency(agingSummary.current.total)}
                  </p>
                  <p className="text-muted">{agingSummary.current.count} customers</p>
                </div>
                <div className="card text-center">
                  <h4 className="text-muted">1-30 Days</h4>
                  <p className="text-2xl font-bold" style={{ color: '#8BC34A' }}>
                    {formatCurrency(agingSummary['1_30'].total)}
                  </p>
                  <p className="text-muted">{agingSummary['1_30'].count} customers</p>
                </div>
                <div className="card text-center">
                  <h4 className="text-muted">31-60 Days</h4>
                  <p className="text-2xl font-bold" style={{ color: '#FFC107' }}>
                    {formatCurrency(agingSummary['31_60'].total)}
                  </p>
                  <p className="text-muted">{agingSummary['31_60'].count} customers</p>
                </div>
                <div className="card text-center">
                  <h4 className="text-muted">61-90 Days</h4>
                  <p className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {formatCurrency(agingSummary['61_90'].total)}
                  </p>
                  <p className="text-muted">{agingSummary['61_90'].count} customers</p>
                </div>
                <div className="card text-center">
                  <h4 className="text-muted">90+ Days</h4>
                  <p className="text-2xl font-bold" style={{ color: '#F44336' }}>
                    {formatCurrency(agingSummary.over_90.total)}
                  </p>
                  <p className="text-muted">{agingSummary.over_90.count} customers</p>
                </div>
              </div>

              {/* Aging Table */}
              <div className="card">
                <h3 className="card-title mb-4">
                  <i className="fas fa-clock" style={{ marginRight: '8px', color: '#FF9800' }}></i>
                  Credit Aging Analysis
                </h3>
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Balance</th>
                        <th>Oldest Credit Date</th>
                        <th>Age (Days)</th>
                        <th>Bucket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.map((item) => (
                        <tr key={item.customer_id}>
                          <td><strong>{item.name}</strong></td>
                          <td style={{ color: '#D32F2F', fontWeight: 'bold' }}>
                            {formatCurrency(Number(item.balance))}
                          </td>
                          <td>{item.oldest_credit_date ? formatDate(item.oldest_credit_date) : '-'}</td>
                          <td>{item.age_days} days</td>
                          <td>
                            <span 
                              className="badge" 
                              style={{ 
                                background: getAgingColor(item.bucket) + '20',
                                color: getAgingColor(item.bucket)
                              }}
                            >
                              {item.bucket.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {agingData.length === 0 && (
                        <tr><td colSpan={5} className="text-center">No aging data available</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'debtors' && (
            <div className="card">
              <h3 className="card-title mb-4">
                <i className="fas fa-users" style={{ marginRight: '8px', color: '#D32F2F' }}></i>
                Top Debtors
              </h3>
              {topDebtors.length > 0 ? (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>Credit Limit</th>
                        <th>Balance</th>
                        <th>Utilization</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDebtors.map((customer, index) => {
                        const utilization = Number(customer.credit_limit) > 0 
                          ? (Number(customer.credit_balance) / Number(customer.credit_limit)) * 100 
                          : 0;
                        return (
                          <tr key={customer.id}>
                            <td>
                              <span 
                                className="badge" 
                                style={{ 
                                  background: index < 3 ? '#FFEBEE' : '#F5F5F5',
                                  color: index < 3 ? '#D32F2F' : '#616161',
                                  fontWeight: 'bold'
                                }}
                              >
                                #{index + 1}
                              </span>
                            </td>
                            <td><strong>{customer.name}</strong></td>
                            <td>{customer.phone || '-'}</td>
                            <td>{formatCurrency(Number(customer.credit_limit))}</td>
                            <td style={{ color: '#D32F2F', fontWeight: 'bold' }}>
                              {formatCurrency(Number(customer.credit_balance))}
                            </td>
                            <td>
                              <div className="progress-bar" style={{ width: '100%', background: '#E0E0E0', borderRadius: '4px' }}>
                                <div 
                                  style={{ 
                                    width: `${Math.min(100, utilization)}%`,
                                    background: utilization > 90 ? '#F44336' : utilization > 70 ? '#FF9800' : '#4CAF50',
                                    height: '8px',
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease'
                                  }}
                                />
                              </div>
                              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                {utilization.toFixed(1)}%
                              </span>
                            </td>
                            <td>
                              <button 
                                className="btn btn-sm btn-outline"
                                onClick={() => handleViewCustomerLedger(customer)}
                              >
                                <i className="fas fa-book"></i> Ledger
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="alert alert-success">
                  <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
                  No customers with outstanding debt!
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Payment Details Modal */}
      {showPaymentDetails && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-receipt" style={{ marginRight: '8px' }}></i>
                Payment Details
              </h3>
              <button className="modal-close" onClick={() => setShowPaymentDetails(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="card mb-3" style={{ background: '#F5F5F5' }}>
                <p><strong>Customer:</strong> {showPaymentDetails.customer?.name || '-'}</p>
                <p><strong>Amount:</strong> {formatCurrency(Number(showPaymentDetails.amount))}</p>
                <p><strong>Method:</strong> {showPaymentDetails.payment_method.toUpperCase()}</p>
                <p><strong>Date:</strong> {formatDate(showPaymentDetails.payment_date)}</p>
                {showPaymentDetails.reference && (
                  <p><strong>Reference:</strong> {showPaymentDetails.reference}</p>
                )}
                <p><strong>Received By:</strong> {showPaymentDetails.user?.full_name || showPaymentDetails.cashier?.full_name || '-'}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowPaymentDetails(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Ledger Modal */}
      {showCustomerLedger && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-book" style={{ marginRight: '8px' }}></i>
                Customer Ledger
              </h3>
              <button className="modal-close" onClick={() => {
                setShowCustomerLedger(null);
                setCustomerLedger(null);
              }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              {loadingLedger ? (
                <div className="pos-loading-state">
                  <div className="spinner"></div>
                  <p>Loading ledger...</p>
                </div>
              ) : customerLedger ? (
                <>
                  <div className="card mb-4" style={{ background: '#F5F5F5' }}>
                    <h4>{customerLedger.customer.name}</h4>
                    <p><strong>Credit Limit:</strong> {formatCurrency(Number(customerLedger.customer.credit_limit))}</p>
                    <p>
                      <strong>Current Balance:</strong>{' '}
                      <span style={{ color: '#D32F2F', fontWeight: 'bold' }}>
                        {formatCurrency(Number(customerLedger.customer.credit_balance))}
                      </span>
                    </p>
                  </div>

                  <h4 className="mb-2">Credit Sales</h4>
                  {customerLedger.sales?.length > 0 ? (
                    <table className="table mb-4">
                      <thead>
                        <tr><th>Invoice</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th></tr>
                      </thead>
                      <tbody>
                        {customerLedger.sales.map((sale: any) => (
                          <tr key={sale.id}>
                            <td>{sale.invoice_no}</td>
                            <td>{formatDate(sale.sale_date)}</td>
                            <td>{formatCurrency(Number(sale.total))}</td>
                            <td>{formatCurrency(Number(sale.amount_paid || 0))}</td>
                            <td style={{ color: '#F57C00' }}>
                              {formatCurrency(Number(sale.total) - Number(sale.amount_paid || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted mb-4">No credit sales</p>
                  )}

                  <h4 className="mb-2">Payments</h4>
                  {customerLedger.payments?.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr>
                      </thead>
                      <tbody>
                        {customerLedger.payments.map((payment: any) => (
                          <tr key={payment.id}>
                            <td>{formatDate(payment.payment_date)}</td>
                            <td style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                              {formatCurrency(Number(payment.amount))}
                            </td>
                            <td>{payment.payment_method.toUpperCase()}</td>
                            <td>{payment.reference || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted">No payments</p>
                  )}
                </>
              ) : (
                <p>No ledger data available</p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => {
                setShowCustomerLedger(null);
                setCustomerLedger(null);
              }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
