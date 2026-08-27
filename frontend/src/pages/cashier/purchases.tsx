import { useState, useEffect, useMemo, useCallback } from 'react';
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

  // Print
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
    setRequestedBy(purchase.requested_by_user?.full_name ? cashiers.find(c => c.full_name === purchase.requested_by_user?.full_name)?.id || '' : '');
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

        {/* Form fields same as before, with conditional submit text */}
        {/* ... (keep all form JSX from previous cashier purchases) ... */}

        <button className="btn btn-primary mt-4" onClick={submitPurchaseOrder} disabled={creating}>
          {creating ? 'Submitting...' : editingPurchaseId ? 'Update Purchase Order' : 'Submit Purchase Order'}
        </button>
        {editingPurchaseId && (
          <button className="btn btn-outline mt-2" onClick={resetForm}>Cancel Edit</button>
        )}
      </div>

      {/* History and modals same as admin purchases */}
      {/* ... */}
    </Layout>
  );
}
