import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'fs';

// Supabase initialization
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.warn('WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY is missing in environment variables.');
}

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Auth API
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

async function checkAndNotifyLowStock(productId: number | string) {
  const { data: product } = await supabase.from('products').select('*').eq('id', productId).single();
  const { data: settingsData } = await supabase.from('settings').select('*');
  
  const settings: any = {};
  settingsData?.forEach(r => settings[r.key] = r.value);

  const threshold = getProductThreshold(product, settings);
  
  if (product && product.stock < threshold && settings.manager_email) {
    console.log(`[LOW STOCK ALERT] To: ${settings.manager_email}`);
    console.log(`Product: ${product.name} (ID: ${product.id})`);
    console.log(`Stock Level: ${product.stock}, Threshold: ${threshold}`);
    console.log(`--- End of Notification ---`);
  }
}

app.post('/api/notify/low-stock', async (req, res) => {
  const { productId } = req.body;
  try {
    await checkAndNotifyLowStock(productId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Notification failed' });
  }
});

// Auth API
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const { data: user } = await supabase.from('users').select('*').eq('username', username).single();
  
  if (user && bcrypt.compareSync(password, user.password)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Low Stock Notification Logic
function getProductThreshold(product: any, settings: any) {
  let tagThresholds: any = {};
  let categoryThresholds: any = {};
  
  try {
    tagThresholds = JSON.parse(settings.tag_thresholds || '{}');
  } catch (e) {
    // console.error('Tag threshold parse error:', e);
  }
  
  try {
    categoryThresholds = JSON.parse(settings.category_thresholds || '{}');
  } catch (e) {
    // console.error('Category threshold parse error:', e);
  }

  if (product && product.tags) {
    const pTags = product.tags.split(',').map((t: string) => t.trim().toLowerCase());
    for (const tag of pTags) {
      if (tagThresholds[tag] !== undefined) {
        return tagThresholds[tag];
      }
    }
  }

  if (product && product.category && categoryThresholds[product.category] !== undefined) {
    return categoryThresholds[product.category];
  }

  return parseInt(settings.low_stock_threshold) || 10;
}

// Products API
app.get('/api/products', async (req, res) => {
  const { data: products } = await supabase.from('products').select('*').order('name');
  res.json(products || []);
});

app.post('/api/products', async (req, res) => {
  const { name, description, price, stock, category, image_url, barcode, tags } = req.body;
  const { data, error } = await supabase.from('products').insert([
    { name, description, price, stock, category, image_url, barcode, tags }
  ]).select();
  
  if (error) {
    res.status(400).json({ error: 'Barcode already exists or database error' });
  } else {
    res.json({ id: data[0].id });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, stock, category, image_url, barcode, tags } = req.body;
  await supabase.from('products').update({ name, description, price, stock, category, image_url, barcode, tags }).eq('id', id);
  res.json({ success: true });
});

app.delete('/api/products/:id', async (req, res) => {
  await supabase.from('products').delete().eq('id', req.params.id);
  res.json({ success: true });
});

app.post('/api/products/bulk', async (req, res) => {
  const { products } = req.body;
  const { error } = await supabase.from('products').insert(products);
  
  if (error) {
    res.status(400).json({ error: 'Bulk import failed' });
  } else {
    res.json({ success: true });
  }
});

// Checkout API
app.post('/api/checkout', async (req, res) => {
  const { items, total, payments, user_id, shift_id, customer_id, tax_amount } = req.body;
  
  try {
    const { data: transData, error: transError } = await supabase.from('transactions').insert({
      total,
      items_count: items.length,
      user_id,
      shift_id,
      customer_id,
      tax_amount
    }).select().single();

    if (transError) throw transError;
    const transactionId = transData.id;

    const itemsToInsert = items.map((item: any) => ({
      transaction_id: transactionId,
      product_id: item.id,
      quantity: item.quantity,
      price_at_time: item.price
    }));

    const { error: itemsError } = await supabase.from('transaction_items').insert(itemsToInsert);
    if (itemsError) throw itemsError;

    // Update stocks
    for (const item of items) {
      await supabase.rpc('increment_stock', { p_id: item.id, p_amount: -item.quantity });
      await checkAndNotifyLowStock(item.id);
    }

    if (payments) {
      const paymentsToInsert = payments.map((p: any) => ({
        transaction_id: transactionId,
        type: p.type,
        amount: p.amount
      }));
      await supabase.from('transaction_payments').insert(paymentsToInsert);
    }

    res.json({ success: true, transactionId });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// Transactions API
app.get('/api/transactions', async (req, res) => {
  const { data: transactions } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
  res.json(transactions || []);
});

app.get('/api/transactions/:id', async (req, res) => {
  const { data: transaction } = await supabase
    .from('transactions')
    .select('*, customers(name)')
    .eq('id', req.params.id)
    .single();
  
  if (transaction && transaction.customers) {
    (transaction as any).customer_name = (transaction as any).customers.name;
    delete (transaction as any).customers;
  }
  res.json(transaction);
});

app.get('/api/transactions/:id/items', async (req, res) => {
  const { data: items } = await supabase.from('transaction_items')
    .select('*, products(name)')
    .eq('transaction_id', req.params.id);
  
  // Flatten products(name)
  const flattened = items?.map(item => ({
    ...item,
    name: (item as any).products?.name
  }));
  res.json(flattened || []);
});

app.get('/api/transactions/:id/payments', async (req, res) => {
  const { data: payments } = await supabase.from('transaction_payments').select('*').eq('transaction_id', req.params.id);
  res.json(payments || []);
});

app.post('/api/transactions/:id/void', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  try {
    const { data: items } = await supabase.from('transaction_items').select('product_id, quantity').eq('transaction_id', id);
    if (items) {
      for (const item of items) {
        await supabase.rpc('increment_stock', { p_id: item.product_id, p_amount: item.quantity });
      }
    }
    await supabase.from('transactions').update({ status: 'void', void_reason: reason }).eq('id', id);
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ error: 'Void failed' });
  }
});

// Inventory Audit API
app.get('/api/inventory/audits', async (req, res) => {
  const { product_id, start_date, end_date } = req.query;
  let query = supabase.from('inventory_audits')
    .select('*, products(name), users(username)');
  
  if (product_id) query = query.eq('product_id', product_id);
  if (start_date) query = query.gte('created_at', start_date);
  if (end_date) query = query.lte('created_at', end_date);
  
  const { data: audits } = await query.order('created_at', { ascending: false });
  
  const flattened = audits?.map(a => ({
    ...a,
    product_name: (a as any).products?.name,
    username: (a as any).users?.username
  }));
  
  res.json(flattened || []);
});

app.post('/api/inventory/audit', async (req, res) => {
  const { product_id, actual_stock, reason, user_id } = req.body;
  
  try {
    const { data: product } = await supabase.from('products').select('stock').eq('id', product_id).single();
    const old_stock = product?.stock || 0;
    const discrepancy = actual_stock - old_stock;
    
    await supabase.from('inventory_audits').insert({
      product_id, old_stock, new_stock: actual_stock, discrepancy, reason, user_id
    });
    
    await supabase.from('products').update({ stock: actual_stock }).eq('id', product_id);
    await checkAndNotifyLowStock(product_id);

    res.json({ success: true, old_stock, discrepancy });
  } catch (_err) {
    res.status(500).json({ error: 'Audit failed' });
  }
});

// Reports API
app.get('/api/reports/sales', async (req, res) => {
  // Supabase doesn't support complex aggregations directly easily via select()
  // Usually you'd use a view or RPC for this.
  // For simplicity, we'll fetch last 30 days and group in JS (not ideal but works for small sets)
  const { data: transactions } = await supabase.from('transactions')
    .select('total, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  
  const groups: Record<string, number> = {};
  transactions?.forEach(t => {
    const date = t.created_at.split('T')[0];
    groups[date] = (groups[date] || 0) + (t.total || 0);
  });
  
  const sales = Object.entries(groups).map(([date, total]) => ({ date, total }));
  res.json(sales.slice(-30));
});

app.get('/api/reports/popular', async (req, res) => {
  // This is also complex for Supabase JS client without RPC
  // We'll fetch all active transaction items and group them
  const { data: items } = await supabase.from('transaction_items')
    .select('quantity, products(name), transactions(status)')
    .eq('transactions.status', 'active');
  
  const groups: Record<string, number> = {};
  items?.forEach((item: any) => {
    const name = item.products?.name || 'Unknown';
    groups[name] = (groups[name] || 0) + (item.quantity || 0);
  });
  
  const popular = Object.entries(groups)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
    
  res.json(popular);
});

// Settings API
app.get('/api/settings', async (req, res) => {
  const { data: rows } = await supabase.from('settings').select('*');
  const settings: any = {};
  rows?.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.post('/api/settings', async (req, res) => {
  const settings = req.body;
  const entries = Object.entries(settings).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value)
  }));
  
  // Upsert (must have key as PK)
  await supabase.from('settings').upsert(entries, { onConflict: 'key' });
  res.json({ success: true });
});

// Shift Management API
app.get('/api/shifts/active/:user_id', async (req, res) => {
  const { data: shift } = await supabase.from('shifts')
    .select('*')
    .eq('user_id', req.params.user_id)
    .eq('status', 'open')
    .maybeSingle();
  res.json(shift || null);
});

app.post('/api/shifts/open', async (req, res) => {
  const { user_id, start_cash } = req.body;
  const { data, error } = await supabase.from('shifts').insert({ user_id, start_cash }).select().single();
  if (error) res.status(500).json({ error: 'Shift opening failed' });
  else res.json({ id: data.id });
});

app.post('/api/shifts/close', async (req, res) => {
  const { shift_id, end_cash } = req.body;
  await supabase.from('shifts').update({ 
    end_time: new Date().toISOString(), 
    end_cash, 
    status: 'closed' 
  }).eq('id', shift_id);
  res.json({ success: true });
});

// Expenses API
app.get('/api/expenses', async (req, res) => {
  const { data: expenses } = await supabase.from('expenses').select('*, users(username)').order('date', { ascending: false });
  const flattened = expenses?.map(e => ({
    ...e,
    username: (e as any).users?.username
  }));
  res.json(flattened || []);
});

app.post('/api/expenses', async (req, res) => {
  const { description, amount, category, date, user_id } = req.body;
  const { data, error } = await supabase.from('expenses').insert([{ description, amount, category, date, user_id }]).select();
  if (error) res.status(500).json({ error: 'Failed to log expense' });
  else res.json(data[0]);
});

// Customers API
app.get('/api/customers', async (req, res) => {
  const { data: customers } = await supabase.from('customers').select('*').order('name');
  res.json(customers || []);
});

app.post('/api/customers', async (req, res) => {
  const { name, phone, email, store_credit } = req.body;
  const { data, error } = await supabase.from('customers').insert([{ name, phone, email, store_credit: store_credit || 0 }]).select();
  if (error) res.status(500).json({ error: 'Failed to create customer' });
  else res.json(data[0]);
});

app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  await supabase.from('customers').update(updates).eq('id', id);
  res.json({ success: true });
});

