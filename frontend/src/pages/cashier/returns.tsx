import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface SaleItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  return_status?: string;
  product: { id: string; name: string; unit: string };
}

interface Sale {
  id: string;
  invoice_no: string;
  sale_date: string;
  return_status?: string;
  customer: { id: string; name: string; phone?: string } | null;
  customer_name?: string;
  sale_items: SaleItem[];
}

interface ReturnItemInput {
  sale_item_id: string;
  quantity: number;
  reason: string;
  condition: string;
}

interface ReturnReceipt {
  id: string;
  return_receipt_no: string;
  return_date: string;
  total_refund: number;
  refund_method: string;
  return_type: string;
  items: any[];
}

interface Cashier {
  id: string;
  full_name: string;
}

export default function CashierReturns() {
  const { user } = useAuth();
  const router = useRouter();
  
  // Return form states
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemInput[]>([]);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'mpesa' | 'credit_note'>('cash');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchingReturn, setSearchingReturn] = useState(false);
  
  // Return type
  const [returnType, setReturnType] = useState<'return' | 'exchange'>('return');
  
  // Exchange states
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeResults, setExchangeResults] = useState<any[]>([]);
  const [exchangeProduct, setExchangeProduct] = useState<any | null>(null);
  const [exchangeQty, setExchangeQty] = useState(1);
  
  // Cashier selection
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [selectedCashierId, setSelectedCashierId] = useState('');
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [pendingReturnData, setPendingReturnData] = useState<any>(null);
  
  // Return receipt
  const [returnReceipt, setReturnReceipt] = useState<ReturnReceipt | null>(null);
  
  // Past returns
  const [myReturns, setMyReturns] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalReturns, setTotalReturns] = useState(0);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [selectedReturnDetail, setSelectedReturnDetail] = useState<any>(null);
  const [showReturnDetailModal, setShowReturnDetailModal] = useState(false);
  const limit = 10;

  // Stats
  const [stats, setStats] = useState({
    totalReturns: 0,
    totalRefunded: 0,
    todayReturns: 0,
    todayRefunded: 0,
  });

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/dashboard');
      return;
    }
    fetchMyReturns();
    fetchCashiers();
    fetchStats();
  }, [user, page]);

  const fetchCashiers = async () => {
    try {
      const res = await api.get('/cashiers/active');
      setCashiers(res.data || []);
    } catch (error) {
      console.error('Failed to fetch cashiers:', error);
    }
  };

  const fetchMyReturns = async () => {
    setLoadingReturns(true);
    try {
      const res = await api.get('/returns', { params: { page, limit, user_id: user?.id } });
      setMyReturns(res.data.data || []);
      setTotalReturns(res.data.total || 0);
    } catch (error: any) {
      console.error('Failed to fetch returns:', error);
      toast.error('Failed to fetch returns');
    } finally {
      setLoadingReturns(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/returns', { params: { user_id: user?.id, limit: 100 } });
      const allReturns = res.data.data || [];
      const totalRefunded = allReturns.reduce((sum: number, r: any) => sum + Number(r.total_refund || 0), 0);
      
      const today = new Date().toISOString().split('T')[0];
      const todayReturnsList = allReturns.filter((r: any) => r.return_date?.startsWith(today));
      const todayRefunded = todayReturnsList.reduce((sum: number, r: any) => sum + Number(r.total_refund || 0), 0);
      
      setStats({
        totalReturns: allReturns.length,
        totalRefunded,
        todayReturns: todayReturnsList.length,
        todayRefunded,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleInvoiceSearch = async () => {
    if (!invoiceSearch.trim()) {
      toast.error('Enter invoice number');
      return;
    }
    setSearchingReturn(true);
    setSale(null);
    setReturnItems([]);
    
    try {
      // Fetch recent sales and find by invoice number
      const res = await api.get('/sales', { params: { limit: 200 } });
      const found = res.data.data.find((s: any) => s.invoice_no === invoiceSearch.trim());
      
      if (!found) {
        toast.error('Invoice not found');
        return;
      }
      
      // Check if sale is fully returned
      if (found.return_status === 'full') {
        toast.error('This receipt has been fully returned');
        return;
      }
      
      // Check return window (5 working days)
      const saleDate = new Date(found.sale_date);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff > 5) {
        toast.error('Return window has expired (5 working days)');
        return;
      }
      
      // Fetch sale detail with items
      const detailRes = await api.get(`/sales/${found.id}`);
      const saleDetail = detailRes.data;
      
      // Filter out already returned items
      const availableItems = saleDetail.sale_items.filter(
        (item: any) => item.return_status === 'not_returned' || !item.return_status
      );
      
      if (availableItems.length === 0) {
        toast.error('All items in this receipt have been returned');
        return;
      }
      
      setSale({ ...saleDetail, sale_items: availableItems });
      setReturnItems([]);
      setReturnType('return');
      setExchangeProduct(null);
      setExchangeSearch('');
      setExchangeQty(1);
    } catch (error: any) {
      console.error('Failed to find sale:', error);
      toast.error('Failed to find sale');
    } finally {
      setSearchingReturn(false);
    }
  };

  const handleReturnItemChange = (saleItemId: string, field: string, value: any) => {
    setReturnItems((prev) => {
      const existing = prev.find((item) => item.sale_item_id === saleItemId);
      if (existing) {
        return prev.map((item) =>
          item.sale_item_id === saleItemId ? { ...item, [field]: value } : item
        );
      } else {
        return [...prev, { sale_item_id: saleItemId, quantity: 0, reason: '', condition: 'resellable', [field]: value }];
      }
    });
  };

  const searchExchangeProducts = async (term: string) => {
    setExchangeSearch(term);
    if (term.trim().length < 2) {
      setExchangeResults([]);
      return;
    }
    try {
      const res = await api.get('/products', { params: { search: term, limit: 10 } });
      setExchangeResults(res.data.data || []);
    } catch (error) {
      toast.error('Failed to search products');
    }
  };

  const selectExchangeProduct = (product: any) => {
    setExchangeProduct(product);
    setExchangeSearch(product.name);
    setExchangeResults([]);
  };

  const submitReturn = () => {
    if (!sale) return;
    const validItems = returnItems.filter((item) => item.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Select at least one item with quantity');
      return;
    }

    if (returnType === 'exchange') {
      if (!exchangeProduct) {
        toast.error('Select exchange product');
        return;
      }
    }

    const payload: any = {
      sale_id: sale.id,
      items: validItems,
      refund_method: refundMethod,
      reason: 'Return from cashier returns page',
      return_type: returnType,
    };

    if (returnType === 'exchange') {
      payload.exchange_product_id = exchangeProduct.id;
      payload.exchange_quantity = exchangeQty;
    }

    setPendingReturnData(payload);
    setSelectedCashierId('');
    setShowCashierModal(true);
  };

  const confirmCashierAndSubmit = async () => {
    if (!selectedCashierId) {
      toast.error('Select your name to confirm');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/returns', {
        ...pendingReturnData,
        cashier_id: selectedCashierId,
      });
      
      setReturnReceipt(res.data);
      setShowCashierModal(false);
      setSale(null);
      setInvoiceSearch('');
      setReturnItems([]);
      setExchangeProduct(null);
      setPendingReturnData(null);
      fetchMyReturns();
      fetchStats();
      toast.success('Return processed successfully');
    } catch (error: any) {
      setShowCashierModal(false);
      console.error('Failed to process return:', error);
      toast.error(error.response?.data?.error || 'Failed to process return');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchReturnDetail = async (returnId: string) => {
    try {
      const res = await api.get(`/returns/${returnId}`);
      setSelectedReturnDetail(res.data);
      setShowReturnDetailModal(true);
    } catch (error) {
      console.error('Failed to fetch return details:', error);
      toast.error('Failed to fetch return details');
    }
  };

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

  const totalPages = Math.ceil(totalReturns / limit);

  return (
    <Layout>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>
            <i className="fas fa-rotate-left" style={{ marginRight: '12px', color: '#F57C00' }}></i>
            Process Return
          </h1>
          <p className="text-muted">Search receipts and process returns or exchanges</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => { fetchMyReturns(); fetchStats(); }}>
          <i className="fas fa-refresh" style={{ marginRight: '4px' }}></i> Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="card summary-card">
          <div className="card-icon-wrapper" style={{ background: '#FFF3E0' }}>
            <i className="fas fa-rotate-left card-icon" style={{ color: '#F57C00' }}></i>
          </div>
          <h4>Total Returns</h4>
          <p className="summary-value">{stats.totalReturns}</p>
          <span className="summary-subtitle">All time</span>
        </div>
        <div className="card summary-card">
          <div className="card-icon-wrapper" style={{ background: '#E8F5E9' }}>
            <i className="fas fa-money-bill-wave card-icon" style={{ color: '#4CAF50' }}></i>
          </div>
          <h4>Total Refunded</h4>
          <p className="summary-value">{formatCurrency(stats.totalRefunded)}</p>
          <span className="summary-subtitle">All time</span>
        </div>
        <div className="card summary-card">
          <div className="card-icon-wrapper" style={{ background: '#E3F2FD' }}>
            <i className="fas fa-calendar-day card-icon" style={{ color: '#1976D2' }}></i>
          </div>
          <h4>Today Returns</h4>
          <p className="summary-value">{stats.todayReturns}</p>
          <span className="summary-subtitle">Today</span>
        </div>
        <div className="card summary-card">
          <div className="card-icon-wrapper" style={{ background: '#FCE4EC' }}>
            <i className="fas fa-hand-holding-usd card-icon" style={{ color: '#D32F2F' }}></i>
          </div>
          <h4>Today Refunded</h4>
          <p className="summary-value">{formatCurrency(stats.todayRefunded)}</p>
          <span className="summary-subtitle">Today</span>
        </div>
      </div>

      {/* Return Form */}
      <div className="card">
        <h3 className="card-title mb-4">
          <i className="fas fa-search" style={{ marginRight: '8px', color: '#F57C00' }}></i>
          Search Receipt
        </h3>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Enter sale invoice number (e.g., INV-20260829-0001)"
            value={invoiceSearch}
            onChange={(e) => setInvoiceSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleInvoiceSearch()}
            className="input"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={handleInvoiceSearch} disabled={searchingReturn}>
            {searchingReturn ? 'Searching...' : 'Find Sale'}
          </button>
        </div>

        {sale && (
          <>
            {/* Sale Info */}
            <div className="card mb-3" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p><strong>Invoice:</strong> {sale.invoice_no}</p>
                  <p><strong>Customer:</strong> {sale.customer?.name || sale.customer_name || 'Walk-in'}</p>
                  {sale.customer?.phone && <p><strong>Phone:</strong> {sale.customer.phone}</p>}
                </div>
                <div>
                  <p><strong>Date:</strong> {formatDate(sale.sale_date)}</p>
                  <p>
                    <strong>Return Status:</strong>{' '}
                    <span className={`status ${sale.return_status || 'none'}`}>
                      {sale.return_status || 'none'}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Return Type */}
            <div className="form-group">
              <label>Return Type</label>
              <select value={returnType} onChange={(e) => setReturnType(e.target.value as any)} className="input" style={{ maxWidth: '200px' }}>
                <option value="return">Return</option>
                <option value="exchange">Exchange</option>
              </select>
            </div>

            {/* Items Table */}
            <div className="table-responsive mt-4">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Original Qty</th>
                    <th>Return Status</th>
                    <th>Return Qty</th>
                    <th>Reason (Optional)</th>
                    <th>Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.sale_items.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.product.name}</strong></td>
                      <td>{item.quantity} {item.product.unit}</td>
                      <td>
                        <span className="badge" style={{ background: '#E8F5E9', color: '#4CAF50' }}>
                          AVAILABLE
                        </span>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          step="0.1"
                          className="input"
                          style={{ width: '80px' }}
                          onChange={(e) => handleReturnItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="input"
                          placeholder="Optional"
                          onChange={(e) => handleReturnItemChange(item.id, 'reason', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="input"
                          onChange={(e) => handleReturnItemChange(item.id, 'condition', e.target.value)}
                          defaultValue="resellable"
                        >
                          <option value="resellable">Resellable</option>
                          <option value="damaged">Damaged</option>
                          <option value="expired">Expired</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Exchange Section */}
            {returnType === 'exchange' && (
              <div className="mt-4">
                <label>Exchange Product</label>
                <input 
                  type="text" 
                  placeholder="Search product..." 
                  value={exchangeSearch} 
                  onChange={(e) => searchExchangeProducts(e.target.value)} 
                  className="input"
                />
                {exchangeResults.length > 0 && (
                  <div className="pos-search-results">
                    {exchangeResults.map((product) => (
                      <div key={product.id} className="pos-search-item" onClick={() => selectExchangeProduct(product)}>
                        <span>{product.name}</span>
                        <span>KES {product.selling_price}/{product.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
                {exchangeProduct && (
                  <div className="mt-2">
                    <p><strong>Exchange:</strong> {exchangeProduct.name} - KES {exchangeProduct.selling_price}</p>
                    <div className="form-group">
                      <label>Quantity</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={exchangeQty} 
                        onChange={(e) => setExchangeQty(parseInt(e.target.value) || 1)} 
                        className="input" 
                        style={{ width: '100px' }} 
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Refund Method */}
            <div className="mt-4">
              <label>Refund Method</label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as any)}
                className="input"
                style={{ maxWidth: '200px' }}
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="credit_note">Credit Note</option>
              </select>
            </div>

            <button className="btn btn-primary mt-4" onClick={submitReturn} disabled={submitting}>
              {submitting ? 'Processing...' : 'Submit Return'}
            </button>
          </>
        )}
      </div>

      {/* Past Returns */}
      <div className="card mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="card-title">
            <i className="fas fa-history" style={{ marginRight: '8px', color: '#0288D1' }}></i>
            My Returns History
          </h3>
          <span className="text-muted">{totalReturns} total returns</span>
        </div>

        {loadingReturns ? (
          <div className="pos-loading-state">
            <div className="spinner"></div>
            <p>Loading returns...</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Return Receipt</th>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Type</th>
                  <th>Total Refund</th>
                  <th>Method</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {myReturns.map((ret) => (
                  <tr key={ret.id}>
                    <td><strong>{ret.return_receipt_no || ret.id.slice(0, 8)}</strong></td>
                    <td>{formatDateTime(ret.return_date)}</td>
                    <td>{ret.sale?.invoice_no || ret.sale_id?.slice(0, 8) || '-'}</td>
                    <td>
                      <span className="badge" style={{ 
                        background: ret.return_type === 'exchange' ? '#FFF3E0' : '#E8F5E9',
                        color: ret.return_type === 'exchange' ? '#F57C00' : '#4CAF50'
                      }}>
                        {ret.return_type?.toUpperCase() || 'RETURN'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 'bold', color: '#D32F2F' }}>
                      {formatCurrency(Number(ret.total_refund || 0))}
                    </td>
                    <td>{ret.refund_method?.toUpperCase() || 'N/A'}</td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline" 
                        onClick={() => fetchReturnDetail(ret.id)}
                        title="View Details"
                      >
                        <i className="fas fa-eye"></i>
                      </button>
                    </td>
                  </tr>
                ))}
                {myReturns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center">
                      <i className="fas fa-inbox" style={{ fontSize: '2rem', marginBottom: '8px' }}></i>
                      <p>No returns yet</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-4">
            <button 
              className="btn btn-outline btn-sm" 
              disabled={page <= 1} 
              onClick={() => setPage(page - 1)}
            >
              <i className="fas fa-chevron-left" style={{ marginRight: '4px' }}></i> Previous
            </button>
            <span>Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
            <button 
              className="btn btn-outline btn-sm" 
              disabled={page >= totalPages} 
              onClick={() => setPage(page + 1)}
            >
              Next <i className="fas fa-chevron-right" style={{ marginLeft: '4px' }}></i>
            </button>
          </div>
        )}
      </div>

      {/* Cashier Selection Modal */}
      {showCashierModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-user-check" style={{ marginRight: '8px' }}></i>
                Confirm Cashier
              </h3>
              <button className="modal-close" onClick={() => setShowCashierModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <p>Who is processing this return?</p>
              <div className="form-group">
                <label>Select Your Name *</label>
                <select 
                  value={selectedCashierId} 
                  onChange={(e) => setSelectedCashierId(e.target.value)} 
                  className="input"
                >
                  <option value="">Select cashier...</option>
                  {cashiers.map((cashier) => (
                    <option key={cashier.id} value={cashier.id}>
                      {cashier.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCashierModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmCashierAndSubmit} disabled={submitting}>
                {submitting ? 'Processing...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Receipt Modal */}
      {returnReceipt && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-receipt" style={{ marginRight: '8px' }}></i>
                Return Receipt
              </h3>
              <button className="modal-close" onClick={() => setReturnReceipt(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body receipt-body">
              <div className="receipt-company">
                <h4>DERAMMY AGROVET</h4>
                <p>P.O BOX 345, NANDI HILLS</p>
                <p>Tel: 0717149902, 0724985188</p>
                <p>Quality Farm Inputs & Veterinary Supplies</p>
              </div>
              <hr />
              <p><strong>RETURN/EXCHANGE RECEIPT</strong></p>
              <p><strong>{returnReceipt.return_receipt_no}</strong></p>
              <p>Date: {formatDate(returnReceipt.return_date)}</p>
              <p>Time: {new Date(returnReceipt.return_date).toLocaleTimeString()}</p>
              <p>Type: {returnReceipt.return_type?.toUpperCase() || 'RETURN'}</p>
              <p>Refund Method: {returnReceipt.refund_method?.toUpperCase() || 'N/A'}</p>
              <p><strong>Total Refund: {formatCurrency(Number(returnReceipt.total_refund || 0))}</strong></p>
              {returnReceipt.items && returnReceipt.items.length > 0 && (
                <table className="table mt-2">
                  <thead><tr><th>Item</th><th>Qty</th><th>Condition</th></tr></thead>
                  <tbody>
                    {returnReceipt.items.map((item: any, index: number) => (
                      <tr key={item.id || index}>
                        <td>{item.product?.name || item.sale_item?.product?.name || 'Product'}</td>
                        <td>{item.quantity}</td>
                        <td>{item.condition || 'resellable'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p>Thank you for choosing</p>
              <p><strong>DERAMMY AGROVET</strong></p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setReturnReceipt(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                <i className="fas fa-print"></i> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Detail Modal */}
      {showReturnDetailModal && selectedReturnDetail && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-info-circle" style={{ marginRight: '8px' }}></i>
                Return Details
              </h3>
              <button className="modal-close" onClick={() => setShowReturnDetailModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="card mb-3" style={{ background: '#F8F9FA' }}>
                <p><strong>Return Receipt:</strong> {selectedReturnDetail.return_receipt_no || selectedReturnDetail.id}</p>
                <p><strong>Date:</strong> {formatDateTime(selectedReturnDetail.return_date)}</p>
                <p><strong>Type:</strong> {selectedReturnDetail.return_type?.toUpperCase() || 'RETURN'}</p>
                <p><strong>Refund Method:</strong> {selectedReturnDetail.refund_method?.toUpperCase() || 'N/A'}</p>
                <p><strong>Total Refund:</strong> {formatCurrency(Number(selectedReturnDetail.total_refund || 0))}</p>
              </div>
              
              {selectedReturnDetail.return_items && selectedReturnDetail.return_items.length > 0 && (
                <table className="table">
                  <thead>
                    <tr><th>Product</th><th>Qty</th><th>Condition</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {selectedReturnDetail.return_items.map((item: any) => (
                      <tr key={item.id}>
                        <td>{item.sale_item?.product?.name || 'Product'}</td>
                        <td>{item.quantity}</td>
                        <td>{item.condition || 'resellable'}</td>
                        <td>{item.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowReturnDetailModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
