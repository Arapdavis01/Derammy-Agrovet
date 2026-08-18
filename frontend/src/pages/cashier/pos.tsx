import { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  track_batch_expiry: boolean;
  sales_unit?: string | null;
  conversion_factor?: number | null;
  stock_batches?: { quantity_remaining: number }[];
}

interface CartItem {
  product: Product;
  quantity: number;
  batchId?: string;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  credit_limit?: number;
  credit_balance?: number;
}

interface HeldCart {
  id: number;
  timestamp: Date;
  cart: CartItem[];
  customer: Customer | null;
  discount: number;
}

interface ReturnItemInput {
  sale_item_id: string;
  quantity: number;
  reason: string;
  condition: string;
}

export default function POS() {
  const { user } = useAuth();
  const router = useRouter();

  // Product list
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null);
  const [quickQty, setQuickQty] = useState(1);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);

  // Customer
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    address: '',
    credit_limit: 5000,
  });

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'credit'>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [reference, setReference] = useState('');

  // UI states
  const [loading, setLoading] = useState(false);
  const [saleComplete, setSaleComplete] = useState<any>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSale, setPendingSale] = useState<any>(null);
  const [receiptData, setReceiptData] = useState<any>(null);

  // Held carts
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [showHeldCarts, setShowHeldCarts] = useState(false);

  // Return / Exchange
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnInvoice, setReturnInvoice] = useState('');
  const [returnSale, setReturnSale] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemInput[]>([]);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'mpesa' | 'credit_note'>('cash');

  const fetchAllProducts = useCallback(async () => {
    try {
      const [productsRes, inventoryRes] = await Promise.all([
        api.get('/products', { params: { limit: 200 } }),
        api.get('/inventory'),
      ]);
      const products = productsRes.data.data || [];
      setAllProducts(products);
      setFilteredProducts(products);

      const inventoryData = inventoryRes.data || [];
      const map: Record<string, number> = {};
      inventoryData.forEach((item: any) => {
        map[item.id] = item.total_stock || 0;
      });
      setStockMap(map);
    } catch (error) {
      toast.error('Failed to load products');
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/dashboard');
      return;
    }
    fetchAllProducts();
  }, [user, fetchAllProducts]);

  // Realtime refresh every 10 seconds and when tab becomes visible
  useRealtimeRefresh(fetchAllProducts, 10000);

  // Filter products based on search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredProducts(allProducts);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.sku && p.sku.toLowerCase().includes(term))
      );
      setFilteredProducts(filtered);
    }
  }, [searchTerm, allProducts]);

  const getProductStock = (product: Product): number => {
    return stockMap[product.id] ?? 0;
  };

  const isOutOfStock = (product: Product): boolean => {
    return getProductStock(product) <= 0;
  };

  // Quick Add modal
  const openQuickAdd = (product: Product) => {
    if (isOutOfStock(product)) {
      toast.error('Out of stock!');
      return;
    }
    setQuickAddProduct(product);
    setQuickQty(1);
  };

  const closeQuickAdd = () => {
    setQuickAddProduct(null);
  };

  const addToCartFromQuickAdd = () => {
    if (!quickAddProduct) return;
    const maxQty = getProductStock(quickAddProduct);
    const qty = Math.min(Math.max(1, quickQty), maxQty);
    if (qty <= 0) {
      toast.error('Invalid quantity');
      return;
    }

    const existing = cart.find((item) => item.product.id === quickAddProduct.id);
    if (existing) {
      const newTotal = existing.quantity + qty;
      if (newTotal > maxQty) {
        toast.error(`Only ${maxQty} available`);
        return;
      }
      setCart(
        cart.map((item) =>
          item.product.id === quickAddProduct.id
            ? { ...item, quantity: newTotal }
            : item
        )
      );
    } else {
      setCart([...cart, { product: quickAddProduct, quantity: qty }]);
    }
    closeQuickAdd();
  };

  const updateCartQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(
      cart.map((item) =>
        item.product.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  // Customer search & selection
  const handleCustomerSearch = async (term: string) => {
    setCustomerSearch(term);
    if (term.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    try {
      const res = await api.get('/customers', { params: { search: term, limit: 10 } });
      setCustomerResults(res.data.data || []);
    } catch (error) {
      toast.error('Failed to search customers');
    }
  };

  const selectCustomer = (cust: Customer) => {
    setCustomer(cust);
    setCustomerSearch(cust.name);
    setCustomerResults([]);
  };

  const clearCustomer = () => {
    setCustomer(null);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  // Register new customer
  const openCustomerForm = () => {
    setCustomerForm({
      name: customerSearch || '',
      phone: '',
      address: '',
      credit_limit: 5000,
    });
    setShowCustomerForm(true);
  };

  const submitCustomerForm = async () => {
    if (!customerForm.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    try {
      const res = await api.post('/customers', {
        name: customerForm.name,
        phone: customerForm.phone,
        address: customerForm.address,
        credit_limit: customerForm.credit_limit,
      });
      toast.success('Customer registered successfully');
      setShowCustomerForm(false);
      selectCustomer(res.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to register customer');
    }
  };

  // Totals – VAT inclusive selling price
  const totalInclVAT = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.product.selling_price, 0),
    [cart]
  );
  const subtotal = totalInclVAT / 1.16;
  const vat = totalInclVAT - subtotal;
  const total = totalInclVAT - discount;

  const calculateChange = () => {
    const cash = parseFloat(amountReceived) || 0;
    return cash - total;
  };

  // Hold carts
  const holdCurrentCart = () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    const newHeldCart: HeldCart = {
      id: Date.now(),
      timestamp: new Date(),
      cart: [...cart],
      customer,
      discount,
    };
    setHeldCarts((prev) => [...prev, newHeldCart]);
    clearCart();
    toast.success('Cart held successfully');
  };

  const resumeHeldCart = (heldCartId: number) => {
    const heldCart = heldCarts.find((hc) => hc.id === heldCartId);
    if (!heldCart) return;

    if (cart.length > 0) {
      toast.error('Current cart is not empty. Hold it first.');
      return;
    }
    setCart(heldCart.cart);
    setCustomer(heldCart.customer);
    setDiscount(heldCart.discount);
    setHeldCarts(heldCarts.filter((hc) => hc.id !== heldCartId));
    setShowHeldCarts(false);
    toast.success(`Cart #${heldCartId} resumed`);
  };

  const deleteHeldCart = (heldCartId: number) => {
    setHeldCarts(heldCarts.filter((hc) => hc.id !== heldCartId));
  };

  // Complete sale – shows confirmation modal
  const handleCompleteSale = () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    if (paymentMethod === 'credit' && !customer) {
      toast.error('Please select a customer for credit sale');
      return;
    }
    if (paymentMethod === 'cash' && parseFloat(amountReceived || '0') < total) {
      toast.error('Insufficient cash received');
      return;
    }

    const salePayload = {
      items: cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
      })),
      payment_method: paymentMethod,
      discount,
      tax: vat,
      sale_status: 'completed',
      amount_received: paymentMethod === 'cash' ? parseFloat(amountReceived) : undefined,
      reference: paymentMethod === 'mpesa' ? reference : undefined,
      customer_id: customer?.id,
    };

    const saleSummary = {
      total,
      customerName: customer?.name || 'Walk-in Customer',
      paymentMethod: paymentMethod.toUpperCase(),
      tendered: paymentMethod === 'cash' ? parseFloat(amountReceived) : total,
      change: paymentMethod === 'cash' ? calculateChange() : 0,
      itemsPreview: cart.map(
        (item) => `${item.product.name} ×${item.quantity} @ KES ${item.product.selling_price}`
      ),
    };

    setPendingSale({ payload: salePayload, summary: saleSummary });
    setShowConfirmModal(true);
  };

  // Confirm sale and process
  const confirmSale = async () => {
    if (!pendingSale) return;
    setLoading(true);
    try {
      const res = await api.post('/sales', pendingSale.payload);
      setReceiptData(res.data);
      setSaleComplete(res.data);
      clearCart();
      setPaymentMethod('cash');
      setAmountReceived('');
      setReference('');
      setDiscount(0);
      fetchAllProducts();
      toast.success('Sale completed successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to complete sale');
    } finally {
      setLoading(false);
      setShowConfirmModal(false);
    }
  };

  const printReceipt = () => {
    window.print();
  };

  // Return / Exchange
  const searchReturnSale = async () => {
    if (!returnInvoice.trim()) {
      toast.error('Enter receipt number');
      return;
    }
    try {
      const res = await api.get('/sales', { params: { limit: 200 } });
      const found = res.data.data.find((s: any) => s.invoice_no === returnInvoice.trim());
      if (!found) {
        toast.error('Receipt not found');
        return;
      }
      const detailRes = await api.get(`/sales/${found.id}`);
      setReturnSale(detailRes.data);
      setReturnItems([]);
    } catch (error) {
      toast.error('Failed to search receipt');
    }
  };

  const handleReturnItemChange = (saleItemId: string, field: string, value: any) => {
    setReturnItems((prev) => {
      const existing = prev.find((item) => item.sale_item_id === saleItemId);
      if (existing) {
        return prev.map((item) =>
          item.sale_item_id === saleItemId ? { ...item, [field]: value } : item
        );
      }
      return [
        ...prev,
        { sale_item_id: saleItemId, quantity: 0, reason: '', condition: 'resellable', [field]: value },
      ];
    });
  };

  const submitReturn = async () => {
    if (!returnSale) return;
    const validItems = returnItems.filter((item) => item.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Select at least one item with quantity');
      return;
    }
    try {
      await api.post('/returns', {
        sale_id: returnSale.id,
        items: validItems,
        refund_method: refundMethod,
        reason: 'Return from POS',
      });
      toast.success('Return processed successfully');
      setShowReturnModal(false);
      setReturnInvoice('');
      setReturnSale(null);
      setReturnItems([]);
      fetchAllProducts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to process return');
    }
  };

  const clearCart = () => {
    setCart([]);
    setCustomer(null);
    setCustomerSearch('');
    setCustomerResults([]);
    setPaymentMethod('cash');
    setAmountReceived('');
    setReference('');
    setDiscount(0);
  };

  return (
    <Layout>
      <div className="pos-container">
        {/* Left: Products */}
        <div className="pos-left">
          <h2>
            <i className="fas fa-boxes-stacked" style={{ marginRight: '8px' }}></i>
            Products
          </h2>
          <div className="pos-search-wrapper">
            <i className="fas fa-search pos-search-icon"></i>
            <input
              type="text"
              placeholder="Search product by name, SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pos-search-input"
            />
          </div>

          <div className="pos-product-grid">
            {filteredProducts.map((product) => {
              const stock = getProductStock(product);
              return (
                <div
                  key={product.id}
                  className="pos-product-card"
                  onClick={() => openQuickAdd(product)}
                >
                  <div className="pos-product-name">{product.name}</div>
                  {product.sku && <div className="pos-product-sku">SKU: {product.sku}</div>}
                  <div className="pos-product-price">
                    KES {product.selling_price}/{product.unit}
                  </div>
                  <div className={`pos-product-stock ${stock <= 0 ? 'out' : stock < 5 ? 'low' : 'ok'}`}>
                    Stock: {stock} {product.unit}
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <p className="alert alert-info">No products found.</p>
            )}
          </div>
        </div>

        {/* Right: Cart & Payment */}
        <div className="pos-right">
          <h3>
            <i className="fas fa-shopping-cart" style={{ marginRight: '8px' }}></i>
            Cart
            <span className="badge">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
          </h3>

          {/* Customer */}
          <div className="pos-customer-section">
            <label>Customer Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type to search or enter new..."
                value={customerSearch}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                className="input"
              />
              <button className="btn btn-outline btn-sm" onClick={openCustomerForm}>
                <i className="fas fa-user-plus"></i> Register
              </button>
            </div>
            {customerResults.length > 0 && (
              <div className="pos-search-results">
                {customerResults.map((cust) => (
                  <div
                    key={cust.id}
                    className="pos-search-item"
                    onClick={() => selectCustomer(cust)}
                  >
                    <span>{cust.name}</span>
                    {cust.credit_balance ? (
                      <span className="pos-credit-badge">Owes: KES {cust.credit_balance}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {customer && (
              <div className="pos-selected-customer">
                <strong>{customer.name}</strong>
                <span className="pos-credit-badge">
                  Debt: KES {customer.credit_balance || 0} / Limit: KES {customer.credit_limit || 0}
                </span>
                <button className="btn btn-sm btn-outline" onClick={clearCustomer}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="pos-cart-items">
            {cart.length === 0 ? (
              <p className="text-muted">Cart is empty</p>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="pos-cart-line">
                  <div className="pos-cart-info">
                    <strong>{item.product.name}</strong>
                    <span>
                      {item.quantity} x KES {item.product.selling_price}/{item.product.unit}
                    </span>
                  </div>
                  <div className="pos-cart-controls">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateCartQuantity(item.product.id, parseFloat(e.target.value) || 1)
                      }
                      className="input pos-qty-input"
                    />
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                    >
                      +
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => removeFromCart(item.product.id)}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals */}
          <div className="pos-totals">
            <p>Subtotal (excl. VAT): <strong>KES {subtotal.toFixed(2)}</strong></p>
            <p>VAT (16%): <strong>KES {vat.toFixed(2)}</strong></p>
            <p>
              Discount:
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="input pos-total-input"
              />
            </p>
            <p className="pos-grand-total">TOTAL: <strong>KES {total.toFixed(2)}</strong></p>
          </div>

          {/* Payment Method Dropdown */}
          <div className="pos-payment-select">
            <label>Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="input"
            >
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="credit">Credit</option>
            </select>
          </div>

          {paymentMethod === 'cash' && (
            <div className="mt-2">
              <label>Amount Tendered (KES)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="input"
                placeholder="Enter amount given by customer"
              />
              {amountReceived && (
                <p>Change: <strong>KES {calculateChange().toFixed(2)}</strong></p>
              )}
            </div>
          )}

          {paymentMethod === 'mpesa' && (
            <div className="mt-2">
              <label>M-Pesa Reference (optional)</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="input"
                placeholder="e.g., Txn code"
              />
            </div>
          )}

          {paymentMethod === 'credit' && !customer && (
            <p className="alert alert-warning">Please select a credit customer.</p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            <button className="btn btn-outline btn-sm" onClick={holdCurrentCart}>
              <i className="fas fa-pause"></i> Hold Cart
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setShowHeldCarts(true)}>
              <i className="fas fa-list"></i> Held Carts ({heldCarts.length})
            </button>
          </div>

          <button
            className="btn btn-primary pos-complete-btn mt-4"
            onClick={handleCompleteSale}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Complete Sale'}
          </button>

          <div className="flex gap-2 mt-2">
            <button className="btn btn-outline btn-sm" onClick={() => setShowReturnModal(true)}>
              <i className="fas fa-rotate-left"></i> Return / Exchange
            </button>
            <button className="btn btn-danger btn-sm" onClick={clearCart}>
              <i className="fas fa-trash"></i> Clear Cart
            </button>
          </div>
        </div>
      </div>

      {/* Quick Add Modal */}
      {quickAddProduct && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-cart-plus"></i> Add to Cart</h3>
              <button className="modal-close" onClick={closeQuickAdd}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p><strong>{quickAddProduct.name}</strong></p>
              <p>Available: {getProductStock(quickAddProduct)} {quickAddProduct.unit}</p>
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={getProductStock(quickAddProduct)}
                  value={quickQty}
                  onChange={(e) => setQuickQty(parseInt(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  className="input"
                  style={{ textAlign: 'center' }}
                />
              </div>
              <p className="pos-grand-total">
                Total: KES {(quickQty * quickAddProduct.selling_price).toFixed(2)}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeQuickAdd}>Cancel</button>
              <button className="btn btn-primary" onClick={addToCartFromQuickAdd}>
                <i className="fas fa-cart-plus"></i> Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Registration Modal */}
      {showCustomerForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-user-plus"></i> Register Credit Customer</h3>
              <button className="modal-close" onClick={() => setShowCustomerForm(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  className="input"
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="text"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  className="input"
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  className="input"
                />
              </div>
              <div className="form-group">
                <label>Credit Limit (KES)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customerForm.credit_limit}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, credit_limit: parseFloat(e.target.value) || 0 })
                  }
                  className="input"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCustomerForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitCustomerForm}><i className="fas fa-save"></i> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Held Carts Modal */}
      {showHeldCarts && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-list"></i> Held Carts ({heldCarts.length})</h3>
              <button className="modal-close" onClick={() => setShowHeldCarts(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              {heldCarts.length === 0 ? (
                <p>No held carts.</p>
              ) : (
                heldCarts.map((hc) => (
                  <div key={hc.id} className="card mb-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <strong>Cart #{hc.id}</strong>
                        <span className="text-muted">
                          {new Date(hc.timestamp).toLocaleTimeString()}
                        </span>
                        {hc.customer && <span> | {hc.customer.name}</span>}
                        <p>
                          Items: {hc.cart.reduce((sum, item) => sum + item.quantity, 0)} | Total: KES{' '}
                          {hc.cart.reduce((sum, item) => sum + item.quantity * item.product.selling_price, 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-primary" onClick={() => resumeHeldCart(hc.id)}>Resume</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteHeldCart(hc.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowHeldCarts(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Return/Exchange Modal */}
      {showReturnModal && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-rotate-left"></i> Return / Exchange</h3>
              <button className="modal-close" onClick={() => setShowReturnModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Enter receipt number"
                  value={returnInvoice}
                  onChange={(e) => setReturnInvoice(e.target.value)}
                  className="input"
                />
                <button className="btn btn-outline" onClick={searchReturnSale}>Search</button>
              </div>
              {returnSale && (
                <>
                  <p><strong>Invoice:</strong> {returnSale.invoice_no}</p>
                  <p><strong>Customer:</strong> {returnSale.customer?.name || 'Walk-in'}</p>
                  <table className="table mt-4">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Original Qty</th>
                        <th>Return Qty</th>
                        <th>Reason</th>
                        <th>Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnSale.sale_items.map((item: any) => (
                        <tr key={item.id}>
                          <td>{item.product.name}</td>
                          <td>{item.quantity} {item.product.unit}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max={item.quantity}
                              step="0.1"
                              className="input"
                              style={{ width: '80px' }}
                              onChange={(e) =>
                                handleReturnItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="input"
                              placeholder="Reason"
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
                  <div className="mt-2">
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
                  <button className="btn btn-primary mt-4" onClick={submitReturn}>Submit Return</button>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowReturnModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Confirmation Modal */}
      {showConfirmModal && pendingSale && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-check-circle"></i> Complete Sale</h3>
              <button className="modal-close" onClick={() => setShowConfirmModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p><strong>Total:</strong> KES {pendingSale.summary.total.toFixed(2)}</p>
              <p><strong>Customer:</strong> {pendingSale.summary.customerName}</p>
              <p><strong>Payment:</strong> {pendingSale.summary.paymentMethod}</p>
              {pendingSale.summary.paymentMethod === 'CASH' && (
                <>
                  <p><strong>Tendered:</strong> KES {pendingSale.summary.tendered.toFixed(2)}</p>
                  <p><strong>Change:</strong> KES {pendingSale.summary.change.toFixed(2)}</p>
                </>
              )}
              <h4>Items</h4>
              <ul>
                {pendingSale.summary.itemsPreview.map((line: string, index: number) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmSale} disabled={loading}>
                <i className="fas fa-print"></i> Confirm & Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptData && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-receipt"></i> Receipt</h3>
              <button className="modal-close" onClick={() => setReceiptData(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body receipt-body">
              <div className="receipt-company">
                <h4>DERAMMY AGROVET</h4>
                <p>P.O BOX 345, Eldoret</p>
                <p>Tel: 0717***902, 0724***188</p>
                <p>Quality Farm Inputs & Veterinary Supplies</p>
              </div>
              <hr />
              <p><strong>SALES RECEIPT</strong></p>
              <p><strong>{receiptData.invoice_no}</strong></p>
              <p>Date: {new Date(receiptData.sale_date).toLocaleDateString()}</p>
              <p>Time: {new Date(receiptData.sale_date).toLocaleTimeString()}</p>
              <p>Customer: {receiptData.customer?.name || 'Walk-in Customer'}</p>
              <p>Payment: {receiptData.payment_method.toUpperCase()}</p>
              <p>Cashier: {receiptData.user?.full_name || 'Antony'}</p>
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptData.sale_items.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.product.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unit_price}</td>
                      <td>{item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>Subtotal: KES {receiptData.subtotal.toFixed(2)}</p>
              <p>VAT (16%): KES {receiptData.tax.toFixed(2)}</p>
              <p><strong>TOTAL: KES {receiptData.total.toFixed(2)}</strong></p>
              <p>Thank you for shopping at</p>
              <p><strong>DERAMMY AGROVET</strong></p>
              <p>Welcome again!</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setReceiptData(null)}>Close</button>
              <button className="btn btn-primary" onClick={printReceipt}>
                <i className="fas fa-print"></i> Print
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
