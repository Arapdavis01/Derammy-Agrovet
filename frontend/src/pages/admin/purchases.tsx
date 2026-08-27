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

interface PurchaseItem {
  id: string;
  product_id: string;
  quantity: number;
  cost_price: number;
  total: number;
  product: { id: string; name: string; unit: string };
}

interface Purchase {
  id: string;
  supplier_id: string;
  purchase_date: string;
  total: number;
  status: string;
  po_number: string;
  supplier: { id: string; name: string } | null;
  requested_by_user?: { full_name: string } | null;
  received_by_user?: { full_name: string } | null;
  edited_by_user?: { full_name: string } | null;
  purchase_items?: PurchaseItem[];
}

export default function AdminPurchases() {
  const { user } = useAuth();
  const router = useRouter();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [printPO, setPrintPO] = useState<Purchase | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/purchases');
      return;
    }
    fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/purchases', { params: { limit: 200 } });
      setPurchases(res.data.data || []);
    } catch (error) {
      toast.error('Failed to fetch purchase history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const receivePurchase = async (purchaseId: string) => {
    const receivedBy = user?.id;
    try {
      await api.put(`/purchases/${purchaseId}/receive`, { received_by: receivedBy });
      toast.success('Stock received successfully');
      fetchHistory();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to receive purchase');
    }
  };

  const openPrintModal = (purchase: Purchase) => {
    setPrintPO(purchase);
  };

  const closePrintModal = () => setPrintPO(null);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const supplierName = p.supplier?.name || '';
      const matchesSearch =
        supplierName.toLowerCase().includes(historySearch.toLowerCase()) ||
        p.po_number?.toLowerCase().includes(historySearch.toLowerCase()) ||
        p.id.toLowerCase().includes(historySearch.toLowerCase());
      const matchesStatus = historyStatus ? p.status === historyStatus : true;
      return matchesSearch && matchesStatus;
    });
  }, [purchases, historySearch, historyStatus]);

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

  const totalHistory = filteredPurchases.reduce((sum, p) => sum + Number(p.total), 0);

  return (
    <Layout>
      <div className="welcome-heading">
        <h1>Purchases Overview</h1>
        <p>Track all purchase orders, who requested, received, and edited them.</p>
      </div>

      {/* Filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search by supplier, PO number, or date..."
          value={historySearch}
          onChange={(e) => setHistorySearch(e.target.value)}
          className="input"
        />
        <select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)} className="input">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
        </select>
        <button className="btn btn-outline" onClick={fetchHistory}>
          <i className="fas fa-refresh"></i> Refresh
        </button>
      </div>

      <p className="mt-2">
        Total: KES {totalHistory.toFixed(2)} | Suppliers: {groupedBySupplier.length} | POs: {filteredPurchases.length}
      </p>

      {loadingHistory ? (
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
                            <button className="btn btn-sm btn-outline" onClick={() => openPrintModal(order)}>
                              <i className="fas fa-print"></i> Print
                            </button>
                            {order.status === 'pending' && (
                              <button className="btn btn-sm btn-success" onClick={() => receivePurchase(order.id)}>
                                <i className="fas fa-check"></i> Receive
                              </button>
                            )}
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

      {/* Print PO Modal */}
      {printPO && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-print"></i> Purchase Order</h3>
              <button className="modal-close" onClick={closePrintModal}><i className="fas fa-times"></i></button>
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
                <thead>
                  <tr><th>Product</th><th>Qty</th><th>Unit</th><th>Buy Price</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {printPO.purchase_items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.product.unit}</td>
                      <td>KES {item.cost_price}</td>
                      <td>KES {item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p><strong>TOTAL: KES {printPO.total}</strong></p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closePrintModal}>Close</button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                <i className="fas fa-print"></i> Print
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
