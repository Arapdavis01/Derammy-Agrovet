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
  unit: string;
  cost_price: number;
  selling_price: number;
  track_batch_expiry: boolean;
}

interface PurchaseItem {
  product: Product;
  quantity: number;
  cost_price: number;
  batch_number?: string;
  expiry_date?: string;
}

interface Purchase {
  id: string;
  supplier_id: string;
  purchase_date: string;
  total: number;
  status: string;
  supplier: { id: string; name: string } | null;
}

export default function AdminPurchases() {
  const { user } = useAuth();
  const router = useRouter();

  // Create PO states
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [overallDiscount, setOverallDiscount] = useState(0);
  const [creating, setCreating] = useState(false);

  // Supplier modal states
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', address: '' });

  // History states
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchInitialData();
  }, [user]);

  const fetchInitialData = async () => {
    await Promise.all([fetchSuppliers(), fetchHistory()]);
  };

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/suppliers');
      setSuppliers(res.data);
    } catch (error) {
      toast.error('Failed to fetch suppliers');
    }
  };

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

  const handleProductSearch = async (term: string) => {
    setProductSearch(term);
    if (term.trim().length > 0 && selectedSupplier) {
      try {
        const res = await api.get('/products', { params: { search: term, limit: 10 } });
        setSearchResults(res.data.data);
      } catch (error) {
        toast.error('Failed to search products');
      }
    } else {
      setSearchResults([]);
    }
  };

  const addPurchaseItem = (product: Product) => {
    if (purchaseItems.some((item) => item.product.id === product.id)) {
      toast.error('Product already added');
      return;
    }
    setPurchaseItems([
      ...purchaseItems,
      { product, quantity: 1, cost_price: product.cost_price },
    ]);
    setProductSearch('');
    setSearchResults([]);
  };

  const updateItem = (productId: string, field: string, value: any) => {
    setPurchaseItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (productId: string) => {
    setPurchaseItems(purchaseItems.filter((item) => item.product.id !== productId));
  };

  // Calculations
  const subtotal = purchaseItems.reduce((sum, item) => sum + item.quantity * item.cost_price, 0);
  const totalBuy = subtotal - overallDiscount;
  const expectedRevenue = purchaseItems.reduce(
    (sum, item) => sum + item.quantity * item.product.selling_price,
    0
  );
  const expectedProfit = expectedRevenue - totalBuy;

  const submitPurchaseOrder = async () => {
    if (!selectedSupplier) {
      toast.error('Please select a supplier');
      return;
    }
    if (purchaseItems.length === 0) {
      toast.error('Add at least one product');
      return;
    }
    setCreating(true);
    try {
      const items = purchaseItems.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        cost_price: item.cost_price,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
      }));

      await api.post('/purchases', {
        supplier_id: selectedSupplier,
        items,
        status: 'received',
      });

      toast.success('Purchase order submitted');
      // Reset form
      setPurchaseItems([]);
      setSelectedSupplier('');
      setNotes('');
      setOverallDiscount(0);
      fetchHistory();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to submit purchase order');
    } finally {
      setCreating(false);
    }
  };

  // Supplier modal handlers
  const openSupplierModal = () => setShowSupplierModal(true);
  const closeSupplierModal = () => setShowSupplierModal(false);

  const submitSupplier = async () => {
    if (!supplierForm.name.trim()) {
      toast.error('Supplier name required');
      return;
    }
    try {
      await api.post('/suppliers', supplierForm);
      toast.success('Supplier created');
      setSupplierForm({ name: '', phone: '', address: '' });
      closeSupplierModal();
      fetchSuppliers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create supplier');
    }
  };

  // Grouping logic
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const supplierName = p.supplier?.name || '';
      const matchesSearch =
        supplierName.toLowerCase().includes(historySearch.toLowerCase()) ||
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
      {/* Create Purchase Order Section */}
      <div className="card">
        <h2 className="card-title"><i className="fas fa-cart-plus" style={{ marginRight: '8px' }}></i>Create Purchase Order</h2>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label>Supplier *</label>
            <select
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
                setSearchResults([]);
                setProductSearch('');
              }}
              className="input"
            >
              <option value="">Select Supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
              placeholder="Order notes..."
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <button className="btn btn-outline btn-sm" onClick={openSupplierModal}>
            <i className="fas fa-plus" style={{ marginRight: '4px' }}></i> New Supplier
          </button>
        </div>

        <div className="mt-4">
          <label>Select Products</label>
          <input
            type="text"
            value={productSearch}
            onChange={(e) => handleProductSearch(e.target.value)}
            className="input"
            placeholder={selectedSupplier ? 'Search Products' : 'Select supplier first, then search products...'}
            disabled={!selectedSupplier}
          />
          {searchResults.length > 0 && (
            <div className="pos-search-results">
              {searchResults.map((product) => (
                <div key={product.id} className="pos-search-item" onClick={() => addPurchaseItem(product)}>
                  <div className="pos-product-info">
                    <span className="pos-product-name">{product.name}</span>
                    <span className="pos-product-stock">
                      Buy: KES {product.cost_price}/{product.unit} | Sell: KES {product.selling_price}/{product.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Items table */}
        {purchaseItems.length > 0 ? (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Buy Price</th>
                <th>Batch Number</th>
                <th>Expiry Date</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {purchaseItems.map((item) => (
                <tr key={item.product.id}>
                  <td>{item.product.name}</td>
                  <td>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.product.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="input"
                      style={{ width: '80px' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.cost_price}
                      onChange={(e) => updateItem(item.product.id, 'cost_price', parseFloat(e.target.value) || 0)}
                      className="input"
                      style={{ width: '100px' }}
                    />
                  </td>
                  <td>
                    {item.product.track_batch_expiry ? (
                      <input
                        type="text"
                        value={item.batch_number || ''}
                        onChange={(e) => updateItem(item.product.id, 'batch_number', e.target.value)}
                        className="input"
                        style={{ width: '120px' }}
                      />
                    ) : '-'}
                  </td>
                  <td>
                    {item.product.track_batch_expiry ? (
                      <input
                        type="date"
                        value={item.expiry_date || ''}
                        onChange={(e) => updateItem(item.product.id, 'expiry_date', e.target.value)}
                        className="input"
                        style={{ width: '140px' }}
                      />
                    ) : '-'}
                  </td>
                  <td>KES {(item.quantity * item.cost_price).toFixed(2)}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => removeItem(item.product.id)}>
                      <i className="fas fa-times"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="alert alert-info mt-4">No items added yet.</p>
        )}

        {/* Totals */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label>Overall Discount (KES)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={overallDiscount}
              onChange={(e) => setOverallDiscount(parseFloat(e.target.value) || 0)}
              className="input"
            />
          </div>
        </div>

        <div className="pos-totals mt-4">
          <p>Subtotal (before discounts): KES {subtotal.toFixed(2)}</p>
          <p>Overall Discount: -KES {overallDiscount.toFixed(2)}</p>
          <p className="pos-grand-total">TOTAL (Buy): KES {totalBuy.toFixed(2)}</p>
          <p>Expected Revenue: KES {expectedRevenue.toFixed(2)}</p>
          <p>Expected Profit: KES {expectedProfit.toFixed(2)}</p>
        </div>

        <button className="btn btn-primary mt-4" onClick={submitPurchaseOrder} disabled={creating}>
          {creating ? (
            <>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Submitting...
            </>
          ) : (
            <>
              <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i> Submit Purchase Order
            </>
          )}
        </button>
      </div>

      {/* Purchase Orders History */}
      <div className="dashboard-section">
        <h2><i className="fas fa-history" style={{ marginRight: '8px' }}></i>Purchase Orders History</h2>

        <div className="filters">
          <input
            type="text"
            placeholder="Search by supplier, PO number, or date..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="input"
          />
          <select
            value={historyStatus}
            onChange={(e) => setHistoryStatus(e.target.value)}
            className="input"
          >
            <option value="">All Status</option>
            <option value="received">Received</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="btn btn-outline" onClick={fetchHistory}>
            <i className="fas fa-refresh" style={{ marginRight: '4px' }}></i> Refresh
          </button>
        </div>

        <p className="mt-2">
          Total: KES {totalHistory.toFixed(2)} | Suppliers: {groupedBySupplier.length} | POs: {filteredPurchases.length}
        </p>

        {loadingHistory ? (
          <p>Loading history...</p>
        ) : (
          <div className="mt-4">
            {groupedBySupplier.map((group) => (
              <div key={group.supplier.id} className="card mb-2">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => setExpandedSupplier(expandedSupplier === group.supplier.id ? null : group.supplier.id)}
                >
                  <div>
                    <strong>{group.supplier.name}</strong>
                    <p className="text-muted">
                      {group.orders.length} orders | {group.orders.reduce((sum, o) => sum + 1, 0)} items | Last: {group.orders[0] ? new Date(group.orders[0].purchase_date).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>KES {group.orders.reduce((sum, o) => sum + Number(o.total), 0).toFixed(2)}</span>
                    <i className={`fas fa-chevron-${expandedSupplier === group.supplier.id ? 'up' : 'down'}`}></i>
                  </div>
                </div>
                {expandedSupplier === group.supplier.id && (
                  <div className="mt-2">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>PO ID</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map((order) => (
                          <tr key={order.id}>
                            <td>{order.id.slice(0, 8)}</td>
                            <td>{new Date(order.purchase_date).toLocaleDateString()}</td>
                            <td>KES {order.total}</td>
                            <td>
                              <span className={`status ${order.status}`}>{order.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {groupedBySupplier.length === 0 && (
              <p className="alert alert-info">No purchase orders found.</p>
            )}
          </div>
        )}
      </div>

      {/* New Supplier Modal */}
      {showSupplierModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>New Supplier</h3>
            <div className="flex flex-col gap-2">
              <label>Name</label>
              <input
                type="text"
                value={supplierForm.name}
                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                className="input"
              />
              <label>Phone</label>
              <input
                type="text"
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                className="input"
              />
              <label>Address</label>
              <input
                type="text"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                className="input"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={submitSupplier}>Save</button>
              <button className="btn btn-outline" onClick={closeSupplierModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
