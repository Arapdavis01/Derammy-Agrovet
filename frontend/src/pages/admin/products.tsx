import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Products.module.css';

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
  created_at: string;
}

export default function AdminProducts() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Product form modal
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

  // Categories state
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchCategories();
    if (activeTab === 'products') {
      fetchProducts();
    } else {
      fetchCategoryList();
    }
  }, [user, activeTab, page, search, categoryFilter]);

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const params: any = { page, limit, search: search || undefined, category_id: categoryFilter || undefined };
      const res = await api.get('/products', { params });
      setProducts(res.data.data);
      setTotalProducts(res.data.total);
    } catch (error: any) {
      toast.error('Failed to fetch products');
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data);
    } catch (error: any) {
      // ignore
    }
  };

  const fetchCategoryList = async () => {
    try {
      const res = await api.get('/categories');
      setCategoryList(res.data);
    } catch (error: any) {
      toast.error('Failed to fetch categories');
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
    // Basic validation
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
      fetchProducts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save product');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Product deleted');
      fetchProducts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete product');
    }
  };

  // Category handlers
  const handleOpenCategoryForm = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({ name: category.name });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: '' });
    }
    setShowCategoryForm(true);
  };

  const submitCategoryForm = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, { name: categoryForm.name.trim() });
        toast.success('Category updated');
      } else {
        await api.post('/categories', { name: categoryForm.name.trim() });
        toast.success('Category created');
      }
      setShowCategoryForm(false);
      fetchCategoryList();
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save category');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try {
      await api.delete(`/categories/${id}`);
      toast.success('Category deleted');
      fetchCategoryList();
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete category');
    }
  };

  const totalPages = Math.ceil(totalProducts / limit);

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <h1>Products Management</h1>
        <button className="btn btn-primary" onClick={() => handleOpenProductForm()}>Add Product</button>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'products' ? styles.active : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Products
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'categories' ? styles.active : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Categories
        </button>
      </div>

      {activeTab === 'products' && (
        <>
          {/* Search & Filter */}
          <div className={styles.filters}>
            <input
              type="text"
              placeholder="Search name, SKU, barcode..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input"
            />
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="input"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Products Table */}
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Cost Price</th>
                <th>Selling Price</th>
                <th>Batch Tracked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.sku || '-'}</td>
                  <td>{product.category?.name || '-'}</td>
                  <td>{product.unit}</td>
                  <td>KES {product.cost_price}</td>
                  <td>KES {product.selling_price}</td>
                  <td>{product.track_batch_expiry ? 'Yes' : 'No'}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => handleOpenProductForm(product)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteProduct(product.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={8} className="text-center">No products found</td></tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex justify-between mt-4">
              <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {activeTab === 'categories' && (
        <>
          <div className="flex justify-end mb-4">
            <button className="btn btn-outline" onClick={() => handleOpenCategoryForm()}>Add Category</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categoryList.map((cat) => (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => handleOpenCategoryForm(cat)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteCategory(cat.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {categoryList.length === 0 && (
                <tr><td colSpan={2} className="text-center">No categories found</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* Product Form Modal */}
      {showProductForm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalLarge}>
            <h3>{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label>Name *</label>
                <input type="text" value={productForm.name} onChange={(e) => handleProductFormChange('name', e.target.value)} className="input" />
              </div>
              <div>
                <label>SKU</label>
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
                <input type="text" value={productForm.unit} onChange={(e) => handleProductFormChange('unit', e.target.value)} className="input" placeholder="e.g., kg, litre, piece" />
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
              <div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={productForm.is_returnable} onChange={(e) => handleProductFormChange('is_returnable', e.target.checked)} />
                  Is Returnable
                </label>
              </div>
              <div>
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

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>{editingCategory ? 'Edit Category' : 'Add Category'}</h3>
            <div className="flex flex-col gap-2">
              <label>Name</label>
              <input type="text" value={categoryForm.name} onChange={(e) => setCategoryForm({ name: e.target.value })} className="input" />
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={submitCategoryForm}>Save</button>
              <button className="btn btn-outline" onClick={() => setShowCategoryForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
