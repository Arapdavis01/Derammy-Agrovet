import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category_id: string | null;
  category?: { id: string; name: string } | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  reorder_level: number;
  is_returnable: boolean;
  tax_rate: number;
  track_batch_expiry: boolean;
  total_stock?: number;
}

export default function AdminProducts() {
  const { user } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    unit: 'piece',
    cost_price: '',
    selling_price: '',
    reorder_level: '0',
    is_returnable: true,
    tax_rate: '0',
    track_batch_expiry: false,
  });

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchData();
  }, [user, search]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        api.get('/products', { params: { search: search || undefined, limit: 200 } }),
        api.get('/categories'),
      ]);
      setProducts(productsRes.data.data || []);
      setCategories(categoriesRes.data);
    } catch (error: any) {
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProductForm = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        sku: product.sku || '',
        barcode: product.barcode || '',
        category_id: product.category_id || '',
        unit: product.unit,
        cost_price: product.cost_price.toString(),
        selling_price: product.selling_price.toString(),
        reorder_level: product.reorder_level.toString(),
        is_returnable: product.is_returnable,
        tax_rate: product.tax_rate.toString(),
        track_batch_expiry: product.track_batch_expiry,
      });
    } else {
      setEditingProduct(null);
      setProductForm({
        name: '',
        sku: '',
        barcode: '',
        category_id: '',
        unit: 'piece',
        cost_price: '',
        selling_price: '',
        reorder_level: '0',
        is_returnable: true,
        tax_rate: '0',
        track_batch_expiry: false,
      });
    }
    setShowProductForm(true);
  };

  const handleProductFormChange = (field: string, value: any) => {
    setProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitProductForm = async () => {
    if (!productForm.name || !productForm.unit || productForm.cost_price === '' || productForm.selling_price === '') {
      toast.error('Name, unit, cost price, and selling price are required');
      return;
    }
    if (parseFloat(productForm.selling_price) < parseFloat(productForm.cost_price)) {
      toast.error('Selling price cannot be less than cost price');
      return;
    }
    const payload = {
      ...productForm,
      cost_price: parseFloat(productForm.cost_price),
      selling_price: parseFloat(productForm.selling_price),
      reorder_level: parseFloat(productForm.reorder_level) || 0,
      tax_rate: parseFloat(productForm.tax_rate) || 0,
      category_id: productForm.category_id || null,
    };

    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/products', payload);
        toast.success('Product created');
      }
      setShowProductForm(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save product');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Product deleted');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete product');
    }
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Products ({products.length} items)</h1>
          <p className="text-muted">Manage your product catalog and inventory.</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenProductForm()}>
          <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Add Product
        </button>
      </div>

      {/* Search */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search by name, brand, variant, or category (e.g., cement)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
        <button className="btn btn-outline" onClick={fetchData}>
          <i className="fas fa-search" style={{ marginRight: '6px' }}></i> Search
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="mt-4">
          {products.length === 0 ? (
            <p className="alert alert-info">No products found.</p>
          ) : (
            products.map((product) => (
              <div key={product.id} className="card mb-2">
                <div className="flex justify-between items-center">
                  <h3 className="card-title" style={{ marginBottom: '0' }}>
                    <i className="fas fa-box" style={{ marginRight: '8px' }}></i>
                    {product.name}
                    <span className="text-muted" style={{ fontSize: '0.9rem', marginLeft: '8px' }}>
                      1 variant
                    </span>
                  </h3>
                  <button className="btn btn-sm btn-outline" onClick={() => handleOpenProductForm(product)}>
                    <i className="fas fa-plus" style={{ marginRight: '4px' }}></i> Add Variant
                  </button>
                </div>

                <table className="table mt-2">
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Variant</th>
                      <th>Category</th>
                      <th>Buy Price</th>
                      <th>Sell Price</th>
                      <th>Stock</th>
                      <th>Unit</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{product.sku || 'Default'}</td>
                      <td>{product.name}</td>
                      <td>{product.category?.name || 'Uncategorized'}</td>
                      <td>KES {product.cost_price.toFixed(2)}</td>
                      <td>KES {product.selling_price.toFixed(2)}/{product.unit}</td>
                      <td>{product.total_stock || 0}</td>
                      <td>{product.unit}</td>
                      <td>
                        {product.total_stock === 0 ? (
                          <span className="status inactive">Out of Stock</span>
                        ) : (
                          <span className="status active">OK</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-outline" onClick={() => handleOpenProductForm(product)}>
                          <i className="fas fa-edit"></i>
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteProduct(product.id)}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* Product Form Modal */}
      {showProductForm && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <h3>{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label>Name *</label>
                <input type="text" value={productForm.name} onChange={(e) => handleProductFormChange('name', e.target.value)} className="input" />
              </div>
              <div>
                <label>SKU / Brand</label>
                <input type="text" value={productForm.sku} onChange={(e) => handleProductFormChange('sku', e.target.value)} className="input" />
              </div>
              <div>
                <label>Barcode</label>
                <input type="text" value={productForm.barcode} onChange={(e) => handleProductFormChange('barcode', e.target.value)} className="input" />
              </div>
              <div>
                <label>Category</label>
                <select value={productForm.category_id} onChange={(e) => handleProductFormChange('category_id', e.target.value)} className="input">
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Unit *</label>
                <input type="text" value={productForm.unit} onChange={(e) => handleProductFormChange('unit', e.target.value)} className="input" placeholder="e.g., kg, bag, litre" />
              </div>
              <div>
                <label>Cost Price *</label>
                <input type="number" step="0.01" min="0" value={productForm.cost_price} onChange={(e) => handleProductFormChange('cost_price', e.target.value)} className="input" />
              </div>
              <div>
                <label>Selling Price *</label>
                <input type="number" step="0.01" min="0" value={productForm.selling_price} onChange={(e) => handleProductFormChange('selling_price', e.target.value)} className="input" />
              </div>
              <div>
                <label>Reorder Level</label>
                <input type="number" step="0.01" min="0" value={productForm.reorder_level} onChange={(e) => handleProductFormChange('reorder_level', e.target.value)} className="input" />
              </div>
              <div>
                <label>Tax Rate (%)</label>
                <input type="number" step="0.01" min="0" value={productForm.tax_rate} onChange={(e) => handleProductFormChange('tax_rate', e.target.value)} className="input" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={productForm.is_returnable} onChange={(e) => handleProductFormChange('is_returnable', e.target.checked)} />
                  Returnable
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={productForm.track_batch_expiry} onChange={(e) => handleProductFormChange('track_batch_expiry', e.target.checked)} />
                  Track Batch/Expiry
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={submitProductForm}>Save</button>
              <button className="btn btn-outline" onClick={() => setShowProductForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
