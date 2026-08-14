import categoryRoutes from './routes/category.routes';
import productRoutes from './routes/product.routes';

// ... after existing routes
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