// Suppliers API
app.get('/api/suppliers', async (req, res) => {
  const { data: suppliers } = await supabase.from('suppliers').select('*').order('name');
  res.json(suppliers || []);
});

app.post('/api/suppliers', async (req, res) => {
  const { name, contact_person, phone, email, address } = req.body;
  const { data, error } = await supabase.from('suppliers').insert([{ name, contact_person, phone, email, address }]).select();
  if (error) res.status(500).json({ error: 'Failed to create supplier' });
  else res.json(data[0]);
});

app.put('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, contact_person, phone, email, address } = req.body;
  await supabase.from('suppliers').update({ name, contact_person, phone, email, address }).eq('id', id);
  res.json({ success: true });
});

app.delete('/api/suppliers/:id', async (req, res) => {
  await supabase.from('suppliers').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// Purchase Orders API
app.get('/api/purchase-orders', async (req, res) => {
  const { data: pos } = await supabase.from('purchase_orders')
    .select('*, suppliers(name)')
    .order('created_at', { ascending: false });
  
  const flattened = pos?.map(po => ({
    ...po,
    supplier_name: (po as any).suppliers?.name
  }));
  res.json(flattened || []);
});

app.post('/api/purchase-orders', async (req, res) => {
  const { supplier_id, items } = req.body;
  try {
    const total_amount = items.reduce((acc: number, item: any) => acc + (item.quantity * item.cost_price), 0);
    const { data: po, error: poError } = await supabase.from('purchase_orders').insert({
      supplier_id,
      total_amount,
      status: 'pending'
    }).select().single();

    if (poError) throw poError;

    const poItemsToInsert = items.map((item: any) => ({
      po_id: po.id,
      product_id: item.product_id,
      quantity: item.quantity,
      cost_price: item.cost_price
    }));

    const { error: itemsError } = await supabase.from('po_items').insert(poItemsToInsert);
    if (itemsError) throw itemsError;

    res.json(po);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

app.get('/api/purchase-orders/:id/items', async (req, res) => {
  const { data: items } = await supabase.from('po_items')
    .select('*, products(name)')
    .eq('po_id', req.params.id);
  
  const flattened = items?.map(item => ({
    ...item,
    product_name: (item as any).products?.name
  }));
  res.json(flattened || []);
});

app.put('/api/purchase-orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  try {
    const { data: po } = await supabase.from('purchase_orders').select('*').eq('id', id).single();
    
    // If status is becoming 'received', increment stocks
    if (status === 'received' && po.status !== 'received') {
      const { data: items } = await supabase.from('po_items').select('*').eq('po_id', id);
      if (items) {
        for (const item of items) {
          await supabase.rpc('increment_stock', { p_id: item.product_id, p_amount: item.quantity });
        }
      }
    }

    await supabase.from('purchase_orders').update({ status }).eq('id', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update PO status' });
  }
});

// Reports: Net Profit
app.get('/api/reports/profit', async (req, res) => {
  const { data: sales } = await supabase.from('transactions').select('total, created_at').eq('status', 'active');
  const { data: expenses } = await supabase.from('expenses').select('amount, date');

  const revenue = sales?.reduce((sum, s) => sum + (s.total || 0), 0) || 0;
  const totalExpenses = expenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

  res.json({ revenue, expenses: totalExpenses, net: revenue - totalExpenses });
});

// Start Server
async function seedUsers() {
  const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
  if (count === 0) {
    const adminPassword = bcrypt.hashSync('admin123', 10);
    const cashierPassword = bcrypt.hashSync('cashier123', 10);
    await supabase.from('users').insert([
      { username: 'admin', password: adminPassword, role: 'manager' },
      { username: 'cashier', password: cashierPassword, role: 'cashier' }
    ]);
    console.log('Default users seeded.');
  }
}

/**
 * NOTE: For the new features to work, you must create these tables in Supabase:
 * 
 * 1. customers: id (int), name (text), phone (text), email (text), store_credit (float), points (int), created_at (timestamp)
 * 2. suppliers: id (int), name (text), contact_person (text), phone (text), email (text), address (text)
 * 3. expenses: id (int), description (text), amount (float), category (text), date (date), user_id (int)
 * 4. purchase_orders: id (int), supplier_id (int), status (text), total_amount (float), created_at (timestamp)
 * 5. po_items: id (int), po_id (int), product_id (int), quantity (int), cost_price (float)
 * 
 * Update products table to include:
 * - supplier_id (int, nullable)
 * 
 * Update transactions table to include:
 * - customer_id (int, nullable)
 * - tax_amount (float)
 */

async function startServer() {
  await seedUsers();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer();
