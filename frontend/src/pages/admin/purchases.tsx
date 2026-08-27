import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  cost_price: number;
  selling_price: number;
}

interface Cashier {
  id: string;
  full_name: string;
}

interface PurchaseItem {
  id: string;
  product_id: string;
  quantity: number;
  cost_price: number;
  total: number;
  product: Product;
}

interface Purchase {
  id: string;
  po_number: string;
  supplier_id: string;
  purchase_date: string;
  total: number;
  status: string;
  supplier: Supplier | null;
  requested_by: string | null;
  received_by: string | null;
  edited_by: string | null;
  requested_by_user?: Cashier | null;
  received_by_user?: Cashier | null;
  edited_by_user?: Cashier | null;
  purchase_items: PurchaseItem[];
}

interface CashierPerformance {
  cashier_id: string;
  full_name: string;
  requested_count: number;
  received_count: number;
  edited_count: number;
  total_value: number;
}

export default function AdminPurchases() {
  const { user } = useAuth();
  const router = useRouter();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [requestedByFilter, setRequestedByFilter] = useState('');
  const [receivedByFilter, setReceivedByFilter] = useState('');
  const [editedByFilter, setEditedByFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // UI states
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [selectedPO, setSelectedPO] = useState<Purchase | null>(null);
  const [printPO, setPrintPO] = useState<Purchase | null>(null);
  const [showCashierPerformance, setShowCashierPerformance] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/purchases');
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [purchasesRes, cashiersRes] = await Promise.all([
        api.get('/purchases', { params: { limit: 500 } }),
        api.get('/cashiers/active'),
      ]);
      setPurchases(purchasesRes.data.data || []);
      setCashiers(cashiersRes.data || []);
    } catch (error) {
      toast.error('Failed to fetch purchase data');
    } finally {
      setLoading(false);
    }
  };

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        p.po_number?.toLowerCase().includes(searchLower) ||
        p.supplier?.name?.toLowerCase().includes(searchLower) ||
        p.requested_by_user?.full_name?.toLowerCase().includes(searchLower) ||
        p.received_by_user?.full_name?.toLowerCase().includes(searchLower) ||
        p.edited_by_user?.full_name?.toLowerCase().includes(searchLower);

      const matchesStatus = !statusFilter || p.status === statusFilter;
      const matchesRequestedBy = !requestedByFilter || p.requested_by === requestedByFilter;
      const matchesReceivedBy = !receivedByFilter || p.received_by === receivedByFilter;
      const matchesEditedBy = !editedByFilter || p.edited_by === editedByFilter;

      const pDate = new Date(p.purchase_date);
      const matchesStartDate = !startDate || pDate >= new Date(startDate);
      const matchesEndDate = !endDate || pDate <= new Date(endDate);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesRequestedBy &&
        matchesReceivedBy &&
        matchesEditedBy &&
        matchesStartDate &&
        matchesEndDate
      );
    });
  }, [
    purchases,
    search,
    statusFilter,
    requestedByFilter,
    receivedByFilter,
    editedByFilter,
    startDate,
    endDate,
  ]);

  // KPI calculations
  const kpi = useMemo(() => {
    const totalPOs = purchases.length;
    const pendingPOs = purchases.filter((p) => p.status === 'pending').length;
    const receivedPOs = purchases.filter((p) => p.status === 'received').length;
    const totalValue = purchases.reduce((sum, p) => sum + Number(p.total), 0);
    return { totalPOs, pendingPOs, receivedPOs, totalValue };
  }, [purchases]);

  // Cashier performance
  const cashierPerformance = useMemo(() => {
    const map = new Map<string, CashierPerformance>();

    purchases.forEach((p) => {
      // Requested
      if (p.requested_by) {
        const key = p.requested_by;
        if (!map.has(key)) {
          map.set(key, {
            cashier_id: key,
            full_name: p.requested_by_user?.full_name || 'Unknown',
            requested_count: 0,
            received_count: 0,
            edited_count: 0,
            total_value: 0,
          });
        }
        const entry = map.get(key)!;
        entry.requested_count += 1;
        entry.total_value += Number(p.total);
      }
      // Received
      if (p.received_by) {
        const key = p.received_by;
        if (!map.has(key)) {
          map.set(key, {
            cashier_id: key,
            full_name: p.received_by_user?.full_name || 'Unknown',
            requested_count: 0,
            received_count: 0,
            edited_count: 0,
            total_value: 0,
          });
        }
        map.get(key)!.received_count += 1;
      }
      // Edited
      if (p.edited_by) {
        const key = p.edited_by;
        if (!map.has(key)) {
          map.set(key, {
            cashier_id: key,
            full_name: p.edited_by_user?.full_name || 'Unknown',
            requested_count: 0,
            received_count: 0,
            edited_count: 0,
            total_value: 0,
          });
        }
        map.get(key)!.edited_count += 1;
      }
    });

    return Array.from(map.values());
  }, [purchases]);

  // Grouped by supplier
  const groupedBySupplier = useMemo(() => {
    const map = new Map<string, { supplier: Supplier; orders: Purchase[] }>();
    filteredPurchases.forEach((p) => {
      const sid = p.supplier_id;
      if (!map.has(sid)) {
        map.set(sid, { supplier: p.supplier || { id: sid, name: 'Unknown' }, orders: [] });
      }
      map.get(sid)!.orders.push(p);
    });
    return Array.from(map.values());
  }, [filteredPurchases]);

  const totalFiltered = filteredPurchases.reduce((sum, p) => sum + Number(p.total), 0);

  const openPrintModal = async (purchaseId: string) => {
    try {
      const res = await api.get(`/purchases/${purchaseId}`);
      setPrintPO(res.data);
    } catch (error) {
      toast.error('Failed to load purchase details');
    }
  };

  const openDetailsModal = async (purchaseId: string) => {
    try {
      const res = await api.get(`/purchases/${purchaseId}`);
      setSelectedPO(res.data);
    } catch (error) {
      toast.error('Failed to load purchase details');
    }
  };

  const exportCSV = () => {
    if (filteredPurchases.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = [
      'PO Number',
      'Supplier',
      'Date',
      'Requested By',
      'Received By',
      'Edited By',
      'Status',
      'Total (KES)',
    ];

    const rows = filteredPurchases.map((p) => [
      p.po_number,
      p.supplier?.name || 'Unknown',
      new Date(p.purchase_date).toLocaleDateString(),
      p.requested_by_user?.full_name || 'N/A',
      p.received_by_user?.full_name || 'N/A',
      p.edited_by_user?.full_name || 'N/A',
      p.status,
      p.total,
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `purchases_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <Layout>
      <div className="welcome-heading">
        <h1>Purchases Overview</h1>
        <p>Track all purchase orders, cashier activities, and stock updates.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="card summary-card">
          <i className="fas fa-file-invoice card-icon" style={{ color: '#0F766E' }}></i>
          <h4>Total POs</h4>
          <p className="summary-value">{kpi.totalPOs}</p>
          <span className="summary-subtitle">All purchase orders</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-clock card-icon" style={{ color: '#F59E0B' }}></i>
          <h4>Pending</h4>
          <p className="summary-value">{kpi.pendingPOs}</p>
          <span className="summary-subtitle">Awaiting receive</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-check-circle card-icon" style={{ color: '#10B981' }}></i>
          <h4>Received</h4>
          <p className="summary-value">{kpi.receivedPOs}</p>
          <span className="summary-subtitle">Stock updated</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-money-bill-wave card-icon" style={{ color: '#D97757' }}></i>
          <h4>Total Value</h4>
          <p className="summary-value">KES {kpi.totalValue.toLocaleString()}</p>
          <span className="summary-subtitle">All purchases</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters mt-6">
        <input
          type="text"
          placeholder="Search PO, supplier, cashier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
        </select>
        <select value={requestedByFilter} onChange={(e) => setRequestedByFilter(e.target.value)} className="input">
          <option value="">All Requested By</option>
          {cashiers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
        <select value={receivedByFilter} onChange={(e) => setReceivedByFilter(e.target.value)} className="input">
          <option value="">All Received By</option>
          {cashiers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
        <select value={editedByFilter} onChange={(e) => setEditedByFilter(e.target.value)} className="input">
          <option value="">All Edited By</option>
          {cashiers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
        <button className="btn btn-outline" onClick={fetchData}>
          <i className="fas fa-refresh"></i> Refresh
        </button>
        <button className="btn btn-outline" onClick={exportCSV}>
          <i className="fas fa-download"></i> Export CSV
        </button>
        <button className="btn btn-outline" onClick={() => setShowCashierPerformance(!showCashierPerformance)}>
          <i className="fas fa-users"></i> Cashier Performance
        </button>
      </div>

      {/* Cashier Performance Table */}
      {showCashierPerformance && cashierPerformance.length > 0 && (
        <div className="card mb-4">
          <h3 className="card-title">Cashier Performance</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Cashier</th>
                <th>Requested</th>
                <th>Received</th>
                <th>Edited</th>
                <th>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {cashierPerformance.map((perf) => (
                <tr key={perf.cashier_id}>
                  <td>{perf.full_name}</td>
                  <td>{perf.requested_count}</td>
                  <td>{perf.received_count}</td>
                  <td>{perf.edited_count}</td>
                  <td>KES {perf.total_value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2">
        Total: KES {totalFiltered.toFixed(2)} | Suppliers: {groupedBySupplier.length} | POs: {filteredPurchases.length}
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="mt-4">
          {groupedBySupplier.map((group) => {
            const pendingCount = group.orders.filter((o) => o.status === 'pending').length;
            const receivedCount = group.orders.filter((o) => o.status === 'received').length;
            return (
              <div key={group.supplier.id} className="card mb-2">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => setExpandedSupplier(expandedSupplier === group.supplier.id ? null : group.supplier.id)}
                >
                  <div>
                    <strong>{group.supplier.name}</strong>
                    <p className="text-muted">
                      {group.orders.length} orders | Last: {group.orders[0] ? new Date(group.orders[0].purchase_date).toLocaleDateString() : ''}
                    </p>
                    <span className="text-muted">{pendingCount} pending {receivedCount} received</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>KES {group.orders.reduce((sum, o) => sum + Number(o.total), 0).toFixed(2)}</span>
                    <i className={`fas fa-chevron-${expandedSupplier === group.supplier.id ? 'up' : 'down'}`}></i>
                  </div>
                </div>
                {expandedSupplier === group.supplier.id && (
                  <table className="table mt-2">
                    <thead>
                      <tr>
                        <th>PO Number</th>
                        <th>Requested By</th>
                        <th>Received By</th>
                        <th>Edited By</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.orders.map((order) => (
                        <tr key={order.id}>
                          <td><strong>{order.po_number || order.id.slice(0, 8)}</strong></td>
                          <td>{order.requested_by_user?.full_name || 'N/A'}</td>
                          <td>{order.received_by_user?.full_name || 'N/A'}</td>
                          <td>{order.edited_by_user?.full_name || 'N/A'}</td>
                          <td>KES {order.total}</td>
                          <td><span className={`status ${order.status}`}>{order.status}</span></td>
                          <td>{new Date(order.purchase_date).toLocaleDateString()}</td>
                          <td>
                            <button className="btn btn-sm btn-outline" onClick={() => openDetailsModal(order.id)}>
                              <i className="fas fa-eye"></i>
                            </button>
                            <button className="btn btn-sm btn-outline" onClick={() => openPrintModal(order.id)}>
                              <i className="fas fa-print"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          {groupedBySupplier.length === 0 && (
            <p className="alert alert-info">No purchase orders found.</p>
          )}
        </div>
      )}

      {/* Details Modal */}
      {selectedPO && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-info-circle"></i> Purchase Order Details</h3>
              <button className="modal-close" onClick={() => setSelectedPO(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p><strong>PO Number:</strong> {selectedPO.po_number}</p>
              <p><strong>Supplier:</strong> {selectedPO.supplier?.name}</p>
              <p><strong>Date:</strong> {new Date(selectedPO.purchase_date).toLocaleString()}</p>
              <p><strong>Status:</strong> {selectedPO.status}</p>
              <p><strong>Requested By:</strong> {selectedPO.requested_by_user?.full_name || 'N/A'}</p>
              <p><strong>Received By:</strong> {selectedPO.received_by_user?.full_name || 'N/A'}</p>
              <p><strong>Edited By:</strong> {selectedPO.edited_by_user?.full_name || 'N/A'}</p>
              <table className="table mt-2">
                <thead>
                  <tr><th>Product</th><th>Qty</th><th>Unit</th><th>Buy Price</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {selectedPO.purchase_items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product?.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.product?.unit}</td>
                      <td>KES {item.cost_price}</td>
                      <td>KES {item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p><strong>TOTAL: KES {selectedPO.total}</strong></p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedPO(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printPO && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-print"></i> Purchase Order</h3>
              <button className="modal-close" onClick={() => setPrintPO(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="receipt-company">
                <h4>DERAMMY AGROVET</h4>
                <p>P.O BOX 345, NANDI HILLS</p>
                <p>Tel: 0717149902, 0724985188</p>
                <p>Quality Farm Inputs & Veterinary Supplies</p>
              </div>
              <hr />
              <p><strong>PURCHASE ORDER</strong></p>
              <p><strong>{printPO.po_number}</strong></p>
              <p>Supplier: {printPO.supplier?.name || 'N/A'}</p>
              <p>Date: {new Date(printPO.purchase_date).toLocaleDateString()}</p>
              <p>Status: {printPO.status}</p>
              <p>Requested By: {printPO.requested_by_user?.full_name || 'N/A'}</p>
              <p>Received By: {printPO.received_by_user?.full_name || 'N/A'}</p>
              <p>Edited By: {printPO.edited_by_user?.full_name || 'N/A'}</p>
              <table className="table mt-2">
                <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Buy Price</th><th>Total</th></tr></thead>
                <tbody>
                  {printPO.purchase_items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product?.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.product?.unit}</td>
                      <td>KES {item.cost_price}</td>
                      <td>KES {item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p><strong>TOTAL: KES {printPO.total}</strong></p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setPrintPO(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => window.print()}><i className="fas fa-print"></i> Print</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
