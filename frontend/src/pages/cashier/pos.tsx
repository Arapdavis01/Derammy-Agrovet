import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/POS.module.css';

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
  const [loading, setLoading] = useState(false);
  const [saleComplete, setSaleComplete] = useState<any>(null);

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

  // Customer search
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
    // Check if already in cart
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      setCart(cart.map((item) =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    // Clear search
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

  const calculateChange = () => {
    const subtotal = calculateSubtotal();
    const cash = parseFloat(amountReceived) || 0;
    return cash - subtotal;
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

    if (paymentMethod === 'cash' && (parseFloat(amountReceived) || 0) < calculateSubtotal()) {
      toast.error('Insufficient cash received');
      return;
    }

    // Prepare sale payload
    const items = cart.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
    }));

    const payload: any = {
      items,
      payment_method: paymentMethod,
      discount: 0,
      tax: 0,
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
      // Clear cart
      setCart([]);
      setCustomer(null);
      setCustomerSearch('');
      setPaymentMethod('cash');
      setAmountReceived('');
      setReference('');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to complete sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className={styles.posContainer}>
        {/* Left side: Product search and cart */}
        <div className={styles.leftPane}>
          <h2>New Sale</h2>
          <input
            type="text"
            placeholder="Search product by name, SKU, or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className={styles.searchResults}>
              {searchResults.map((product) => (
                <div
                  key={product.id}
                  className={styles.searchItem}
                  onClick={() => addToCart(product)}
                >
                  <span>{product.name}</span>
                  <span>KES {product.selling_price}/{product.unit}</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.cart}>
            <h3>Cart Items</h3>
            {cart.length === 0 ? (
              <p>No items in cart.</p>
            ) : (
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
                          className={styles.qtyInput}
                        />
                      </td>
                      <td>KES {item.product.selling_price}</td>
                      <td>KES {(item.quantity * item.product.selling_price).toFixed(2)}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => removeFromCart(item.product.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right side: Customer, payment, totals */}
        <div className={styles.rightPane}>
          <h3>Customer</h3>
          <input
            type="text"
            placeholder="Search customer (optional for cash)"
            value={customerSearch}
            onChange={(e) => handleCustomerSearch(e.target.value)}
            className="input"
          />
          {customerResults.length > 0 && (
            <div className={styles.searchResults}>
              {customerResults.map((cust) => (
                <div
                  key={cust.id}
                  className={styles.searchItem}
                  onClick={() => {
                    setCustomer(cust);
                    setCustomerSearch(cust.name);
                    setCustomerResults([]);
                  }}
                >
                  {cust.name} {cust.credit_balance ? `(Owes: KES ${cust.credit_balance})` : ''}
                </div>
              ))}
            </div>
          )}
          {customer && (
            <div className={styles.selectedCustomer}>
              <strong>Selected:</strong> {customer.name}
              <button className="btn btn-sm btn-outline" onClick={() => setCustomer(null)}>Clear</button>
            </div>
          )}

          <h3>Payment Method</h3>
          <div className={styles.paymentMethods}>
            <label className={paymentMethod === 'cash' ? styles.selected : ''}>
              <input type="radio" value="cash" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
              Cash
            </label>
            <label className={paymentMethod === 'mpesa' ? styles.selected : ''}>
              <input type="radio" value="mpesa" checked={paymentMethod === 'mpesa'} onChange={() => setPaymentMethod('mpesa')} />
              M-Pesa
            </label>
            <label className={paymentMethod === 'credit' ? styles.selected : ''}>
              <input type="radio" value="credit" checked={paymentMethod === 'credit'} onChange={() => setPaymentMethod('credit')} />
              Credit
            </label>
          </div>

          {paymentMethod === 'cash' && (
            <div className={styles.paymentDetails}>
              <label>Amount Received</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="input"
                placeholder="0.00"
              />
            </div>
          )}

          {paymentMethod === 'mpesa' && (
            <div className={styles.paymentDetails}>
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

          <div className={styles.totals}>
            <p>Subtotal: KES {calculateSubtotal().toFixed(2)}</p>
            <p>Discount: KES 0.00</p>
            <p>Tax: KES 0.00</p>
            <h3>Total: KES {calculateSubtotal().toFixed(2)}</h3>
            {paymentMethod === 'cash' && amountReceived && (
              <p>Change: KES {calculateChange().toFixed(2)}</p>
            )}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '1rem', fontSize: '1.2rem' }}
            onClick={handleSubmitSale}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </div>

      {/* Sale complete modal */}
      {saleComplete && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Sale Completed</h3>
            <p>Invoice: {saleComplete.invoice_no}</p>
            <p>Total: KES {saleComplete.total}</p>
            <p>Payment: {saleComplete.payment_method}</p>
            <button className="btn btn-primary" onClick={() => setSaleComplete(null)}>Close</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
