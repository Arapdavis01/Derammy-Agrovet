import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  getStockDisplay,
  getPriceDisplay,
  hasDualUnit,
  convertToBaseUnits,
  getPriceForUnit,
  getAvailableStockForUnit,
} from '@/utils/productDisplay';

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

interface Cashier {
  id: string;
  full_name: string;
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
  const [quickUnit, setQuickUnit] = useState<'base' | 'sales'>('base');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const initialLoadDone = useRef(false);

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

  // Cashier selection
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [selectedCashierId, setSelectedCashierId] = useState('');
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [cashierModalType, setCashierModalType] = useState<'sale' | 'return'>('sale');

  // Held carts
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [showHeldCarts, setShowHeldCarts] = useState(false);

  // Return / Exchange
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnInvoice, setReturnInvoice] = useState('');
  const [returnSale, setReturnSale] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemInput[]>([]);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'mpesa' | 'credit_note'>('cash');
  const [returnType, setReturnType] = useState<'return' | 'exchange'>('return');
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeResults, setExchangeResults] = useState<Product[]>([]);
  const [exchangeProduct, setExchangeProduct] = useState<Product | null>(null);
  const [exchangeQty, setExchangeQty] = useState(1);
  const [searchingReturn, setSearchingReturn] = useState(false);
  const [returnReceipt, setReturnReceipt] = useState<ReturnReceipt | null>(null);
  const [pendingReturnData, setPendingReturnData] = useState<any>(null);

  const fetchAllProducts = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshingProducts(true);
    } else {
      setLoadingProducts(true);
    }
    
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
      if (!isRefresh) {
        toast.error('Failed to load products');
      }
    } finally {
      if (isRefresh) {
        setRefreshingProducts(false);
      } else {
        setLoadingProducts(false);
        initialLoadDone.current = true;
      }
    }
  }, []);

  const fetchCashiers = useCallback(async () => {
    try {
      const res = await api.get('/cashiers/active');
      setCashiers(res.data || []);
    } catch (error) {
      // Silently fail for cashiers
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/dashboard');
      return;
    }
    fetchAllProducts(false);
    fetchCashiers();
  }, [user, fetchAllProducts, fetchCashiers]);

  useRealtimeRefresh(() => {
    if (initialLoadDone.current) {
      fetchAllProducts(true);
    }
  }, 10000);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredProducts(allProducts);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredProducts(
        allProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            (p.sku && p.sku.toLowerCase().includes(term))
        )
      );
    }
  }, [searchTerm, allProducts]);

  const getProductStock = (product: Product): number => stockMap[product.id] ?? 0;
  const isOutOfStock = (product: Product): boolean => getProductStock(product) <= 0;

  const openQuickAdd = (product: Product) => {
    if (isOutOfStock(product)) {
      toast.error('Out of stock!');
      return;
    }
    setQuickAddProduct(product);
    setQuickQty(1);
    setQuickUnit('base');
  };

  const closeQuickAdd = () => setQuickAddProduct(null);

  const addToCartFromQuickAdd = () => {
    if (!quickAddProduct) return;
    const baseQty = convertToBaseUnits(quickQty, quickUnit, quickAddProduct.conversion_factor);
    const maxBaseStock = getProductStock(quickAddProduct);

    if (baseQty <= 0 || baseQty > maxBaseStock) {
      toast.error('Invalid quantity');
      return;
    }

    const existing = cart.find((item) => item.product.id === quickAddProduct.id);
    if (existing) {
      const newTotal = existing.quantity + baseQty;
      if (newTotal > maxBaseStock) {
        toast.error(`Only ${maxBaseStock} ${quickAddProduct.unit} available`);
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
      setCart([...cart, { product: quickAddProduct, quantity: baseQty }]);
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
    setSelectedCashierId('');
    setCashierModalType('sale');
    setShowCashierModal(true);
  };

  const confirmCashierAndProceed = () => {
    if (!selectedCashierId) {
      toast.error('Select your name');
      return;
    }

    if (cashierModalType === 'sale') {
      const customerName = customer?.name || customerSearch.trim() || 'Walk-in Customer';

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
        customer_name: customerName,
        cashier_id: selectedCashierId,
      };

      const saleSummary = {
        total,
        customerName,
        paymentMethod: paymentMethod.toUpperCase(),
        tendered: paymentMethod === 'cash' ? parseFloat(amountReceived) : total,
        change: paymentMethod === 'cash' ? calculateChange() : 0,
        itemsPreview: cart.map(
          (item) => `${item.product.name} ×${item.quantity} ${item.product.unit} @ KES ${item.product.selling_price}`
        ),
      };

      setPendingSale({ payload: salePayload, summary: saleSummary });
      setShowCashierModal(false);
      setShowConfirmModal(true);
    } else if (cashierModalType === 'return') {
      // Process return with cashier confirmation
      processReturnWithCashier(selectedCashierId);
    }
  };

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
      fetchAllProducts(true);
      toast.success('Sale completed successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to complete sale');
    } finally {
      setLoading(false);
      setShowConfirmModal(false);
    }
  };

  const printReceipt = () => window.print();

  const searchReturnSale = async () => {
    if (!returnInvoice.trim()) {
      toast.error('Enter receipt number');
      return;
    }
    setSearchingReturn(true);
    try {
      const res = await api.get('/sales', { params: { limit: 200 } });
      const found = res.data.data.find((s: any) => s.invoice_no === returnInvoice.trim());
      if (!found) {
        toast.error('Receipt not found');
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
      
      setReturnSale({ ...saleDetail, sale_items: availableItems });
      setReturnItems([]);
      setReturnType('return');
      setExchangeProduct(null);
      setExchangeSearch('');
      setExchangeQty(1);
    } catch (error) {
      toast.error('Failed to search receipt');
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
      }
      return [
        ...prev,
        { sale_item_id: saleItemId, quantity: 0, reason: '', condition: 'resellable', [field]: value },
      ];
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

  const selectExchangeProduct = (product: Product) => {
    setExchangeProduct(product);
    setExchangeSearch(product.name);
    setExchangeResults([]);
  };

  const submitReturn = () => {
    if (!returnSale) return;
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
      sale_id: returnSale.id,
      items: validItems,
      refund_method: refundMethod,
      reason: 'Return from POS',
      return_type: returnType,
    };

    if (returnType === 'exchange') {
      payload.exchange_product_id = exchangeProduct.id;
      payload.exchange_quantity = exchangeQty;
    }

    setPendingReturnData(payload);
    setSelectedCashierId('');
    setCashierModalType('return');
    setShowCashierModal(true);
  };

  const processReturnWithCashier = async (cashierId: string) => {
    if (!pendingReturnData) return;
    setLoading(true);
    try {
      const res = await api.post('/returns', {
        ...pendingReturnData,
        cashier_id: cashierId,
      });
      
      setReturnReceipt(res.data);
      setShowCashierModal(false);
      setShowReturnModal(false);
      setReturnInvoice('');
      setReturnSale(null);
      setReturnItems([]);
      setExchangeProduct(null);
      setPendingReturnData(null);
      fetchAllProducts(true);
      toast.success('Return/Exchange processed successfully');
    } catch (error: any) {
      setShowCashierModal(false);
      toast.error(error.response?.data?.error || 'Failed to process return');
    } finally {
      setLoading(false);
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
          <h2><i className="fas fa-boxes-stacked" style={{ marginRight: '8px' }}></i>Products</h2>
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

          {loadingProducts && (
            <div className="pos-loading-state">
              <div className="spinner"></div>
              <p>Loading products...</p>
            </div>
          )}

          {!loadingProducts && (
            <div className="pos-product-grid">
              {filteredProducts.map((product) => {
                const stock = getProductStock(product);
                return (
                  <div 
                    key={product.id} 
                    className={`pos-product-card ${stock <= 0 ? 'pos-product-out-of-stock' : ''}`} 
                    onClick={() => openQuickAdd(product)}
                  >
                    <div className="pos-product-name">{product.name}</div>
                    {product.sku && <div className="pos-product-sku">SKU: {product.sku}</div>}
                    <div className="pos-product-price">
                      {getPriceDisplay(product.selling_price, product.unit, product.sales_unit, product.conversion_factor)}
                    </div>
                    <div className={`pos-product-stock ${stock <= 0 ? 'out' : stock < 5 ? 'low' : 'ok'}`}>
                      Stock: {getStockDisplay(stock, product.unit, product.sales_unit, product.conversion_factor)}
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && <p className="alert alert-info">No products found.</p>}
            </div>
          )}
        </div>

        {/* Right: Cart & Payment */}
        <div className="pos-right">
          <h3><i className="fas fa-shopping-cart" style={{ marginRight: '8px' }}></i>Cart <span className="badge">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span></h3>

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
              <button className="btn btn-outline btn-sm" onClick={openCustomerForm}><i className="fas fa-user-plus"></i> Register</button>
            </div>
            {customerResults.length > 0 && (
              <div className="pos-search-results">
                {customerResults.map((cust) => (
                  <div key={cust.id} className="pos-search-item" onClick={() => selectCustomer(cust)}>
                    <span>{cust.name}</span>
                    {cust.credit_balance ? <span className="pos-credit-badge">Owes: KES {cust.credit_balance}</span> : null}
                  </div>
                ))}
              </div>
            )}
            {customer && (
              <div className="pos-selected-customer">
                <strong>{customer.name}</strong>
                <span className="pos-credit-badge">Debt: KES {customer.credit_balance || 0} / Limit: KES {customer.credit_limit || 0}</span>
                <button className="btn btn-sm btn-outline" onClick={clearCustomer}><i className="fas fa-times"></i></button>
              </div>
            )}
          </div>

          <div className="pos-cart-items">
            {cart.length === 0 ? (
              <p className="text-muted">Cart is empty</p>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="pos-cart-line">
                  <div className="pos-cart-info">
                    <strong>{item.product.name}</strong>
                    <span>
                      {hasDualUnit(item.product.sales_unit, item.product.conversion_factor) ? (
                        <>
                          {item.quantity} {item.product.unit} × KES {getPriceForUnit(item.product.selling_price, 'base')}/{item.product.unit}
                          {item.quantity >= (item.product.conversion_factor || 1) && (
                            <span className="pos-cart-dual-price">
                              (or {getPriceDisplay(item.product.selling_price, item.product.unit, item.product.sales_unit, item.product.conversion_factor)})
                            </span>
                          )}
                        </>
                      ) : (
                        <span>{item.quantity} {item.product.unit} × KES {item.product.selling_price}/{item.product.unit}</span>
                      )}
                    </span>
                  </div>
                  <div className="pos-cart-controls">
                    <button className="btn btn-sm btn-outline" onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}>-</button>
                    <input type="number" min="1" value={item.quantity} onChange={(e) => updateCartQuantity(item.product.id, parseFloat(e.target.value) || 1)} className="input pos-qty-input" />
                    <button className="btn btn-sm btn-outline" onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}>+</button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeFromCart(item.product.id)}><i className="fas fa-times"></i></button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pos-totals">
            <p>Subtotal (excl. VAT): <strong>KES {subtotal.toFixed(2)}</strong></p>
            <p>VAT (16%): <strong>KES {vat.toFixed(2)}</strong></p>
            <p>Discount: <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="input pos-total-input" /></p>
            <p className="pos-grand-total">TOTAL: <strong>KES {total.toFixed(2)}</strong></p>
          </div>

          <div className="pos-payment-select">
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} className="input">
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="credit">Credit</option>
            </select>
          </div>

          {paymentMethod === 'cash' && (
            <div className="mt-2">
              <label>Amount Tendered (KES)</label>
              <input type="number" min="0" step="0.01" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} className="input" placeholder="Enter amount given by customer" />
              {amountReceived && <p>Change: <strong>KES {calculateChange().toFixed(2)}</strong></p>}
            </div>
          )}

          {paymentMethod === 'mpesa' && (
            <div className="mt-2">
              <label>M-Pesa Reference (optional)</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="e.g., Txn code" />
            </div>
          )}

          {paymentMethod === 'credit' && !customer && <p className="alert alert-warning">Please select a credit customer.</p>}

          <div className="flex gap-2 mt-4">
            <button className="btn btn-outline btn-sm" onClick={holdCurrentCart}><i className="fas fa-pause"></i> Hold Cart</button>
            <button className="btn btn-outline btn-sm" onClick={() => setShowHeldCarts(true)}><i className="fas fa-list"></i> Held Carts ({heldCarts.length})</button>
          </div>

          <button className="btn btn-primary pos-complete-btn mt-4" onClick={handleCompleteSale} disabled={loading}>
            {loading ? 'Processing...' : 'Complete Sale'}
          </button>

          <div className="flex gap-2 mt-2">
            <button className="btn btn-outline btn-sm" onClick={() => setShowReturnModal(true)}><i className="fas fa-rotate-left"></i> Return / Exchange</button>
            <button className="btn btn-danger btn-sm" onClick={clearCart}><i className="fas fa-trash"></i> Clear Cart</button>
          </div>
        </div>
      </div>

      {/* Cashier Selection Modal */}
      {showCashierModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-user-check"></i> Select Cashier
              </h3>
              <button className="modal-close" onClick={() => setShowCashierModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p>{cashierModalType === 'sale' ? 'Who is making this sale?' : 'Who is processing this return?'}</p>
              <select value={selectedCashierId} onChange={(e) => setSelectedCashierId(e.target.value)} className="input">
                <option value="">Select your name...</option>
                {cashiers.map((cashier) => (
                  <option key={cashier.id} value={cashier.id}>{cashier.full_name}</option>
                ))}
              </select>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCashierModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmCashierAndProceed} disabled={loading}>
                {loading ? 'Processing...' : 'Continue'}
              </button>
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
                <p>P.O BOX 345, NANDI HILLS</p>
                <p>Tel: 0717149902, 0724985188</p>
                <p>Quality Farm Inputs & Veterinary Supplies</p>
              </div>
              <hr />
              <p><strong>SALES RECEIPT</strong></p>
              <p><strong>{receiptData.invoice_no}</strong></p>
              <p>Date: {new Date(receiptData.sale_date).toLocaleDateString()}</p>
              <p>Time: {new Date(receiptData.sale_date).toLocaleTimeString()}</p>
              <p>Customer: {receiptData.customer?.name || receiptData.customer_name || 'Walk-in Customer'}</p>
              <p>Payment: {receiptData.payment_method.toUpperCase()}</p>
              <p>Cashier: {receiptData.cashier?.full_name || receiptData.user?.full_name || 'N/A'}</p>
              <table className="table mt-2">
                <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                <tbody>
                  {receiptData.sale_items.map((item: any) => (
                    <tr key={item.id}><td>{item.product.name}</td><td>{item.quantity}</td><td>{item.unit_price}</td><td>{item.total}</td></tr>
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
              <button className="btn btn-primary" onClick={printReceipt}><i className="fas fa-print"></i> Print</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Modal with Dual-Unit Support */}
      {quickAddProduct && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-cart-plus"></i> Add to Cart</h3>
              <button className="modal-close" onClick={closeQuickAdd}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p><strong>{quickAddProduct.name}</strong></p>
              {quickAddProduct.sku && <p className="text-muted">{quickAddProduct.sku}</p>}
              <p>Available: {getStockDisplay(getProductStock(quickAddProduct), quickAddProduct.unit, quickAddProduct.sales_unit, quickAddProduct.conversion_factor)}</p>

              {hasDualUnit(quickAddProduct.sales_unit, quickAddProduct.conversion_factor) && (
                <div className="form-section alt-unit-section">
                  <h4 className="form-section-title">
                    <i className="fas fa-sync-alt"></i> Sell By
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <label className={`toggle-label ${quickUnit === 'base' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="sellUnit"
                        checked={quickUnit === 'base'}
                        onChange={() => setQuickUnit('base')}
                      />
                      <span className="toggle-text">
                        {quickAddProduct.unit} - KES {getPriceForUnit(quickAddProduct.selling_price, 'base')}/{quickAddProduct.unit}
                      </span>
                    </label>
                    <label className={`toggle-label ${quickUnit === 'sales' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="sellUnit"
                        checked={quickUnit === 'sales'}
                        onChange={() => setQuickUnit('sales')}
                      />
                      <span className="toggle-text">
                        {quickAddProduct.sales_unit} - KES {getPriceForUnit(quickAddProduct.selling_price, 'sales', quickAddProduct.conversion_factor)}/{quickAddProduct.sales_unit}
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Quantity ({quickUnit === 'base' ? quickAddProduct.unit : quickAddProduct.sales_unit})</label>
                <input
                  type="number"
                  min="1"
                  max={getAvailableStockForUnit(getProductStock(quickAddProduct), quickUnit, quickAddProduct.conversion_factor)}
                  value={quickQty}
                  onChange={(e) => setQuickQty(parseFloat(e.target.value) || 1)}
                  onFocus={(e) => e.target.select()}
                  className="input"
                  style={{ textAlign: 'center' }}
                />
              </div>

              <p className="pos-grand-total">
                Total: KES {(
                  quickQty * getPriceForUnit(quickAddProduct.selling_price, quickUnit, quickAddProduct.conversion_factor)
                ).toFixed(2)}
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
              <div className="form-group"><label>Name *</label><input type="text" value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} className="input" /></div>
              <div className="form-group"><label>Phone</label><input type="text" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} className="input" /></div>
              <div className="form-group"><label>Address</label><input type="text" value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} className="input" /></div>
              <div className="form-group"><label>Credit Limit (KES)</label><input type="number" min="0" step="0.01" value={customerForm.credit_limit} onChange={(e) => setCustomerForm({ ...customerForm, credit_limit: parseFloat(e.target.value) || 0 })} className="input" /></div>
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
              {heldCarts.length === 0 ? <p>No held carts.</p> : heldCarts.map((hc) => (
                <div key={hc.id} className="card mb-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <strong>Cart #{hc.id}</strong>
                      <span className="text-muted">{new Date(hc.timestamp).toLocaleTimeString()}</span>
                      {hc.customer && <span> | {hc.customer.name}</span>}
                      <p>Items: {hc.cart.reduce((sum, item) => sum + item.quantity, 0)} | Total: KES {hc.cart.reduce((sum, item) => sum + item.quantity * item.product.selling_price, 0).toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-primary" onClick={() => resumeHeldCart(hc.id)}>Resume</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteHeldCart(hc.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowHeldCarts(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Return/Exchange Modal - Updated with Return Status Tracking */}
      {showReturnModal && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-rotate-left"></i> Return / Exchange</h3>
              <button className="modal-close" onClick={() => {
                setShowReturnModal(false);
                setReturnSale(null);
                setReturnItems([]);
              }}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  placeholder="Enter receipt number" 
                  value={returnInvoice} 
                  onChange={(e) => setReturnInvoice(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchReturnSale()}
                  className="input"
                />
                <button className="btn btn-outline" onClick={searchReturnSale} disabled={searchingReturn}>
                  {searchingReturn ? 'Searching...' : 'Search'}
                </button>
              </div>
              
              {returnSale && (
                <>
                  <div className="card mb-3" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
                    <p><strong>Invoice:</strong> {returnSale.invoice_no}</p>
                    <p><strong>Customer:</strong> {returnSale.customer?.name || returnSale.customer_name || 'Walk-in'}</p>
                    <p><strong>Date:</strong> {new Date(returnSale.sale_date).toLocaleDateString()}</p>
                    <p><strong>Total:</strong> KES {returnSale.total}</p>
                    <p>
                      <strong>Return Status:</strong>{' '}
                      <span className={`status ${returnSale.return_status || 'none'}`}>
                        {returnSale.return_status || 'none'}
                      </span>
                    </p>
                  </div>

                  <div className="form-group">
                    <label>Return Type</label>
                    <select value={returnType} onChange={(e) => setReturnType(e.target.value as any)} className="input">
                      <option value="return">Return</option>
                      <option value="exchange">Exchange</option>
                    </select>
                  </div>

                  <table className="table mt-4">
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
                      {returnSale.sale_items.map((item: any) => (
                        <tr key={item.id} style={{ opacity: item.return_status === 'returned' || item.return_status === 'exchanged' ? 0.5 : 1 }}>
                          <td>{item.product.name}</td>
                          <td>{item.quantity} {item.product.unit}</td>
                          <td>
                            {item.return_status === 'returned' || item.return_status === 'exchanged' ? (
                              <span className="badge" style={{ background: '#FFEBEE', color: '#D32F2F' }}>
                                {item.return_status.toUpperCase()}
                              </span>
                            ) : (
                              <span className="badge" style={{ background: '#E8F5E9', color: '#4CAF50' }}>
                                AVAILABLE
                              </span>
                            )}
                          </td>
                          <td>
                            {item.return_status === 'returned' || item.return_status === 'exchanged' ? (
                              <span className="text-muted">Already returned</span>
                            ) : (
                              <input 
                                type="number" 
                                min="0" 
                                max={item.quantity} 
                                step="0.1" 
                                className="input" 
                                style={{ width: '80px' }} 
                                onChange={(e) => handleReturnItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} 
                              />
                            )}
                          </td>
                          <td>
                            {item.return_status === 'returned' || item.return_status === 'exchanged' ? (
                              <span className="text-muted">-</span>
                            ) : (
                              <input 
                                type="text" 
                                className="input" 
                                placeholder="Optional" 
                                onChange={(e) => handleReturnItemChange(item.id, 'reason', e.target.value)} 
                              />
                            )}
                          </td>
                          <td>
                            {item.return_status === 'returned' || item.return_status === 'exchanged' ? (
                              <span className="text-muted">-</span>
                            ) : (
                              <select 
                                className="input" 
                                onChange={(e) => handleReturnItemChange(item.id, 'condition', e.target.value)} 
                                defaultValue="resellable"
                              >
                                <option value="resellable">Resellable</option>
                                <option value="damaged">Damaged</option>
                                <option value="expired">Expired</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {returnType === 'exchange' && (
                    <div className="mt-4">
                      <label>Exchange Product</label>
                      <input type="text" placeholder="Search product..." value={exchangeSearch} onChange={(e) => searchExchangeProducts(e.target.value)} className="input" />
                      {exchangeResults.length > 0 && (
                        <div className="pos-search-results">
                          {exchangeResults.map((product) => (
                            <div key={product.id} className="pos-search-item" onClick={() => selectExchangeProduct(product)}>
                              <span>{product.name}</span>
                              <span>{getPriceDisplay(product.selling_price, product.unit, product.sales_unit, product.conversion_factor)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {exchangeProduct && (
                        <div className="mt-2">
                          <p><strong>Exchange:</strong> {exchangeProduct.name} - KES {exchangeProduct.selling_price}</p>
                          <label>Quantity</label>
                          <input type="number" min="1" value={exchangeQty} onChange={(e) => setExchangeQty(parseInt(e.target.value) || 1)} className="input" style={{ width: '100px' }} />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4">
                    <label>Refund Method</label>
                    <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as any)} className="input" style={{ maxWidth: '200px' }}>
                      <option value="cash">Cash</option>
                      <option value="mpesa">M-Pesa</option>
                      <option value="credit_note">Credit Note</option>
                    </select>
                  </div>

                  <button className="btn btn-primary mt-4" onClick={submitReturn} disabled={loading}>
                    {loading ? 'Processing...' : 'Process Return/Exchange'}
                  </button>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => {
                setShowReturnModal(false);
                setReturnSale(null);
                setReturnItems([]);
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Return Receipt Modal */}
      {returnReceipt && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-receipt"></i> Return Receipt</h3>
              <button className="modal-close" onClick={() => setReturnReceipt(null)}><i className="fas fa-times"></i></button>
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
              <p>Date: {new Date(returnReceipt.return_date).toLocaleDateString()}</p>
              <p>Time: {new Date(returnReceipt.return_date).toLocaleTimeString()}</p>
              <p>Type: {returnReceipt.return_type.toUpperCase()}</p>
              <p>Refund Method: {returnReceipt.refund_method.toUpperCase()}</p>
              <p><strong>Total Refund: KES {returnReceipt.total_refund}</strong></p>
              {returnReceipt.items && returnReceipt.items.length > 0 && (
                <table className="table mt-2">
                  <thead><tr><th>Item</th><th>Qty</th><th>Condition</th></tr></thead>
                  <tbody>
                    {returnReceipt.items.map((item: any) => (
                      <tr key={item.id}>
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
              <button className="btn btn-primary" onClick={() => window.print()}><i className="fas fa-print"></i> Print</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
