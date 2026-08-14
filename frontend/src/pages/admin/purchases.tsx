import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Purchases.module.css';

interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  cost_price: number;
  track_batch_expiry: boolean;
}

interface PurchaseItem {
  product_id: string;
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
  supplier: { id: string; name: string };
  user: { id: string; full_name: string };
}

export default function AdminPurchases() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'purchases' | 'suppliers'>('purchases');
  
  // Purchases list state
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  // Create purchase state
  const [showCreatePurchase, setShowCreatePurchase] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [creating, setCreating] = useState(false);

  // Suppliers management state
  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', address: '' });
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

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
  }, [user, activeTab]);

  const fetchInitialData = async () => {
    if (activeTab === 'purchases') {
      fetchPurchases();
    } else {
      fetchSuppliers();
    }
    // Always fetch suppliers and products for create form
    fetchSuppliersForDropdown();
    fetchAllProducts();
  };

  const fetchPurchases = async (pageNum = page) => {
    setPurchasesLoading(true);
    try {
      const res = await api.get('/purchases', { params: { page: pageNum, limit } });
      setPurchases(res.data.data);
      setTotalPurchases(res.data.total);
      setPage(res.data.page);
    } catch (error: any) {
      toast.error('Failed to fetch purchases');
    } finally {
      setPurchasesLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/suppliers');
      setSupplierList(res.data);
    } catch (error: any) {
      toast.error('Failed to fetch suppliers');
    }
  };

  const fetchSuppliersForDropdown = async () => {
    try {
      const res = await api.get('/suppliers');
      setSuppliers(res.data);
    } catch (error: any) {
      // silent
    }
  };

  const fetchAllProducts = async () => {
    try {
      const res = await api.get('/products', { params: { limit: 100 } });
      setProducts(res.data.data);
    } catch (error: any) {
      // silent
    }
  };

  const handleProductSearch = async (term: string) => {
    setProductSearch(term);
    if (term.trim().length > 0) {
      try {
        const res = await api.get('/products', { params: { search: term, limit: 10 } });
        setSearchResults(res.data.data);
      } catch (error: any) {
        // ignore
      }
    } else {
      setSearchResults([]);
    }
  };

  const addPurchaseItem = (product: Product) => {
    // Check if already in list
    const existing = purchaseItems.find((item) => item.product_id === product.id);
    if (existing) {
      toast.error('Product already added');
      return;
    }
    setPurchaseItems([
      ...purchaseItems,
      {
        product_id: product.id,
        quantity: 1,
        cost_price: product.cost_price,
      },
    ]);
    setProductSearch('');
    setSearchResults([]);
  };

  const updatePurchaseItem = (productId: string, field: string, value: any) => {
    setPurchaseItems((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, [field]: value } : item
      )
    );
  };

  const removePurchaseItem = (productId: string) => {
    setPurchaseItems(purchaseItems.filter((item) => item.product_id !== productId));
  };

  const calculateTotal = () => {
    return purchaseItems.reduce((sum, item) => sum + item.quantity * item.cost_price, 0);
  };

  const submitPurchase = async () => {
    if (!selectedSupplier) {
      toast.error('Select a supplier');
      return;
    }
    if (purchaseItems.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    setCreating(true);
    try {
      await api.post('/purchases', {
        supplier_id: selectedSupplier,
        items: purchaseItems,
        status: 'received',
      });
      toast.success('Purchase recorded successfully');
      setShowCreatePurchase(false);
      setSelectedSupplier('');
      setPurchaseItems([]);
      fetchPurchases();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create purchase');
    } finally {
      setCreating(false);
    }
  };

  // Supplier CRUD
  const openSupplierForm = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setSupplierForm({ name: supplier.name, phone: supplier.phone || '', address: supplier.address || '' });
    } else {
      setEditingSupplier(null);
      setSupplierForm({ name: '', phone: '', address: '' });
    }
    setShowSupplierForm(true);
  };

  const submitSupplierForm = async () => {
    if (!supplierForm.name.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, supplierForm);
        toast.success('Supplier updated');
      } else {
        await api.post('/suppliers', supplierForm);
        toast.success('Supplier created');
      }
      setShowSupplierForm(false);
      fetchSuppliers();
      fetchSuppliersForDropdown();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save supplier');
    }
  };

  const deleteSupplier = async (id: string) => {
    if (!confirm('Delete this supplier?')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      toast.success('Supplier deleted');
      fetchSuppliers();
      fetchSuppliersForDropdown();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete supplier');
    }
  };

  const totalPages = Math.ceil(totalPurchases / limit);

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <h1>Purchases & Suppliers</h1>
        <button className="btn btn-primary" onClick={() => setShowCreatePurchase(true)}>
          New Purchase
        </button>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'purchases' ? styles.active : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          Purchases
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'suppliers' ? styles.active : ''}`}
          onClick={() => setActiveTab('suppliers')}
        >
          Suppliers
        </button>
      </div>

      {activeTab === 'purchases' && (
        <>
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Total</th>
                <th>Status</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{new Date(purchase.purchase_date).toLocaleString()}</td>
                  <td>{purchase.supplier?.name || '-'}</td>
                  <td>KES {purchase.total.toLocaleString()}</td>
                  <td>{purchase.status}</td>
                  <td>{purchase.user?.full_name || '-'}</td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr><td colSpan={5} className="text-center">No purchases found</td></tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex justify-between mt-4">
              <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => fetchPurchases(page - 1)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => fetchPurchases(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {activeTab === 'suppliers' && (
        <>
          <div className="flex justify-end mb-4">
            <button className="btn btn-outline" onClick={() => openSupplierForm()}>Add Supplier</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {supplierList.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.phone || '-'}</td>
                  <td>{supplier.address || '-'}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => openSupplierForm(supplier)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteSupplier(supplier.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {supplierList.length === 0 && (
                <tr><td colSpan={4} className="text-center">No suppliers found</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* Create Purchase Modal */}
      {showCreatePurchase && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalLarge}>
            <h3>New Purchase</h3>
            <div className="flex flex-col gap-2">
              <label>Supplier</label>
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="input"
              >
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <label>Search Product</label>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => handleProductSearch(e.target.value)}
                className="input"
                placeholder="Type to search..."
              />
              {searchResults.length > 0 && (
                <div className={styles.searchResults}>
                  {searchResults.map((product) => (
                    <div key={product.id} className={styles.searchItem} onClick={() => addPurchaseItem(product)}>
                      <span>{product.name}</span>
                      <span>KES {product.cost_price}/{product.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Purchase items table */}
            {purchaseItems.length > 0 && (
              <table className="table mt-4">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Cost Price</th>
                    <th>Batch Number</th>
                    <th>Expiry Date</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseItems.map((item) => {
                    const product = products.find(p => p.id === item.product_id);
                    return (
                      <tr key={item.product_id}>
                        <td>{product?.name || item.product_id}</td>
                        <td>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={item.quantity}
                            onChange={(e) => updatePurchaseItem(item.product_id, 'quantity', parseFloat(e.target.value) || 0)}
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
                            onChange={(e) => updatePurchaseItem(item.product_id, 'cost_price', parseFloat(e.target.value) || 0)}
                            className="input"
                            style={{ width: '100px' }}
                          />
                        </td>
                        <td>
                          {product?.track_batch_expiry ? (
                            <input
                              type="text"
                              value={item.batch_number || ''}
                              onChange={(e) => updatePurchaseItem(item.product_id, 'batch_number', e.target.value)}
                              className="input"
                              style={{ width: '120px' }}
                            />
                          ) : '-'}
                        </td>
                        <td>
                          {product?.track_batch_expiry ? (
                            <input
                              type="date"
                              value={item.expiry_date || ''}
                              onChange={(e) => updatePurchaseItem(item.product_id, 'expiry_date', e.target.value)}
                              className="input"
                              style={{ width: '140px' }}
                            />
                          ) : '-'}
                        </td>
                        <td>KES {(item.quantity * item.cost_price).toFixed(2)}</td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => removePurchaseItem(item.product_id)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className="mt-4">
              <p><strong>Total: KES {calculateTotal().toFixed(2)}</strong></p>
            </div>

            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={submitPurchase} disabled={creating}>
                {creating ? 'Processing...' : 'Submit Purchase'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowCreatePurchase(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Form Modal */}
      {showSupplierForm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
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
              <button className="btn btn-primary" onClick={submitSupplierForm}>Save</button>
              <button className="btn btn-outline" onClick={() => setShowSupplierForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
