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
  track_batch_expiry: boolean;
  total_stock?: number;
}

interface Cashier {
  id: string;
  full_name: string;
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
  po_number: string;
  supplier: { id: string; name: string } | null;
  requested_by_user?: { full_name: string } | null;
  received_by_user?: { full_name: string } | null;
  edited_by_user?: { full_name: string } | null;
  purchase_items?: any[];
}

export default function CashierPurchases() {
  const { user } = useAuth();
  const router = useRouter();

  // Create/Edit PO states
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [overallDiscount, setOverallDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'kes' | 'pct'>('kes');
  const [creating, setCreating] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);

  // Cashiers
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [requestedBy, setRequestedBy] = useState('');

  // Add product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalQty, setModalQty] = useState(1);
  const [modalBuyPrice, setModalBuyPrice] = useState(0);
  const [modalDiscount, setModalDiscount] = useState(0);

  // Supplier modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', address: '' });

  // History
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Print modal
  const [printPO, setPrintPO] = useState<Purchase | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/purchases');
      return;
    }
    fetchInitialData();
  }, [user]);

  const fetchInitialData = async () => {
    await Promise.all([fetchSuppliers(), fetchHistory(), fetchCashiers()]);
  };

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/suppliers');
      setSuppliers(res.data);
    } catch (error) {
      toast.error('Failed to fetch suppliers');
    }
  };

  const fetchCashiers = async () => {
    try {
      const res = await api.get('/cashiers/active');
      setCashiers(res.data || []);
    } catch (error) {}
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
        const [productsRes, inventoryRes] = await Promise.all([
          api.get('/products', { params: { search: term, limit: 10 } }),
          api.get('/inventory'),
        ]);
        const products = productsRes.data.data || [];
        const inventory = inventoryRes.data || [];
        const stockMap: Record<string, number> = {};
        inventory.forEach((item: any) => {
          stockMap[item.id] = item.total_stock || 0;
        });
        const merged = products.map((p: Product) => ({
          ...p,
          total_stock: stockMap[p.id] || 0,
        }));
        setSearchResults(merged);
      } catch (error) {
        toast.error('Failed to search products');
      }
    } else {
      setSearchResults([]);
    }
  };

  const openAddProductModal = (product: Product) => {
    setModalProduct(product);
    setModalQty(1);
    setModalBuyPrice(product.cost_price);
    setModalDiscount(0);
    setShowProductModal(true);
    setSearchResults([]);
    setProductSearch('');
  };

  const confirmAddProduct = () => {
    if (!modalProduct) return;
    if (modalQty <= 0) {
      toast.error('Quantity must be positive');
      return;
    }
    setPurchaseItems([
      ...purchaseItems,
      {
        product: modalProduct,
        quantity: modalQty,
        cost_price: modalBuyPrice,
      },
    ]);
    setShowProductModal(false);
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

  const subtotal = purchaseItems.reduce((sum, item) => sum + item.quantity * item.cost_price, 0);
  const computedDiscount =
    discountType === 'pct' ? subtotal * (overallDiscount / 100) : overallDiscount;
  const totalBuy = subtotal - computedDiscount;
  const expectedRevenue = purchaseItems.reduce(
    (sum, item) => sum + item.quantity * item.product.selling_price,
    0
  );
  const expectedProfit = expectedRevenue - totalBuy;

  const resetForm = () => {
    setPurchaseItems([]);
    setSelectedSupplier('');
    setOverallDiscount(0);
    setRequestedBy('');
    setEditingPurchaseId(null);
  };

  const submitPurchaseOrder = async () => {
    if (!selectedSupplier) {
      toast.error('Please select a supplier');
      return;
    }
    if (purchaseItems.length === 0) {
      toast.error('Add at least one product');
      return;
    }
    if (!requestedBy) {
      toast.error('Select who is requesting this purchase');
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

      if (editingPurchaseId) {
        await api.put(`/purchases/${editingPurchaseId}/edit`, {
          supplier_id: selectedSupplier,
          items,
          edited_by: requestedBy,
          total: totalBuy,
        });
        toast.success('Purchase order updated');
      } else {
        const res = await api.post('/purchases', {
          supplier_id: selectedSupplier,
          items,
          status: 'pending',
          requested_by: requestedBy,
          total: totalBuy,
        });
        toast.success(`PO ${res.data.po_number} created!`);
      }
      resetForm();
      fetchHistory();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to submit purchase order');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (purchase: Purchase) => {
    setEditingPurchaseId(purchase.id);
    setSelectedSupplier(purchase.supplier_id);
    setPurchaseItems(
      (purchase.purchase_items || []).map((item: any) => ({
        product: item.product,
        quantity: item.quantity,
        cost_price: item.cost_price,
      }))
    );
    const cashierName = purchase.requested_by_user?.full_name || '';
    const cashier = cashiers.find((c) => c.full_name === cashierName);
    setRequestedBy(cashier?.id || '');
    setOverallDiscount(0);
    setDiscountType('kes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const openPrintModal = (purchase: Purchase) => setPrintPO(purchase);
  const closePrintModal = () => setPrintPO(null);

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
      {/* Create/Edit Purchase Order */}
      <div className="card">
        <h2 className="card-title">
          <i className="fas fa-cart-plus"></i> {editingPurchaseId ? 'Edit Purchase Order' : 'Create Purchase Order'}
        </h2>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label>Supplier *</label>
            <select value={selectedSupplier} onChange={(e) => { setSelectedSupplier(e.target.value); setSearchResults([]); setProductSearch(''); }} className="input">
              <option value="">Select Supplier...</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn btn-outline btn-sm" onClick={openSupplierModal}>
              <i className="fas fa-plus"></i> New Supplier
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label>Requested By *</label>
          <select value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className="input">
            <option value="">Select cashier...</option>
            {cashiers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
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
                <div key={product.id} className="pos-search-item" onClick={() => openAddProductModal(product)}>
                  <div className="pos-product-info">
                    <span className="pos-product-name">{product.name}</span>
                    <span className="pos-product-stock">
                      Buy: KES {product.cost_price}/{product.unit} | Sell: KES {product.selling_price}/{product.unit} | Stock: {product.total_stock ?? 0} {product.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {purchaseItems.length > 0 ? (
          <table className="table mt-4">
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Unit</th><th>Buy Price</th><th>Sell Price</th><th>Discount</th><th>Total</th><th></th></tr>
            </thead>
            <tbody>
              {purchaseItems.map((item) => (
                <tr key={item.product.id}>
                  <td>{item.product.name}</td>
                  <td><input type="number" min="0.1" step="0.1" value={item.quantity} onChange={(e) => updateItem(item.product.id, 'quantity', parseFloat(e.target.value) || 0)} className="input" style={{ width: '70px' }} /></td>
                  <td>{item.product.unit}</td>
                  <td>KES {item.cost_price}</td>
                  <td>KES {item.product.selling_price}</td>
                  <td>0</td>
                  <td>KES {(item.quantity * item.cost_price).toFixed(2)}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => removeItem(item.product.id)}><i className="fas fa-times"></i></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="alert alert-info mt-4">No items added yet.</p>
        )}

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label>Discount Type</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="input">
              <option value="kes">KES</option>
              <option value="pct">%</option>
            </select>
          </div>
          <div>
            <label>Overall Discount</label>
            <input type="number" min="0" step="0.01" value={overallDiscount} onChange={(e) => setOverallDiscount(parseFloat(e.target.value) || 0)} className="input" />
          </div>
        </div>

        <div className="pos-totals mt-4">
          <p>Subtotal (before discounts): KES {subtotal.toFixed(2)}</p>
          <p>Overall Discount: -KES {computedDiscount.toFixed(2)}</p>
          <p className="pos-grand-total">TOTAL (Buy): KES {totalBuy.toFixed(2)}</p>
          <p>Expected Revenue: KES {expectedRevenue.toFixed(2)}</p>
          <p>Expected Profit: KES {expectedProfit.toFixed(2)}</p>
        </div>

        <button className="btn btn-primary mt-4" onClick={submitPurchaseOrder} disabled={creating}>
          {creating ? 'Submitting...' : editingPurchaseId ? 'Update Purchase Order' : 'Submit Purchase Order'}
        </button>
        {editingPurchaseId && (
          <button className="btn btn-outline mt-2" onClick={resetForm}>Cancel Edit</button>
        )}
      </div>

      {/* History */}
      <div className="dashboard-section">
        <h2>Purchase Orders History</h2>
        <div className="filters">
          <input type="text" placeholder="Search by supplier, PO number, or date..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="input" />
          <select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)} className="input">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
          </select>
        </div>

        <p className="mt-2">Total: KES {totalHistory.toFixed(2)} | Suppliers: {groupedBySupplier.length} | POs: {filteredPurchases.length}</p>

        {loadingHistory ? <p>Loading...</p> : (
          <div className="mt-4">
            {groupedBySupplier.map((group) => {
              const pendingCount = group.orders.filter((o) => o.status === 'pending').length;
              const receivedCount = group.orders.filter((o) => o.status === 'received').length;
              return (
                <div key={group.supplier.id} className="card mb-2">
                  <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedSupplier(expandedSupplier === group.supplier.id ? null : group.supplier.id)}>
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
                        <tr><th>PO Number</th><th>Requested By</th><th>Received By</th><th>Edited By</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th></tr>
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
                                <>
                                  <button className="btn btn-sm btn-primary" onClick={() => startEdit(order)}>
                                    <i className="fas fa-edit"></i> Edit
                                  </button>
                                  <button className="btn btn-sm btn-success" onClick={() => receivePurchase(order.id)}>
                                    <i className="fas fa-check"></i> Receive
                                  </button>
                                </>
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
          </div>
        )}
      </div>

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
                  {printPO.purchase_items?.map((item: any) => (
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
              <button className="btn btn-outline" onClick={closePrintModal}>Close</button>
              <button className="btn btn-primary" onClick={() => window.print()}><i className="fas fa-print"></i> Print</button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-truck"></i> New Supplier</h3>
              <button className="modal-close" onClick={closeSupplierModal}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label>Supplier Name *</label><input type="text" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} className="input" /></div>
              <div className="form-group"><label>Phone</label><input type="text" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} className="input" /></div>
              <div className="form-group"><label>Address</label><input type="text" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} className="input" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeSupplierModal}>Cancel</button>
              <button className="btn btn-primary" onClick={submitSupplier}>Save Supplier</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showProductModal && modalProduct && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-cart-plus"></i> Add to Purchase Order</h3>
              <button className="modal-close" onClick={() => setShowProductModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p><strong>{modalProduct.name}</strong></p>
              <p>Current Stock: {modalProduct.total_stock ?? 0} {modalProduct.unit}</p>
              <div className="form-group">
                <label>Buy Price (per {modalProduct.unit})</label>
                <input type="number" min="0" step="0.01" value={modalBuyPrice} onChange={(e) => setModalBuyPrice(parseFloat(e.target.value) || 0)} className="input" />
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" min="1" value={modalQty} onChange={(e) => setModalQty(parseInt(e.target.value) || 1)} className="input" />
              </div>
              <p className="pos-grand-total">Total: KES {(modalQty * modalBuyPrice).toFixed(2)}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowProductModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmAddProduct}>Add to Order</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
