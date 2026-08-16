import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  track_batch_expiry: boolean;
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

export default function POS() {
  const { user } = useAuth();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'credit'>('cash');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [reference, setReference] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [transport, setTransport] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [saleComplete, setSaleComplete] = useState<any>(null);
  const [heldCarts, setHeldCarts] = useState<CartItem[]>([]);

  // Debounced product search
  useEffect(() => {
    const delay = setTimeout(() => {
      if (searchTerm.trim().length > 0) {
        fetchProducts(searchTerm);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [searchTerm]);

  const fetchProducts = async (term: string) => {
    try {
      const res = await api.get('/products', { params: { search: term, limit: 20 } });
      setSearchResults(res.data.data);
    } catch (error: any) {
      toast.error('Failed to search products');
    }
  };

  const handleCustomerSearch = async (term: string) => {
    setCustomerSearch(term);
    if (term.trim().length > 0) {
      try {
        const res = await api.get('/customers', { params: { search: term, limit: 10 } });
        setCustomerResults(res.data.data);
      } catch (error: any) {
        toast.error('Failed to search customers');
      }
    } else {
      setCustomerResults([]);
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      setCart(cart.map((item) =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(cart.map((item) =>
      item.product.id === productId ? { ...item, quantity: newQuantity } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.quantity * item.product.selling_price, 0);
  };

  const calculateVAT = () => {
    return calculateSubtotal() * 0.16;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateVAT() - discount + transport;
  };

  const calculateChange = () => {
    const total = calculateTotal();
    const cash = parseFloat(amountReceived) || 0;
    return cash - total;
  };

  const handleSubmitSale = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    if (paymentMethod === 'credit' && !customer) {
      toast.error('Please select a customer for credit sale');
      return;
    }

    if (paymentMethod === 'cash' && (parseFloat(amountReceived) || 0) < calculateTotal()) {
      toast.error('Insufficient cash received');
      return;
    }

    const items = cart.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
    }));

    const payload: any = {
      items,
      payment_method: paymentMethod,
      discount,
      tax: calculateVAT(),
      transport,
      sale_status: 'completed',
    };

    if (customer) payload.customer_id = customer.id;

    if (paymentMethod === 'cash') {
      payload.amount_received = parseFloat(amountReceived);
    }

    if (paymentMethod === 'mpesa') {
      payload.reference = reference || undefined;
    }

    setLoading(true);
    try {
      const res = await api.post('/sales', payload);
      setSaleComplete(res.data);
      toast.success('Sale completed successfully');
      setCart([]);
      setCustomer(null);
      setCustomerSearch('');
      setPaymentMethod('cash');
      setAmountReceived('');
      setReference('');
      setDiscount(0);
      setTransport(0);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to complete sale');
    } finally {
      setLoading(false);
    }
  };

  const holdCart = () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setHeldCarts([...heldCarts, ...cart]);
    setCart([]);
    toast.success('Cart held successfully');
  };

  const clearCart = () => {
    setCart([]);
    setCustomer(null);
    setCustomerSearch('');
    setPaymentMethod('cash');
    setAmountReceived('');
    setReference('');
    setDiscount(0);
    setTransport(0);
  };

  return (
    <Layout>
      <div className="pos-container">
        {/* Left: Product search & list */}
        <div className="pos-left">
          <h2><i className="fas fa-boxes-stacked" style={{ marginRight: '8px' }}></i>Products</h2>
          <div className="pos-search-wrapper">
            <i className="fas fa-search pos-search-icon"></i>
            <input
              type="text"
              placeholder="Search product by name, SKU, or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pos-search-input"
              autoFocus
            />
          </div>

          {searchResults.length > 0 && (
            <div className="pos-search-results">
              {searchResults.map((product) => (
                <div
                  key={product.id}
                  className="pos-search-item"
                  onClick={() => addToCart(product)}
                >
                  <div className="pos-product-info">
                    <span className="pos-product-name">{product.name}</span>
                    <span className="pos-product-stock">
                      Stock: {product.stock_batches?.reduce((sum, b) => sum + Number(b.quantity_remaining), 0) || 0} {product.unit}
                    </span>
                  </div>
                  <span className="pos-product-price">KES {product.selling_price}/{product.unit}</span>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="pos-cart-items">
              <h3>Cart Items</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.product.id}>
                      <td>{item.product.name}</td>
                      <td>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.product.id, parseFloat(e.target.value) || 0)}
                          className="input pos-qty-input"
                        />
                      </td>
                      <td>KES {item.product.selling_price}</td>
                      <td>KES {(item.quantity * item.product.selling_price).toFixed(2)}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => removeFromCart(item.product.id)}>
                          <i className="fas fa-times"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Customer, totals, payment */}
        <div className="pos-right">
          <h3><i className="fas fa-user" style={{ marginRight: '8px' }}></i>Customer</h3>
          <input
            type="text"
            placeholder="Type name to search or enter new..."
            value={customerSearch}
            onChange={(e) => handleCustomerSearch(e.target.value)}
            className="input"
          />
          {customerResults.length > 0 && (
            <div className="pos-search-results">
              {customerResults.map((cust) => (
                <div
                  key={cust.id}
                  className="pos-search-item"
                  onClick={() => {
                    setCustomer(cust);
                    setCustomerSearch(cust.name);
                    setCustomerResults([]);
                  }}
                >
                  <span>{cust.name}</span>
                  {cust.credit_balance ? <span className="pos-credit-badge">Owes: KES {cust.credit_balance}</span> : null}
                </div>
              ))}
            </div>
          )}
          {customer && (
            <div className="pos-selected-customer">
              <strong>Selected:</strong> {customer.name}
              <button className="btn btn-sm btn-outline" onClick={() => setCustomer(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}

          <h3 className="mt-4"><i className="fas fa-cash-register" style={{ marginRight: '8px' }}></i>Register</h3>
          <div className="pos-totals">
            <p>Subtotal (excl. VAT): <strong>KES {calculateSubtotal().toFixed(2)}</strong></p>
            <p>VAT (16%): <strong>KES {calculateVAT().toFixed(2)}</strong></p>
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
            <p>
              Transport: 
              <input
                type="number"
                min="0"
                step="0.01"
                value={transport}
                onChange={(e) => setTransport(parseFloat(e.target.value) || 0)}
                className="input pos-total-input"
              />
            </p>
            <p className="pos-grand-total">TOTAL: <strong>KES {calculateTotal().toFixed(2)}</strong></p>
          </div>

          <h4>Payment Method</h4>
          <div className="pos-payment-methods">
            <label className={`pos-payment-method ${paymentMethod === 'cash' ? 'selected' : ''}`}>
              <input type="radio" value="cash" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
              <i className="fas fa-money-bill-wave" style={{ marginRight: '4px' }}></i> Cash
            </label>
            <label className={`pos-payment-method ${paymentMethod === 'mpesa' ? 'selected' : ''}`}>
              <input type="radio" value="mpesa" checked={paymentMethod === 'mpesa'} onChange={() => setPaymentMethod('mpesa')} />
              <i className="fas fa-mobile-alt" style={{ marginRight: '4px' }}></i> M-Pesa
            </label>
            <label className={`pos-payment-method ${paymentMethod === 'credit' ? 'selected' : ''}`}>
              <input type="radio" value="credit" checked={paymentMethod === 'credit'} onChange={() => setPaymentMethod('credit')} />
              <i className="fas fa-file-invoice-dollar" style={{ marginRight: '4px' }}></i> Credit
            </label>
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
              {amountReceived && <p>Change: <strong>KES {calculateChange().toFixed(2)}</strong></p>}
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

          <div className="flex gap-2 mt-4">
            <button className="btn btn-outline btn-sm" onClick={holdCart}>
              <i className="fas fa-pause" style={{ marginRight: '4px' }}></i> Hold Cart
            </button>
            <span className="pos-held-count">Held Carts ({heldCarts.length})</span>
          </div>

          <button
            className="btn btn-primary pos-complete-btn mt-4"
            onClick={handleSubmitSale}
            disabled={loading}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Processing...
              </>
            ) : (
              <>
                <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i> Complete Sale
              </>
            )}
          </button>

          <div className="flex gap-2 mt-2">
            <button className="btn btn-outline btn-sm" onClick={() => router.push('/cashier/returns')}>
              <i className="fas fa-rotate-left" style={{ marginRight: '4px' }}></i> Return / Exchange
            </button>
            <button className="btn btn-danger btn-sm" onClick={clearCart}>
              <i className="fas fa-trash" style={{ marginRight: '4px' }}></i> Clear Cart
            </button>
          </div>
        </div>
      </div>

      {/* Sale complete modal */}
      {saleComplete && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Sale Completed</h3>
            <p><strong>Invoice:</strong> {saleComplete.invoice_no}</p>
            <p><strong>Total:</strong> KES {saleComplete.total}</p>
            <p><strong>Payment:</strong> {saleComplete.payment_method}</p>
            <button className="btn btn-primary" onClick={() => setSaleComplete(null)}>Close</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
