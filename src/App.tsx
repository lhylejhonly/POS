import { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingCart, Package, Search, Plus, Minus, Trash2, Edit, X, Bug, Filter, ChevronDown, ChevronUp, ArrowUpDown, UserCircle, Settings, LogOut, History, AlertCircle, AlertTriangle, TrendingUp, PieChart as PieChartIcon, Upload, ArrowRight, Lock, Activity, ClipboardCheck, Banknote, CreditCard, Smartphone, Split, Check, Truck, ArrowDown, ArrowUp, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Cell, Pie } from 'recharts';
import { api, Product, Customer, Supplier, Expense, PurchaseOrder } from './lib/api';
import Fuse from 'fuse.js';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  price: z.number().min(0.01, "Price must be greater than 0"),
  stock: z.number().int().min(0, "Stock cannot be negative"),
  category: z.string().min(2, "Category must be at least 2 characters"),
  image_url: z.string().url("Must be a valid URL").or(z.string().length(0)).optional(),
  barcode: z.string().optional(),
  tags: z.string().optional(),
  supplier_id: z.number().optional()
});

type View = 'pos' | 'products' | 'transactions' | 'settings' | 'reports' | 'audit' | 'customers' | 'suppliers' | 'expenses';

export interface StoreSettings {
  store_name: string;
  store_address: string;
  store_phone: string;
  receipt_footer: string;
  logo_url: string;
  receipt_layout: 'standard' | 'compact';
  show_tax_id: boolean;
  tax_id: string;
  tax_rate: number;
  low_stock_threshold: number;
  category_thresholds?: Record<string, number>;
  tag_thresholds?: Record<string, number>;
  manager_email?: string;
}

export function getProductThreshold(product: Product, settings: StoreSettings): number {
  if (product.tags && settings.tag_thresholds) {
    const pTags = product.tags.split(',').map(t => t.trim().toLowerCase());
    for (const tag of pTags) {
      if (settings.tag_thresholds[tag] !== undefined) {
        return settings.tag_thresholds[tag];
      }
    }
  }

  if (product.category && settings.category_thresholds && settings.category_thresholds[product.category] !== undefined) {
    return settings.category_thresholds[product.category];
  }

  return settings.low_stock_threshold;
}

export default function App() {
  const [view, setView] = useState<View>('pos');
  const [user, setUser] = useState<{ id: number; username: string; role: string } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cart, setCart] = useState<(Product & { quantity: number })[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // all, low, out
  const [lastTransactionId, setLastTransactionId] = useState<number | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [settings, setSettings] = useState<StoreSettings>({
    store_name: 'RED ANT',
    store_address: 'Anthill HQ, Colony Rd',
    store_phone: '(555) ANT-0000',
    receipt_footer: 'Thanks for being part of the colony!',
    logo_url: '',
    receipt_layout: 'standard',
    show_tax_id: false,
    tax_id: '',
    tax_rate: 0,
    low_stock_threshold: 10
  });

  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c => 
      c.name.toLowerCase().includes(customerSearch) || 
      (c.phone && c.phone.includes(customerSearch)) ||
      (c.email && c.email.toLowerCase().includes(customerSearch))
    );
  }, [customers, customerSearch]);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await api.getCustomers();
      setCustomers(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await api.getSuppliers();
      setSuppliers(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      if (typeof data.show_tax_id === 'string') {
        data.show_tax_id = data.show_tax_id === 'true';
      }
      if (data.tax_rate !== undefined) {
        data.tax_rate = parseFloat(data.tax_rate as any) || 0;
      }
      if (data.low_stock_threshold !== undefined) {
        data.low_stock_threshold = parseInt(data.low_stock_threshold as any) || 0;
      }
      if (data.category_thresholds !== undefined && typeof data.category_thresholds === 'string') {
        try {
          data.category_thresholds = JSON.parse(data.category_thresholds);
        } catch (_err) {
          data.category_thresholds = {};
        }
      }
      if (data.tag_thresholds !== undefined && typeof data.tag_thresholds === 'string') {
        try {
          data.tag_thresholds = JSON.parse(data.tag_thresholds);
        } catch (_err) {
          data.tag_thresholds = {};
        }
      }
      setSettings(prev => ({ ...prev, ...data }));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const checkActiveShift = useCallback(async (userId: number) => {
    try {
      const shift = await api.getActiveShift(userId);
      setActiveShift(shift);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('pos_user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        checkActiveShift(userData.id);
      } catch (_e) {
        // Ignore parse error
      }
    }
    loadProducts();
    loadSettings();
    loadCustomers();
    loadSuppliers();
  }, [checkActiveShift, loadProducts, loadSettings, loadCustomers, loadSuppliers]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'pos') return;
      if (e.key === 'F1') {
        e.preventDefault();
        if (cart.length > 0) setShowPayment(true);
      }
      if (e.key === 'F2') {
        e.preventDefault();
        setCart([]);
        setSelectedCustomer(null);
      }
      if (e.key === 'F3') {
        e.preventDefault();
        const searchInput = document.getElementById('pos-search');
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, cart.length]);

  const handleLogin = (userData: any) => {
    setUser(userData);
    localStorage.setItem('pos_user', JSON.stringify(userData));
    setStatus({ type: 'success', message: `Welcome back, ${userData.username}` });
    checkActiveShift(userData.id);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('pos_user');
    setView('pos');
  };

  const [drafts, setDrafts] = useState<{ id: string, items: any[], total: number, date: string }[]>(() => {
    const saved = localStorage.getItem('pos_drafts');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('pos_drafts', JSON.stringify(drafts));
  }, [drafts]);

  const holdDraft = () => {
    if (cart.length === 0) return;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * (settings.tax_rate / 100);
    const total = subtotal + tax;
    
    const newDraft = {
      id: Math.random().toString(36).substring(7).toUpperCase(),
      items: [...cart],
      total,
      date: new Date().toISOString()
    };
    
    setDrafts([newDraft, ...drafts]);
    setCart([]);
    setStatus({ type: 'success', message: `Draft ${newDraft.id} saved` });
  };

  const resumeDraft = (draft: any) => {
    if (cart.length > 0) {
      if (!confirm('Current cart is not empty. Overwrite with draft?')) return;
    }
    setCart(draft.items);
    setDrafts(drafts.filter(d => d.id !== draft.id));
    setStatus({ type: 'success', message: `Draft ${draft.id} resumed` });
  };

  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });

    setRecentlyAdded(prev => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setRecentlyAdded(prev => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    }, 800);
  }, []);

  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      const isSearchInput = document.activeElement?.getAttribute('data-search-input') === 'true';

      // If it's a regular input (form field), we allow natural typing/scanning into the field.
      // We only intercept if it's NOT an input OR if it's a designated search input.
      if (isInput && !isSearchInput) {
        return;
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 2) {
          const match = products.find(p => p.barcode === barcodeBuffer || p.id.toString() === barcodeBuffer);
          
          if (match) {
            // Signal that a barcode was scanned. View-specific components should listen for this.
            const event = new CustomEvent('barcode-scanned', { detail: match });
            window.dispatchEvent(event);
            
            // If we are in POS view and nothing handled the event yet (or we just want default behavior)
            // Note: CustomEvent doesn't easily support "handled" across different listeners without extra logic
            // but for this app, the views are mutually exclusive.
            if (view === 'pos') {
              addToCart(match);
              setStatus({ type: 'success', message: `Added ${match.name}` });
              if (isSearchInput) setSearchTerm('');
            }
          }
        }
        barcodeBuffer = '';
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 50) {
        barcodeBuffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, addToCart, setSearchTerm, view]); // Re-bind when products or view change

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateCartQuantity = (id: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        if (newQty > item.stock) return item;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setShowPayment(true);
  };

  const onCompleteCheckout = async (payments: { type: string, amount: number }[]) => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * (settings.tax_rate / 100);
    const total = subtotal + tax;
    try {
      const { transactionId } = await api.checkout(cart, total, payments, user?.id, activeShift?.id, selectedCustomer?.id, tax);
      setLastTransactionId(transactionId);
      setShowReceipt(true);
      setCart([]);
      setSelectedCustomer(null);
      loadProducts();
      setStatus({ type: 'success', message: 'Transaction successful' });
      setShowPayment(false);
    } catch (err) {
      setStatus({ type: 'error', message: 'Checkout failed' });
    }
  };

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const filteredProducts = useMemo(() => {
    let result = products;
    const term = searchTerm.trim();

    if (term) {
      if (term.startsWith('#')) {
        // Tag-specific filtering
        const tag = term.slice(1).toLowerCase();
        result = products.filter(p => 
          p.tags?.toLowerCase().split(',').some(t => t.trim().includes(tag)) ||
          p.category?.toLowerCase().includes(tag)
        );
      } else {
        // Fuzzy matching on name, description, and tags
        const fuse = new Fuse(products, {
          keys: [
            { name: 'name', weight: 1.0 },
            { name: 'description', weight: 0.7 },
            { name: 'tags', weight: 0.5 },
            { name: 'category', weight: 0.3 },
            { name: 'barcode', weight: 0.8 }
          ],
          threshold: 0.3,
          distance: 100,
          location: 0,
          includeMatches: true
        });
        result = fuse.search(term).map(r => r.item);
      }
    }

    return result.filter(p => {
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      const threshold = getProductThreshold(p, settings);
        
      const matchesStock = stockFilter === 'all' || 
        (stockFilter === 'low' && p.stock < threshold && p.stock > 0) ||
        (stockFilter === 'out' && p.stock <= 0);

      return matchesCategory && matchesStock;
    });
  }, [products, searchTerm, categoryFilter, stockFilter, settings]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'General'));
    return Array.from(cats);
  }, [products]);

  if (!user) {
    return <LoginScreen onLogin={handleLogin} settings={settings} />;
  }

  const userRole = user.role;
  console.log('Current user role:', userRole);

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden select-none">
      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ y: -100, x: '-50%', opacity: 0 }}
            animate={{ y: 20, x: '-50%', opacity: 1 }}
            exit={{ y: -100, x: '-50%', opacity: 0 }}
            className={`fixed top-0 left-1/2 -translate-x-1/2 z-[300] mt-6 px-8 py-4 rounded-[1.5rem] shadow-2xl font-black uppercase tracking-[0.2em] text-[10px] backdrop-blur-md ${
              status.type === 'success' ? 'bg-emerald-600/90 text-white shadow-emerald-200' : 'bg-rose-600/90 text-white shadow-rose-200'
            }`}
          >
            {status.type === 'success' ? '✓' : '✕'} {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-16 bg-white/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 md:hidden text-slate-500 hover:bg-slate-100/50 rounded-xl transition-colors"
          >
            <Filter className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-red-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-red-200/50">
            <Bug className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-800 hidden sm:block">RED <span className="text-red-500 font-black">ANT</span></h1>
        </div>
        <div className="flex items-center gap-3 md:gap-6">
          <div className="hidden md:flex items-center gap-2 bg-slate-100/50 pl-3 pr-1 py-1 rounded-2xl">
            <div className={`w-2 h-2 rounded-full ${user.role === 'manager' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mr-2">{user.role} Mode</span>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/80 rounded-lg mr-2 shadow-sm border border-red-100/50">
              <div className="w-1.5 h-1.5 bg-red-400 animate-pulse rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
              <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">Scanner Active</span>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4 pl-3 md:pl-6 bg-slate-50/50 px-4 py-2 rounded-2xl">
            <div className="text-right hidden sm:block">
              <div className="text-slate-900 font-bold text-sm truncate max-w-[100px]">{user.username}</div>
              <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{user.role}</div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-10 h-10 bg-white hover:bg-slate-50 rounded-2xl flex items-center justify-center font-black text-slate-400 hover:text-red-500 transition-all shadow-sm"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-2 md:p-4 gap-4 relative">
        {/* Responsive Mobile Sidebar Backdrop */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 md:hidden"
            />
          )}
        </AnimatePresence>

        {/* Sidebar Rail / Mobile Drawer */}
        <nav className={`
          fixed md:relative inset-y-0 left-0 w-64 md:flex flex-col gap-2 shrink-0 py-0 z-50 transition-transform md:translate-x-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          bg-white md:bg-white/50 border-r border-slate-100/50 backdrop-blur-md px-4 py-8 md:p-6
        `}>
          <div className="mb-8 px-2 hidden md:block">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Main Menu</h2>
          </div>

          <button 
            onClick={() => { setView('pos'); setIsSidebarOpen(false); }}
            className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'pos' ? 'bg-red-50 text-red-600 shadow-sm border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <motion.div whileHover={{ scale: 1.1, rotate: 5 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}>
              <ShoppingCart className="w-5 h-5 shrink-0" />
            </motion.div>
            <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">Register</span>
          </button>
          
          <button 
            onClick={() => { setShowShiftModal(true); setIsSidebarOpen(false); }}
            className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${activeShift ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <motion.div whileHover={{ scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
              <Banknote className="w-5 h-5 shrink-0" />
            </motion.div>
            <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">{activeShift ? 'Active Shift' : 'Open Shift'}</span>
          </button>

          {user.role === 'manager' && (
            <div className="mt-8 space-y-2">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-2">Management</h2>
              <button 
                onClick={() => { setView('products'); setIsSidebarOpen(false); }}
                className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'products' ? 'bg-red-50 text-red-600 shadow-sm border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <motion.div whileHover={{ scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                  <Package className="w-5 h-5 shrink-0" />
                </motion.div>
                <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">Inventory</span>
              </button>
              <button 
                onClick={() => { setView('transactions'); setIsSidebarOpen(false); }}
                className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'transactions' ? 'bg-red-50 text-red-600 shadow-sm border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <motion.div whileHover={{ scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                  <History className="w-5 h-5 shrink-0" />
                </motion.div>
                <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">Receipts</span>
              </button>
              <button 
                onClick={() => { setView('audit'); setIsSidebarOpen(false); }}
                className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'audit' ? 'bg-red-50 text-red-600 shadow-sm border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <motion.div whileHover={{ scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                  <ClipboardCheck className="w-5 h-5 shrink-0" />
                </motion.div>
                <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">Audit</span>
              </button>
              <button 
                onClick={() => { setView('reports'); setIsSidebarOpen(false); }}
                className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'reports' ? 'bg-red-50 text-red-600 shadow-sm border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <motion.div whileHover={{ scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                  <TrendingUp className="w-5 h-5 shrink-0" />
                </motion.div>
                <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">Metrics</span>
              </button>
              <button 
                onClick={() => { setView('customers'); setIsSidebarOpen(false); }}
                className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'customers' ? 'bg-red-50 text-red-600 shadow-sm border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <motion.div whileHover={{ scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                  <UserCircle className="w-5 h-5 shrink-0" />
                </motion.div>
                <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">Customers</span>
              </button>
              <button 
                onClick={() => { setView('suppliers'); setIsSidebarOpen(false); }}
                className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'suppliers' ? 'bg-red-50 text-red-600 shadow-sm border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <motion.div whileHover={{ scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                  <Truck className="w-5 h-5 shrink-0" />
                </motion.div>
                <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">Suppliers</span>
              </button>
              <button 
                onClick={() => { setView('expenses'); setIsSidebarOpen(false); }}
                className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'expenses' ? 'bg-red-50 text-red-600 shadow-sm border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <motion.div whileHover={{ scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                  <CreditCard className="w-5 h-5 shrink-0" />
                </motion.div>
                <span className="text-sm font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">Expenses</span>
              </button>
            </div>
          )}
          
          <div className="flex-1"></div>
          <button 
            onClick={() => { setView('settings'); setIsSidebarOpen(false); }}
            className={`w-full rounded-2xl flex items-center gap-4 px-5 py-4 transition-all duration-300 group ${view === 'settings' ? 'bg-slate-800 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <motion.div whileHover={{ rotate: 90 }} transition={{ duration: 0.5 }}>
              <Settings className="w-5 h-5 shrink-0" />
            </motion.div>
            <span className="text-sm font-black uppercase tracking-widest truncate group-hover:translate-x-1 transition-transform">Settings</span>
          </button>
        </nav>

        {view === 'pos' ? (
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* Catalog Grid */}
            <div className="flex-1 flex flex-col overflow-hidden gap-4">
              <div className="bg-white rounded-[2rem] p-5 flex flex-col gap-6 shadow-sm shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 bg-slate-50 px-6 py-3.5 rounded-2xl border border-slate-100/50">
                    <Search className="w-5 h-5 text-slate-400" />
                    <input 
                      type="text" 
                      id="pos-search"
                      data-search-input="true"
                      placeholder="Search items, categories, or barcodes..."
                      className="flex-1 bg-transparent border-none focus:outline-none text-slate-700 font-bold placeholder:text-slate-300"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchTerm.trim()) {
                          const match = products.find(p => 
                            p.barcode === searchTerm.trim() || 
                            p.id.toString() === searchTerm.trim()
                          );
                          if (match) {
                            addToCart(match);
                            setSearchTerm('');
                            setStatus({ type: 'success', message: `Added ${match.name}` });
                          }
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  <button 
                    onClick={() => setCategoryFilter('all')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${categoryFilter === 'all' ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                  >
                    All Items
                  </button>
                  {categories.map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${categoryFilter === cat ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Stock Filter */}
                <div className="flex gap-2 border-t border-slate-50 pt-4">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest flex items-center pr-2">Status:</span>
                  {(['all', 'low', 'out'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setStockFilter(f)}
                      className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${stockFilter === f ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    >
                      {f === 'all' ? 'All Stock' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max">
                {filteredProducts.map((product, idx) => (
                  <motion.div 
                    key={product.id}
                    whileTap={{ scale: 0.95 }}
                    animate={{ 
                      scale: recentlyAdded[product.id] ? [1, 0.98, 1.02, 1] : 1,
                      boxShadow: recentlyAdded[product.id] 
                        ? '0 20px 25px -5px rgba(16, 185, 129, 0.1), 0 10px 10px -5px rgba(16, 185, 129, 0.04)' 
                        : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    }}
                    transition={{ 
                      scale: { duration: 0.4, ease: "easeOut" },
                      boxShadow: { duration: 0.3 }
                    }}
                    className={`bg-white rounded-[2rem] p-5 flex flex-col justify-between shadow-sm cursor-pointer hover:shadow-xl hover:shadow-slate-200/50 transition-all border-2 ${
                      recentlyAdded[product.id] ? 'border-emerald-500' : 'border-transparent'
                    } ${product.stock <= 0 ? 'opacity-50' : ''} ${
                      idx % 7 === 0 ? 'lg:col-span-2 lg:row-span-1 bg-slate-50' : ''
                    } ${recentlyAdded[product.id] ? 'z-10' : ''}`}
                    onClick={() => addToCart(product)}
                  >
                    <div className="flex justify-between items-start">
                      <div className={`bg-white rounded-[1.5rem] flex items-center justify-center shadow-sm ${idx % 7 === 0 ? 'w-14 h-14 text-3xl' : 'w-12 h-12 text-2xl'}`}>
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover rounded-[1.5rem]" />
                        ) : (
                          <span>📦</span>
                        )}
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                        product.stock <= 0 ? 'bg-red-50 text-red-500' : 
                        product.stock < settings.low_stock_threshold ? 'bg-amber-50 text-amber-600 animate-pulse' : 
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {product.stock <= 0 ? 'OUT' : `x${product.stock}`}
                      </span>
                    </div>
                    <AnimatePresence>
                      {recentlyAdded[product.id] && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1.1 }}
                          exit={{ opacity: 0, scale: 1.5, transition: { duration: 0.2 } }}
                          transition={{ type: "spring", stiffness: 300, damping: 20 }}
                          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 bg-emerald-500/5 backdrop-blur-[2px] rounded-[2rem]"
                        >
                           <motion.div 
                             initial={{ y: 20 }}
                             animate={{ y: 0 }}
                             className="bg-emerald-500 text-white rounded-full p-3 shadow-xl ring-8 ring-emerald-500/20 mb-2"
                           >
                             <Check className="w-10 h-10 stroke-[3px]" />
                           </motion.div>
                           <motion.span 
                             initial={{ opacity: 0, y: 10 }}
                             animate={{ opacity: 1, y: 0 }}
                             className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full shadow-sm"
                           >
                             Added to Cart
                           </motion.span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="mt-5">
                      {product.stock < settings.low_stock_threshold && product.stock > 0 && (
                        <div className="flex items-center gap-1 mb-1">
                          <AlertCircle className="w-3 h-3 text-amber-500" />
                          <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Low Stock Alert</span>
                        </div>
                      )}
                      <div className={`font-bold text-slate-800 line-clamp-1 ${idx % 7 === 0 ? 'text-xl' : 'text-sm'}`}>{product.name}</div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">{product.category || 'Standard'}</div>
                      <div className="text-2xl font-black text-red-600 mt-2">₱{product.price.toFixed(2)}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Cart Sidebar */}
            <div className="w-80 flex flex-col gap-4">
              <div className="flex-1 bg-white rounded-[2.5rem] shadow-sm flex flex-col overflow-hidden transition-all">
                <div className="p-6 flex flex-col gap-4 bg-slate-50/50">
                  <div className="flex justify-between items-center">
                    <h2 className="font-black text-lg text-slate-800 tracking-tight">Order Queue</h2>
                    <div className="flex gap-2">
                      {drafts.length > 0 && (
                        <button 
                          onClick={() => {
                            const d = drafts[0];
                            resumeDraft(d);
                          }}
                          className="text-[10px] font-black bg-amber-50 px-3 py-1 rounded-xl shadow-sm text-amber-600 uppercase tracking-widest hover:bg-amber-100 transition-colors"
                        >
                          Resume Draft ({drafts.length})
                        </button>
                      )}
                      <span className="text-[10px] font-black bg-white px-3 py-1 rounded-xl shadow-sm text-slate-500 uppercase tracking-widest">{cart.length} Items</span>
                    </div>
                  </div>

                  {/* Customer Selection UI */}
                  <div className="relative">
                    {!selectedCustomer ? (
                      <button 
                        onClick={() => setShowCustomerSearch(true)}
                        className="w-full flex items-center justify-between px-5 py-3.5 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <UserCircle className="w-4 h-4" />
                          <span>Attach Customer</span>
                        </div>
                        <Plus className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-between px-5 py-3.5 bg-red-600 text-white rounded-2xl shadow-lg shadow-red-100">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                            <UserCircle className="w-5 h-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-widest truncate">{selectedCustomer.name}</div>
                            <div className="text-[8px] font-bold opacity-70 tracking-widest uppercase">{selectedCustomer.phone || selectedCustomer.email || 'Loyalty Member'}</div>
                          </div>
                        </div>
                        <button 
                          onClick={() => setSelectedCustomer(null)}
                          className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <AnimatePresence>
                      {showCustomerSearch && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 z-[100]"
                        >
                          <div className="flex items-center gap-3 border-b border-slate-50 pb-3 mb-3">
                            <Search className="w-4 h-4 text-slate-300" />
                            <input 
                              autoFocus
                              placeholder="Search by name or phone..."
                              className="w-full bg-transparent border-none focus:outline-none text-[10px] font-black uppercase tracking-widest"
                              onChange={(e) => {
                                const term = e.target.value.toLowerCase();
                                setCustomerSearch(term);
                              }}
                            />
                            <button onClick={() => setShowCustomerSearch(false)}>
                              <X className="w-4 h-4 text-slate-300" />
                            </button>
                          </div>
                          <div className="max-h-60 overflow-y-auto space-y-2 scrollbar-hide">
                            {filteredCustomers.map(c => (
                              <button 
                                key={c.id}
                                onClick={() => { setSelectedCustomer(c); setShowCustomerSearch(false); setCustomerSearch(''); }}
                                className="w-full text-left p-3 hover:bg-red-50 rounded-xl transition-colors flex items-center justify-between group"
                              >
                                <div>
                                  <div className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{c.name}</div>
                                  <div className="text-[8px] text-slate-400 font-bold tracking-widest uppercase">{c.phone || c.email}</div>
                                </div>
                                <div className="text-[8px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded uppercase tracking-widest">
                                  {c.points} PTS
                                </div>
                              </button>
                            ))}
                            {customers.length === 0 && (
                              <p className="text-center py-4 text-[10px] font-black text-slate-400 uppercase">No customers found</p>
                            )}
                            <button 
                              onClick={() => setView('customers')}
                              className="w-full p-3 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
                            >
                              Manage Customers
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                  <AnimatePresence initial={false}>
                    {cart.map(item => (
                      <motion.div 
                        key={item.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex justify-between items-start gap-4"
                      >
                        <div className="flex gap-4 flex-1 min-w-0">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0 text-xl shadow-sm">
                            🛒
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-black truncate text-slate-800 tracking-tight">{item.name}</div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, -1); }} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors">
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-black text-slate-800 min-w-[1.25rem] text-center">{item.quantity}</span>
                              <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, 1); }} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="font-black text-slate-800 text-sm tracking-tight">₱{(item.price * item.quantity).toFixed(2)}</div>
                          <button onClick={() => removeFromCart(item.id)} className="text-[10px] text-rose-500 font-black uppercase mt-1 tracking-widest">Remove</button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {cart.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 mt-12">
                      <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-6">
                        <ShoppingCart className="w-10 h-10" />
                      </div>
                      <p className="font-black uppercase tracking-[0.2em] text-[10px]">Queue Empty</p>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-slate-50/80 backdrop-blur-sm space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Subtotal</span>
                    <span className="font-black text-slate-800">₱{cart.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Tax ({settings.tax_rate.toFixed(2)}%)</span>
                    <span className="font-black text-slate-800">
                      ₱{(cart.reduce((sum, i) => sum + i.price * i.quantity, 0) * (settings.tax_rate / 100)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-3xl font-black mt-4 pt-4 border-t border-slate-200/50">
                    <span className="uppercase tracking-tighter text-slate-800">Total</span>
                    <span className="text-red-600">
                      ₱{(cart.reduce((sum, i) => sum + i.price * i.quantity, 0) * (1 + settings.tax_rate / 100)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-32 grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setCart([])}
                  disabled={cart.length === 0}
                  className="bg-white rounded-[2.5rem] font-black text-[10px] uppercase tracking-widest flex flex-col items-center justify-center gap-1 hover:bg-slate-50 shadow-sm disabled:opacity-50 transition-all active:scale-95 group overflow-hidden relative"
                >
                  <motion.div whileHover={{ y: -2, scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <Trash2 className="w-5 h-5 mb-1 text-rose-500 group-hover:text-rose-600 transition-colors" />
                  </motion.div>
                  <span className="relative z-10">Void Order</span>
                </button>
                <button 
                  onClick={holdDraft}
                  disabled={cart.length === 0}
                  className="bg-white rounded-[2.5rem] font-black text-[10px] uppercase tracking-widest flex flex-col items-center justify-center gap-1 hover:bg-slate-50 shadow-sm transition-all active:scale-95 disabled:opacity-50 group"
                >
                  <motion.div whileHover={{ y: -2, scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <History className="w-5 h-5 mb-1 text-amber-500 group-hover:text-amber-600 transition-colors" />
                  </motion.div>
                  <span>Hold Draft</span>
                </button>
                <motion.button 
                  disabled={cart.length === 0}
                  onClick={handleCheckout}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="col-span-2 bg-red-600 text-white rounded-[2.5rem] font-black text-xl flex items-center justify-center gap-3 shadow-xl shadow-red-200/50 hover:bg-red-500 disabled:bg-slate-300 disabled:shadow-none transition-all"
                >
                  Pay Now <ArrowRight className="w-6 h-6" />
                </motion.button>
              </div>
            </div>
          </div>
        ) : view === 'products' ? (
          <ProductManager products={products} suppliers={suppliers} onRefresh={loadProducts} setView={setView} settings={settings} />
        ) : view === 'transactions' ? (
          <TransactionHistory onRefresh={loadProducts} />
        ) : view === 'audit' ? (
          <InventoryAudit products={products} onRefresh={loadProducts} user={user} />
        ) : view === 'customers' ? (
          <CustomerManager customers={customers} onRefresh={loadCustomers} />
        ) : view === 'suppliers' ? (
          <SupplierManager />
        ) : view === 'expenses' ? (
          <ExpenseManager user={user} />
        ) : view === 'settings' ? (
          <SettingsManager settings={settings} onSave={loadSettings} />
        ) : (
          <ReportsView products={products} settings={settings} user={user} />
        )}
      </main>

      <AnimatePresence>
        {showReceipt && lastTransactionId && (
          <ReceiptModal 
            transactionId={lastTransactionId} 
            settings={settings}
            onClose={() => setShowReceipt(false)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPayment && !activeShift && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] p-10 max-w-md w-full text-center">
              <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <Lock className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-3">Shift Required</h3>
              <p className="text-slate-400 text-sm font-medium mb-8">You must open your cash drawer and start a shift before processing payments.</p>
              <button 
                onClick={() => { setShowPayment(false); setShowShiftModal(true); }}
                className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-red-200"
              >
                Open Shift Now
              </button>
            </motion.div>
          </div>
        )}

        {showPayment && activeShift && (
          <PaymentModal 
            total={cart.reduce((sum, i) => sum + i.price * i.quantity, 0) * (1 + settings.tax_rate / 100)} 
            onClose={() => setShowPayment(false)}
            onComplete={onCompleteCheckout}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShiftModal && (
          <ShiftModal 
            user={user} 
            activeShift={activeShift} 
            onClose={() => setShowShiftModal(false)}
            onUpdate={checkActiveShift}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsManager({ settings, onSave }: { settings: StoreSettings, onSave: () => void }) {
  const [formData, setFormData] = useState<StoreSettings>(settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showPrinterInstructions, setShowPrinterInstructions] = useState(false);

  useEffect(() => {
    setFormData(prev => ({ ...prev, ...settings }));
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    const result = settingsSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      await api.updateSettings(formData);
      onSave();
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="mb-6 flex justify-between items-center bg-white/50 backdrop-blur-md p-6 rounded-[2.5rem] shadow-sm shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">System Configuration</h2>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Store & Receipt Branding</p>
        </div>
      </header>

      <div className="flex-1 bg-white rounded-[2.5rem] overflow-y-auto shadow-sm p-4 scrollbar-hide">
        <form onSubmit={handleSubmit} className="p-8 max-w-2xl space-y-12">
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">Store Profile</h3>
            <div className="grid grid-cols-2 gap-8">
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Business Name</label>
                <input 
                  type="text" 
                  value={formData.store_name}
                  onChange={e => setFormData({ ...formData, store_name: e.target.value })}
                  className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700 ${errors.store_name ? 'ring-2 ring-rose-500/20' : ''}`}
                />
                {errors.store_name && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.store_name}</p>}
              </div>
               <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Display Logo URL</label>
                <input 
                  type="text" 
                  value={formData.logo_url}
                  onChange={e => setFormData({ ...formData, logo_url: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700 ${errors.logo_url ? 'ring-2 ring-rose-500/20' : ''}`}
                />
                {errors.logo_url && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.logo_url}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Support Phone</label>
                <input 
                  type="text" 
                  value={formData.store_phone}
                  onChange={e => setFormData({ ...formData, store_phone: e.target.value })}
                  className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700 ${errors.store_phone ? 'ring-2 ring-rose-500/20' : ''}`}
                />
                {errors.store_phone && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.store_phone}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Locality/Address</label>
                <input 
                  type="text" 
                  value={formData.store_address}
                  onChange={e => setFormData({ ...formData, store_address: e.target.value })}
                  className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700 ${errors.store_address ? 'ring-2 ring-rose-500/20' : ''}`}
                />
                {errors.store_address && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.store_address}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">Financials & Thresholds</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Sales Tax Rate (%)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={formData.tax_rate}
                  onChange={e => setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Global Low Stock Threshold</label>
                <input 
                  type="number" 
                  value={formData.low_stock_threshold}
                  onChange={e => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value) || 0 })}
                  className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700"
                />
              </div>
            </div>

            {/* Category-specific Thresholds */}
            <div className="mt-8">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Category Specific Thresholds</label>
              <div className="bg-slate-50 rounded-3xl p-6 space-y-4">
                {Object.entries(formData.category_thresholds || {}).map(([cat, val]) => (
                  <div key={cat} className="flex items-center gap-4">
                    <span className="flex-1 text-xs font-black text-slate-600 uppercase tracking-widest">{cat}</span>
                    <input 
                      type="number"
                      value={val}
                      onChange={e => {
                        const newThresholds = { ...(formData.category_thresholds || {}) };
                        newThresholds[cat] = parseInt(e.target.value) || 0;
                        setFormData({ ...formData, category_thresholds: newThresholds });
                      }}
                      className="w-24 px-4 py-2 bg-white border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/10 font-bold text-slate-700 text-center"
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        const newThresholds = { ...(formData.category_thresholds || {}) };
                        delete newThresholds[cat];
                        setFormData({ ...formData, category_thresholds: newThresholds });
                      }}
                      className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                <div className="flex gap-2 pt-4 border-t border-slate-200">
                  <input id="new-cat-name" placeholder="Category Name" className="flex-1 px-4 py-2 text-xs font-bold rounded-xl outline-none" />
                  <button 
                    type="button" 
                    onClick={() => {
                      const input = document.getElementById('new-cat-name') as HTMLInputElement;
                      if (!input.value) return;
                      const newThresholds = { ...(formData.category_thresholds || {}), [input.value]: formData.low_stock_threshold };
                      setFormData({ ...formData, category_thresholds: newThresholds });
                      input.value = '';
                    }}
                    className="p-2 bg-slate-800 text-white rounded-xl"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tag-specific Thresholds */}
            <div className="mt-8">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Tag Specific Thresholds</label>
              <div className="bg-slate-50 rounded-3xl p-6 space-y-4">
                {Object.entries(formData.tag_thresholds || {}).map(([tag, val]) => (
                  <div key={tag} className="flex items-center gap-4">
                    <span className="flex-1 text-xs font-black text-blue-600 uppercase tracking-widest">#{tag}</span>
                    <input 
                      type="number"
                      value={val}
                      onChange={e => {
                        const newThresholds = { ...(formData.tag_thresholds || {}) };
                        newThresholds[tag] = parseInt(e.target.value) || 0;
                        setFormData({ ...formData, tag_thresholds: newThresholds });
                      }}
                      className="w-24 px-4 py-2 bg-white border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/10 font-bold text-slate-700 text-center"
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        const newThresholds = { ...(formData.tag_thresholds || {}) };
                        delete newThresholds[tag];
                        setFormData({ ...formData, tag_thresholds: newThresholds });
                      }}
                      className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                <div className="flex gap-2 pt-4 border-t border-slate-200">
                  <input id="new-tag-name" placeholder="Tag Name (e.g. sale)" className="flex-1 px-4 py-2 text-xs font-bold rounded-xl outline-none" />
                  <button 
                    type="button" 
                    onClick={() => {
                      const input = document.getElementById('new-tag-name') as HTMLInputElement;
                      if (!input.value) return;
                      const tag = input.value.replace('#', '').trim().toLowerCase();
                      const newThresholds = { ...(formData.tag_thresholds || {}), [tag]: formData.low_stock_threshold };
                      setFormData({ ...formData, tag_thresholds: newThresholds });
                      input.value = '';
                    }}
                    className="p-2 bg-slate-800 text-white rounded-xl"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Manager Notification Email */}
            <div className="mt-8">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Manager Alert Channel (Email)</label>
              <input 
                type="email" 
                value={formData.manager_email || ''}
                onChange={e => setFormData({ ...formData, manager_email: e.target.value })}
                placeholder="manager@example.com"
                className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700 ${errors.manager_email ? 'ring-2 ring-rose-500/20' : ''}`}
              />
              {errors.manager_email && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.manager_email}</p>}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">Receipt Template</h3>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Display Mode</label>
                <select 
                  value={formData.receipt_layout}
                  onChange={e => setFormData({ ...formData, receipt_layout: e.target.value as any })}
                  className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700 cursor-pointer"
                >
                  <option value="standard">Standard Full</option>
                  <option value="compact">Compact Mini</option>
                </select>
              </div>
              <div className="flex items-end pb-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox"
                    checked={Boolean(formData.show_tax_id)}
                    onChange={e => setFormData({ ...formData, show_tax_id: e.target.checked })}
                    className="w-5 h-5 rounded-lg border-none bg-slate-200 text-indigo-600 focus:ring-indigo-500/20"
                  />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Show Tax Identity</span>
                </label>
              </div>
              {formData.show_tax_id && (
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Government Tax ID</label>
                  <input 
                    type="text" 
                    value={formData.tax_id}
                    onChange={e => setFormData({ ...formData, tax_id: e.target.value })}
                    placeholder="VAT # / TIN #"
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Footer Message</label>
              <textarea 
                value={formData.receipt_footer}
                onChange={e => setFormData({ ...formData, receipt_footer: e.target.value })}
                className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-700 min-h-[120px] resize-none"
              />
            </div>
          </div>
          
          <div className="space-y-6 pt-12 border-t border-slate-100">
            <h3 className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">Hardware Integration</h3>
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 ring-4 ring-slate-50">
              <div className="flex items-center gap-6 mb-6">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <Smartphone className="w-6 h-6 text-slate-800" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Thermal Receipt Printer</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ESC/POS Compatibility</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowPrinterInstructions(true)}
                className="w-full py-4 bg-white hover:bg-slate-100 text-slate-800 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all border border-slate-200 shadow-sm"
              >
                View Setup Guide
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={saving}
            className="px-12 py-5 bg-slate-800 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-slate-200 hover:bg-slate-900 disabled:opacity-50 transition-all active:scale-[0.98] w-full md:w-auto"
          >
            {saving ? 'Synchronizing...' : 'Commit Changes'}
          </button>
        </form>
      </div>

      {showPrinterInstructions && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[3rem] p-10 w-full max-w-2xl shadow-2xl relative overflow-y-auto max-h-[90vh]"
          >
            <button 
              onClick={() => setShowPrinterInstructions(false)}
              className="absolute top-8 right-8 p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Thermal Printer Setup</h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-12">Detailed Integration Guide</p>
            
            <div className="space-y-12 flex-1">
              <section className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-red-50 text-red-600 rounded-xl flex items-center justify-center font-black text-xs">01</div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Connection</h4>
                </div>
                <div className="pl-12 text-sm text-slate-600 space-y-2 leading-relaxed">
                  <p>Connect your <span className="font-bold">ESC/POS compatible</span> printer via USB or Network. Install the generic text-only driver or the official manufacturer driver provided with your hardware.</p>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-red-50 text-red-600 rounded-xl flex items-center justify-center font-black text-xs">02</div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Browser Configuration</h4>
                </div>
                <div className="pl-12 text-sm text-slate-600 space-y-4 leading-relaxed">
                  <div>
                    <p className="font-bold mb-1">Google Chrome (Recommended):</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Use "Thermal Print" button for direct POS formatting.</li>
                      <li>In Browser Print Settings, set <span className="font-bold">Margins to "None"</span>.</li>
                      <li>Disable <span className="font-bold">Headers and Footers</span>.</li>
                      <li>Set Scale to <span className="font-bold">100%</span> or "Fit to width".</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-4 bg-amber-50 p-8 rounded-3xl border border-amber-100">
                <div className="flex items-center gap-4 text-amber-600">
                  <AlertTriangle className="w-5 h-5" />
                  <h4 className="text-xs font-black uppercase tracking-widest">Self-Hosted / Advanced</h4>
                </div>
                <p className="text-xs text-amber-800 mt-4 leading-relaxed font-medium">To enable "Silent Printing" (skipping the print dialog), add the <code className="bg-amber-100 px-1 rounded">--kiosk-printing</code> flag to your browser's startup command.</p>
              </section> section
            </div>

            <button 
              onClick={() => setShowPrinterInstructions(false)}
              className="mt-12 w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl"
            >
              Acknowledged
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function TransactionHistory({ onRefresh }: { onRefresh: () => void }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [voidingTxId, setVoidingTxId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isCustomReason, setIsCustomReason] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getTransactions();
      setHistory(data);
    } catch (_err) {
      // console.error(_err);
    } finally {
      setLoading(false);
    }
   }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidingTxId || !voidReason.trim()) return;

    try {
      await api.voidTransaction(voidingTxId, voidReason);
      setVoidingTxId(null);
      setVoidReason('');
      setIsCustomReason(false);
      loadHistory();
      onRefresh();
    } catch (err) {
      alert('Void failed');
    }
  };

  const voidReasons = [
    'Erroneous Entry',
    'Customer Change of Mind',
    'Return/Exchange',
    'System Error',
    'Incorrect Payment Method'
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="mb-6 flex justify-between items-center bg-white/50 backdrop-blur-md p-6 rounded-[2.5rem] shadow-sm shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Audit History</h2>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest">System Transaction Log</p>
        </div>
      </header>
      
      <div className="flex-1 bg-white rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col p-2">
        <div className="overflow-x-auto overflow-y-auto scrollbar-hide">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest sticky top-0 bg-white">
              <tr>
                <th className="px-8 py-5">TX ID</th>
                <th className="px-8 py-5">Timestamp</th>
                <th className="px-8 py-5 text-right">Total Amount</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {history.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-50/80 group transition-colors">
                  <td className="px-8 py-6 font-black text-slate-400 text-xs tracking-tighter">#{tx.id.toString().padStart(6, '0')}</td>
                  <td className="px-8 py-6 text-xs font-black text-slate-600">{new Date(tx.created_at).toLocaleString()}</td>
                  <td className="px-8 py-6 text-right font-black text-red-600 text-lg tracking-tight">₱{tx.total.toFixed(2)}</td>
                  <td className="px-8 py-6 text-right">
                    {tx.status === 'void' ? (
                      <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest px-4 py-2 bg-rose-50/50 rounded-xl">Voided: {tx.void_reason}</span>
                    ) : (
                      <button 
                        onClick={() => setVoidingTxId(tx.id)}
                        className="px-4 py-2 bg-rose-50 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-95"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && !loading && (
            <div className="py-32 text-center text-slate-300">
              <History className="w-16 h-16 mx-auto mb-6 opacity-30" />
              <p className="font-black uppercase tracking-[0.2em] text-[10px]">No records found</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {voidingTxId && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[300] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="p-8 pb-4 flex justify-between items-center">
                <h3 className="font-black text-xl text-slate-800 uppercase tracking-tighter">Void Transaction #{voidingTxId}</h3>
                <button onClick={() => { setVoidingTxId(null); setVoidReason(''); setIsCustomReason(false); }} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              
              <form onSubmit={handleVoidSubmit} className="p-8 pt-4 space-y-6">
                <div className="flex items-center justify-center w-20 h-20 bg-rose-50 rounded-[2rem] mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-rose-500" />
                </div>
                
                <div className="text-center mb-4">
                  <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Select Void Reason</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">This action cannot be undone</p>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {voidReasons.map(reason => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => { setVoidReason(reason); setIsCustomReason(false); }}
                      className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-left transition-all ${voidReason === reason && !isCustomReason ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                    >
                      {reason}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setIsCustomReason(true); setVoidReason(''); }}
                    className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-left transition-all ${isCustomReason ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                  >
                    Custom Reason...
                  </button>
                </div>

                {isCustomReason && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <input 
                      type="text"
                      required
                      placeholder="Type custom reason..."
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-rose-500/5 font-bold text-slate-700 text-sm"
                      value={voidReason}
                      onChange={e => setVoidReason(e.target.value)}
                      autoFocus
                    />
                  </motion.div>
                )}

                <button 
                  type="submit"
                  disabled={!voidReason.trim()}
                  className="w-full py-5 bg-rose-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] shadow-xl shadow-rose-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  Confirm Void & Restore Stock
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaymentModal({ total, onClose, onComplete }: { total: number, onClose: () => void, onComplete: (payments: { type: string, amount: number }[]) => void }) {
  const [payments, setPayments] = useState<{ type: string, amount: number }[]>([]);
  const [selectedType, setSelectedType] = useState<string>('cash');
  const [amountInput, setAmountInput] = useState<string>(total.toFixed(2));
  
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, total - totalPaid);

  useEffect(() => {
    setAmountInput(remaining.toFixed(2));
  }, [remaining]);

  const addPayment = () => {
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) return;
    
    setPayments(prev => [...prev, { type: selectedType, amount: Math.min(amount, remaining) }]);
    setAmountInput('0');
  };

  const removePayment = (index: number) => {
    setPayments(prev => prev.filter((_, i) => i !== index));
  };

  const paymentTypes = [
    { id: 'cash', label: 'Cash', icon: Banknote, color: 'bg-emerald-500' },
    { id: 'card', label: 'Credit Card', icon: CreditCard, color: 'bg-blue-500' },
    { id: 'mobile', label: 'Mobile Pay', icon: Smartphone, color: 'bg-purple-500' },
  ];

  const handleFinalize = () => {
    if (remaining > 0.01) {
      if (confirm(`Outstanding balance: ₱${remaining.toFixed(2)}. Complete as ${selectedType}?`)) {
        onComplete([...payments, { type: selectedType, amount: remaining }]);
      }
    } else {
      onComplete(payments);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Checkout</h2>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Multi-payment Allocation</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 flex flex-col md:flex-row gap-8">
          <div className="flex-1 space-y-8">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Payment Method</label>
              <div className="grid grid-cols-1 gap-3">
                {paymentTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`flex items-center gap-4 p-4 rounded-[1.5rem] transition-all border-2 text-left ${selectedType === type.id ? 'border-red-600 bg-red-50/50 shadow-md translate-x-1' : 'border-slate-50 border-transparent hover:bg-slate-50'}`}
                  >
                    <div className={`w-12 h-12 ${type.color} rounded-2xl flex items-center justify-center text-white shadow-lg`}>
                      <type.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-black text-slate-800 uppercase tracking-tight text-sm">{type.label}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Standard Transaction</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Amount Allocation</label>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300">₱</span>
                  <input 
                    autoFocus
                    type="number" 
                    step="0.01"
                    className="w-full bg-slate-50 border-none px-12 py-5 rounded-2xl text-2xl font-black text-slate-800 focus:outline-none focus:ring-4 focus:ring-red-500/5 transition-all"
                    value={amountInput}
                    onChange={e => setAmountInput(e.target.value)}
                  />
                </div>
                <button 
                   onClick={addPayment}
                   className="px-8 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-900 transition-all active:scale-95"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>

          <div className="w-full md:w-72 bg-slate-50 rounded-[2rem] p-6 flex flex-col">
            <div className="mb-6">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Due</div>
              <div className="text-3xl font-black text-slate-800 tracking-tighter">₱{total.toFixed(2)}</div>
            </div>

            <div className="flex-1 space-y-3 mb-6 overflow-y-auto pr-2 scrollbar-hide">
              {payments.map((p, i) => (
                <div key={i} className="bg-white p-3 rounded-xl flex justify-between items-center shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${paymentTypes.find(t => t.id === p.type)?.color || 'bg-slate-400'}`}></div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight">{p.type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-slate-800 tracking-tight">₱{p.amount.toFixed(2)}</span>
                    <button onClick={() => removePayment(i)} className="text-rose-500 hover:text-rose-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {payments.length === 0 && (
                <div className="text-center py-8 text-slate-300">
                  <Split className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed">No partial payments<br/>added yet</p>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-6 border-t border-slate-100">
              <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>Remaining</span>
                <span className={remaining > 0 ? 'text-red-500' : 'text-emerald-500'}>₱{remaining.toFixed(2)}</span>
              </div>
              <button 
                onClick={handleFinalize}
                className="w-full py-5 bg-red-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-red-200 active:scale-95 transition-all"
              >
                Complete Payment
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ReceiptModal({ transactionId, settings, onClose }: { transactionId: number, settings: StoreSettings, onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [transaction, setTransaction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState<'standard' | 'thermal'>('standard');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [itemsData, txData, paymentsData] = await Promise.all([
          api.getTransactionItems(transactionId),
          api.getTransaction(transactionId),
          api.getTransactionPayments(transactionId)
        ]);
        setItems(itemsData);
        setTransaction(txData);
        setPayments(paymentsData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [transactionId]);

  const handlePrint = (mode: 'standard' | 'thermal') => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const grandTotal = transaction?.total || subtotal;
  const tax = grandTotal - subtotal;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden flex flex-col shadow-2xl"
      >
        <div id="receipt" className={`p-8 pb-4 flex-1 ${printMode === 'thermal' ? 'thermal-mode' : ''}`}>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-300 font-black uppercase tracking-widest text-[10px]">Processing...</div>
          ) : (
            <>
              <div className="text-center mb-8">
                {settings.logo_url && printMode === 'standard' && (
                  <img src={settings.logo_url} alt="Logo" className="w-16 h-16 mx-auto mb-4 object-contain" />
                )}
                <h2 className="text-2xl font-black uppercase tracking-tighter">{settings.store_name}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{settings.store_address}</p>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{settings.store_phone}</p>
                {settings.show_tax_id && settings.tax_id && (
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1 opacity-60">Tax ID: {settings.tax_id}</p>
                )}
                
                {printMode === 'thermal' && <div className="mt-2 border-b border-dashed border-black"></div>}

                <div className={`mt-6 border-y border-dashed border-slate-100 ${settings.receipt_layout === 'compact' ? 'py-2' : 'py-5'} ${printMode === 'thermal' ? 'border-black' : ''}`}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 py-1 bg-slate-50 rounded-full w-fit mx-auto mb-2 opacity-60 print:bg-transparent">Verified TX Record</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">ID: #{transactionId.toString().padStart(6, '0')}</p>
                  <p className="text-[8px] font-black text-slate-300 mt-0.5 uppercase tracking-widest">{transaction?.created_at ? new Date(transaction.created_at).toLocaleString() : 'Processing...'}</p>
                  {transaction?.customer_id && (
                    <div className="mt-2 py-1 px-3 bg-red-50 rounded-xl inline-block print:bg-transparent print:border print:border-black">
                      <p className="text-[10px] font-black text-red-600 uppercase tracking-widest print:text-black">
                        Customer: {transaction.customer_name || 'Loyalty Member'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 mb-8">
                {printMode === 'thermal' && (
                  <div className="flex justify-between font-black text-[10px] border-b border-dashed border-black pb-1 mb-2">
                    <span>ITEM</span>
                    <span>PRICE</span>
                  </div>
                )}
                {items.map(item => (
                  <div key={item.id} className="flex justify-between items-start text-xs">
                    <div className="flex-1">
                      <p className="font-black uppercase tracking-tight text-slate-800 print:text-black">{item.name}</p>
                      <p className="text-slate-400 print:text-black">{item.quantity} x ₱{item.price.toFixed(2)}</p>
                    </div>
                    <p className="font-black text-slate-800 print:text-black">₱{(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              <div className={`border-t border-dashed border-slate-100 pt-6 space-y-3 ${printMode === 'thermal' ? 'border-black' : ''}`}>
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black">
                  <span>Subtotal</span>
                  <span>₱{subtotal.toFixed(2)}</span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black">
                    <span>Tax</span>
                    <span>₱{tax.toFixed(2)}</span>
                  </div>
                )}
                <div className={`flex justify-between font-black uppercase tracking-tight text-red-600 pt-4 border-t border-slate-100 print:text-black print:border-black ${printMode === 'thermal' ? 'text-lg' : 'text-2xl'}`}>
                  <span>Total</span>
                  <span>₱{grandTotal.toFixed(2)}</span>
                </div>

                {payments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-50 space-y-1 print:border-black">
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2 print:text-black">Payment Breakdown</p>
                    {payments.map((p, i) => (
                      <div key={i} className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-tight print:text-black">
                        <span>{p.type}</span>
                        <span>₱{p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-8 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest whitespace-pre-wrap print:text-black">
                <p>{settings.receipt_footer}</p>
              </div>
              {printMode === 'thermal' && <div className="mt-8">.</div>}
            </>
          )}
        </div>

        <div className="p-8 pt-0 flex flex-col gap-3 print:hidden">
          <div className="flex gap-2">
            <button 
              onClick={() => handlePrint('standard')}
              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors"
            >
              Standard Print
            </button>
            <button 
              onClick={() => handlePrint('thermal')}
              className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-100 hover:bg-red-700 transition-colors"
            >
              Thermal Print
            </button>
          </div>
          <button 
            onClick={onClose}
            className="w-full py-4 bg-white border border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function InventoryAudit({ products, onRefresh, user }: { products: Product[], onRefresh: () => void, user: any }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [auditingProduct, setAuditingProduct] = useState<Product | null>(null);
  const [actualStock, setActualStock] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [filterProductId, setFilterProductId] = useState('');

  const loadAudits = useCallback(async () => {
    try {
      const data = await api.getAuditLogs({
        product_id: filterProductId ? parseInt(filterProductId) : undefined,
        start_date: dateStart,
        end_date: dateEnd
      });
      setLogs(data);
    } catch (_err) {
      // console.error(_err);
    }
  }, [filterProductId, dateStart, dateEnd]);

  useEffect(() => {
    loadAudits();

    const handleBarcode = (e: any) => {
      const match = e.detail;
      setAuditingProduct(match);
      setAuditSearch('');
    };

    window.addEventListener('barcode-scanned', handleBarcode);
    return () => window.removeEventListener('barcode-scanned', handleBarcode);
  }, [loadAudits]);

  const handlePerformAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditingProduct) return;
    setLoading(true);
    try {
      await api.performAudit({
        product_id: auditingProduct.id,
        actual_stock: parseInt(actualStock) || 0,
        reason: reason || 'Routine reconciliation',
        user_id: user.id
      });
      setAuditingProduct(null);
      setActualStock('');
      setReason('');
      onRefresh();
      loadAudits();
    } catch (err) {
      alert('Audit failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const term = auditSearch.trim();
    if (!term) return products;

    if (term.startsWith('#')) {
      const tag = term.slice(1).toLowerCase();
      return products.filter(p => 
        p.tags?.toLowerCase().split(',').some(t => t.trim().includes(tag)) ||
        p.category?.toLowerCase().includes(tag)
      );
    }

    const fuse = new Fuse(products, {
      keys: [
        { name: 'name', weight: 1.0 },
        { name: 'description', weight: 0.7 },
        { name: 'barcode', weight: 0.9 },
        { name: 'tags', weight: 0.5 }
      ],
      threshold: 0.3,
      distance: 100,
      location: 0
    });
    return fuse.search(term).map(r => r.item);
  }, [products, auditSearch]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="mb-6 flex justify-between items-center bg-white/50 backdrop-blur-md p-6 rounded-[2.5rem] shadow-sm shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Stock Reconciliation</h2>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Inventory Auditing Module</p>
        </div>
      </header>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Audit Tool */}
        <div className="flex-1 bg-white rounded-[2.5rem] shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center gap-4">
            <div className="flex-1 flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl">
              <Search className="w-5 h-5 text-slate-400" />
              <input 
                type="text" 
                data-search-input="true"
                placeholder="Product/Barcode for audit..."
                className="bg-transparent border-none focus:outline-none text-xs font-black text-slate-600 w-full"
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && auditSearch.trim()) {
                    const match = products.find(p => 
                      p.barcode === auditSearch.trim() || 
                      p.id.toString() === auditSearch.trim()
                    );
                    if (match) {
                      setAuditingProduct(match);
                      setAuditSearch('');
                    }
                  }
                }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredProducts.map(p => (
              <div 
                key={p.id}
                onClick={() => { setAuditingProduct(p); setActualStock(p.stock.toString()); }}
                className={`p-4 rounded-2xl flex justify-between items-center cursor-pointer transition-all ${auditingProduct?.id === p.id ? 'bg-red-50 border-2 border-red-100 shadow-sm' : 'hover:bg-slate-50'}`}
              >
                <div>
                  <div className="font-black text-slate-800 text-sm tracking-tight">{p.name}</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.barcode || 'NO SKU'}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-600">{p.stock} In System</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Form / Results */}
        <div className="w-96 flex flex-col gap-6">
          <div className="flex-1 bg-white rounded-[2.5rem] shadow-sm p-8 flex flex-col">
            {auditingProduct ? (
              <form onSubmit={handlePerformAudit} className="space-y-6">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg mb-6">Audit: {auditingProduct.name}</h3>
                
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Actual Count</label>
                  <input 
                    type="number"
                    required
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-red-500/5 font-black text-slate-800"
                    value={actualStock}
                    onChange={e => setActualStock(e.target.value)}
                  />
                  <p className="mt-2 text-[10px] font-black text-slate-400">System expect: {auditingProduct.stock}</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Audit Reason</label>
                  <select 
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none font-black text-slate-800"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  >
                    <option value="">Routine Count</option>
                    <option value="Damaged Stock">Damaged Stock</option>
                    <option value="Expired">Expired</option>
                    <option value="Missing/Theft">Missing/Theft</option>
                    <option value="Misc Error">Misc Error</option>
                  </select>
                </div>

                <button 
                  disabled={loading}
                  type="submit"
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-red-200 active:scale-95 disabled:opacity-50 transition-all"
                >
                  {loading ? 'Reconciling...' : 'Confirm Reconciliation'}
                </button>
              </form>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-200 text-center">
                <ClipboardCheck className="w-16 h-16 mb-6 opacity-20" />
                <p className="font-black uppercase tracking-widest text-[10px]">Select a SKU to begin audit</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-sm p-6 overflow-hidden flex flex-col h-1/2">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Adjustment Logs</h3>
              <div className="flex gap-2">
                <input 
                  type="date" 
                  value={dateStart} 
                  onChange={e => setDateStart(e.target.value)}
                  className="bg-slate-50 border-none rounded-lg text-[8px] font-black uppercase p-1 focus:outline-none"
                />
                <input 
                  type="date" 
                  value={dateEnd} 
                  onChange={e => setDateEnd(e.target.value)}
                  className="bg-slate-50 border-none rounded-lg text-[8px] font-black uppercase p-1 focus:outline-none"
                />
              </div>
            </div>
            
            <div className="mb-4">
              <select 
                value={filterProductId}
                onChange={e => setFilterProductId(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase p-2 tracking-widest focus:outline-none"
              >
                <option value="">All Products</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
              {logs.map(log => (
                <div key={log.id} className="p-3 bg-slate-50 rounded-xl">
                  <div className="flex justify-between items-start">
                    <span className="font-black text-slate-800 text-[10px] tracking-tight truncate max-w-[140px] uppercase">{log.product_name}</span>
                    <span className={`text-[10px] font-black ${log.discrepancy < 0 ? 'text-red-500' : log.discrepancy > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {log.discrepancy > 0 ? '+' : ''}{log.discrepancy}
                    </span>
                  </div>
                  <div className="flex justify-between items-end mt-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{log.reason}</span>
                    <span className="text-[8px] font-black text-slate-300 uppercase">{new Date(log.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortIndicator({ column, sortConfig }: { column: string, sortConfig: any }) {
  if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" />;
  return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-emerald-500" /> : <ChevronDown className="w-3 h-3 text-emerald-500" />;
}

function CustomerManager({ customers, onRefresh }: { customers: Customer[], onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({});

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.addCustomer(formData);
      onRefresh();
      setShowAdd(false);
      setFormData({});
    } catch (err) {
      alert('Error saving customer');
    }
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-hidden flex flex-col">
      <div className="flex justify-between items-center bg-white/80 p-8 rounded-[2.5rem] shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight text-red-600">Customer Base</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Manage Loyalty & Credits</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-red-600 text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-red-200 active:scale-95 transition-all">
          Register Customer
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm p-4 flex-1 overflow-hidden">
        <table className="w-full text-left">
          <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 rounded-xl">
            <tr>
              <th className="p-6">Name</th>
              <th className="p-6">Contact</th>
              <th className="p-6">Store Credit</th>
              <th className="p-6 text-right">Loyalty Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {customers.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-6 font-black text-slate-800">{c.name}</td>
                <td className="p-6 text-[10px] font-black text-slate-400">
                  <div>{c.phone}</div>
                  <div>{c.email}</div>
                </td>
                <td className="p-6">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600`}>
                    ₱{c.store_credit.toFixed(2)}
                  </span>
                </td>
                <td className="p-6 text-right font-black text-red-600">{c.points} PTS</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[3rem] p-10 w-full max-w-md">
            <h3 className="text-2xl font-black text-slate-800 mb-8 uppercase tracking-tight">New Customer</h3>
            <form onSubmit={handleSave} className="space-y-6">
              <input 
                placeholder="Full Name"
                className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none"
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <input 
                placeholder="Phone Number"
                className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none"
                value={formData.phone || ''}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
              <input 
                placeholder="Email Address"
                className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none"
                value={formData.email || ''}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-100">Save Customer</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function SupplierManager() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'pos'>('list');
  const [showAdd, setShowAdd] = useState(false);
  const [showAddPO, setShowAddPO] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<Partial<Supplier>>({});
  const [poFormData, setPOFormData] = useState<{ supplier_id: number, items: any[] }>({ supplier_id: 0, items: [] });
  const [products, setProducts] = useState<Product[]>([]);

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await api.getSuppliers();
      setSuppliers(data);
    } catch (_err) { /* ignore */ }
  }, []);

  const loadPOs = useCallback(async () => {
    try {
      const data = await api.getPurchaseOrders();
      setPos(data);
    } catch (_err) { /* ignore */ }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (_err) { /* ignore */ }
  }, []);

  useEffect(() => { 
    loadSuppliers(); 
    loadPOs();
    loadProducts();
  }, [loadSuppliers, loadPOs, loadProducts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateSupplier(editing.id, formData);
      } else {
        await api.addSupplier(formData);
      }
      loadSuppliers();
      setShowAdd(false);
      setEditing(null);
      setFormData({});
    } catch (_err) {
      alert('Failed to save supplier');
    }
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poFormData.supplier_id || poFormData.items.length === 0) return;
    try {
      await api.createPurchaseOrder(poFormData);
      loadPOs();
      setShowAddPO(false);
      setPOFormData({ supplier_id: 0, items: [] });
      alert('Purchase Order Created Successfully');
    } catch (_err) {
      alert('Failed to create PO');
    }
  };

  const deleteSupplier = async (id: number) => {
    if (!confirm('Are you sure? This will not delete historical records but will remove the supplier from active list.')) return;
    try {
      await api.deleteSupplier(id);
      loadSuppliers();
    } catch (_err) {
      alert('Failed to delete supplier');
    }
  };

  const updatePOStatus = async (id: number, status: string) => {
    try {
      await api.updatePOStatus(id, status);
      loadPOs();
      alert(`PO marked as ${status}`);
    } catch (_err) {
      alert('Failed to update PO');
    }
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-hidden flex flex-col">
       <div className="flex justify-between items-center bg-white/80 p-8 rounded-[2.5rem] shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight text-red-600">Supplier Network</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Supply Chain & POs</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => { setShowAddPO(true); setPOFormData({ supplier_id: suppliers[0]?.id || 0, items: [] }); }} 
            className="bg-slate-900 text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 active:scale-95 transition-all flex items-center gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            Generate PO
          </button>
          <button onClick={() => { setEditing(null); setFormData({}); setShowAdd(true); }} className="bg-red-600 text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-red-200 active:scale-95 transition-all">
            Add Supplier
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={() => setActiveTab('list')}
          className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'list' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
        >
          Suppliers
        </button>
        <button 
          onClick={() => setActiveTab('pos')}
          className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'pos' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
        >
          Purchase Orders
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm p-4 flex-1 overflow-hidden flex flex-col">
        {activeTab === 'list' ? (
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left">
              <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 rounded-xl sticky top-0">
                <tr>
                  <th className="p-6">Company</th>
                  <th className="p-6">Contact Person</th>
                  <th className="p-6">Contact Info</th>
                  <th className="p-6">Address</th>
                  <th className="p-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {suppliers.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-6 font-black text-slate-800 uppercase text-[10px] tracking-widest">{s.name}</td>
                    <td className="p-6 font-bold text-slate-600">{s.contact_person}</td>
                    <td className="p-6 text-[10px] font-black text-slate-400">
                      <div>{s.phone}</div>
                      <div>{s.email}</div>
                    </td>
                    <td className="p-6 text-[10px] font-bold text-slate-400 overflow-hidden text-ellipsis max-w-xs">{s.address}</td>
                    <td className="p-6 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditing(s); setFormData(s); setShowAdd(true); }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteSupplier(s.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left">
              <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 rounded-xl sticky top-0">
                <tr>
                  <th className="p-6">PO #</th>
                  <th className="p-6">Supplier</th>
                  <th className="p-6">Date</th>
                  <th className="p-6">Amount</th>
                  <th className="p-6">Status</th>
                  <th className="p-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pos.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-6 font-black text-slate-800 uppercase text-[10px] tracking-widest">#{po.id.toString().padStart(6, '0')}</td>
                    <td className="p-6 font-bold text-slate-600">{po.supplier_name}</td>
                    <td className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(po.created_at).toLocaleDateString()}</td>
                    <td className="p-6 font-black text-slate-800">₱{po.total_amount.toFixed(2)}</td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                        po.status === 'received' ? 'bg-emerald-100 text-emerald-600' : 
                        po.status === 'cancelled' ? 'bg-red-100 text-red-600' : 
                        'bg-amber-100 text-amber-600'
                      }`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      {po.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => updatePOStatus(po.id, 'received')}
                            className="bg-emerald-600 text-white px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-sm hover:bg-emerald-700"
                          >
                            Mark Received
                          </button>
                          <button 
                            onClick={() => updatePOStatus(po.id, 'cancelled')}
                            className="bg-slate-100 text-slate-400 px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[3rem] p-10 w-full max-w-md shadow-2xl">
            <h3 className="text-2xl font-black text-slate-800 mb-8 uppercase tracking-tight">{editing ? 'Edit Supplier' : 'New Supplier'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4">Company Name</label>
                <input placeholder="Company Name" className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4">Contact Person</label>
                <input placeholder="Contact Person" className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none" value={formData.contact_person || ''} onChange={e => setFormData({ ...formData, contact_person: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4">Phone</label>
                  <input placeholder="Phone" className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4">Email</label>
                  <input placeholder="Email" className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4">Address</label>
                <textarea placeholder="Address" className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none min-h-[100px]" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-100">Save Supplier</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showAddPO && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[3rem] p-10 w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Create Purchase Order</h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8">Restock Inventory from Suppliers</p>
            
            <form onSubmit={handleCreatePO} className="space-y-6 flex-1 flex flex-col overflow-hidden">
              <div className="grid grid-cols-2 gap-8 shrink-0">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4">Select Supplier</label>
                  <select 
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black text-slate-800 focus:outline-none uppercase text-[10px] tracking-widest"
                    value={poFormData.supplier_id}
                    onChange={e => setPOFormData({ ...poFormData, supplier_id: parseInt(e.target.value) })}
                    required
                  >
                    <option value="">Choose Supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-4">Quick Add Low Stock</label>
                  <select 
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black text-slate-800 focus:outline-none uppercase text-[10px] tracking-widest"
                    onChange={e => {
                      const pid = parseInt(e.target.value);
                      if (!pid) return;
                      const product = products.find(p => p.id === pid);
                      if (product && !poFormData.items.find(i => i.product_id === pid)) {
                        setPOFormData({
                          ...poFormData,
                          items: [...poFormData.items, { product_id: product.id, product_name: product.name, quantity: 10, cost_price: product.price * 0.7 }]
                        });
                      }
                    }}
                  >
                    <option value="">Add item...</option>
                    {products.filter(p => !poFormData.items.find(i => i.product_id === p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
                <table className="w-full text-left">
                  <thead className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">
                    <tr>
                      <th className="pb-4">Product</th>
                      <th className="pb-4 w-24">Qty</th>
                      <th className="pb-4 w-32">Unit Cost (₱)</th>
                      <th className="pb-4 text-right w-32">Total</th>
                      <th className="pb-4 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {poFormData.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-4 text-[10px] font-black text-slate-700 uppercase">{item.product_name}</td>
                        <td className="py-4">
                          <input 
                            type="number" 
                            className="w-20 bg-white border border-slate-100 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
                            value={item.quantity}
                            onChange={e => {
                              const items = [...poFormData.items];
                              items[idx].quantity = parseInt(e.target.value) || 0;
                              setPOFormData({ ...poFormData, items });
                            }}
                          />
                        </td>
                        <td className="py-4">
                          <input 
                            type="number" 
                            step="0.01"
                            className="w-28 bg-white border border-slate-100 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
                            value={item.cost_price}
                            onChange={e => {
                              const items = [...poFormData.items];
                              items[idx].cost_price = parseFloat(e.target.value) || 0;
                              setPOFormData({ ...poFormData, items });
                            }}
                          />
                        </td>
                        <td className="py-4 text-right font-black text-slate-800 text-xs">
                          ₱{(item.quantity * item.cost_price).toFixed(2)}
                        </td>
                        <td className="py-4 text-right">
                          <button 
                            type="button"
                            onClick={() => {
                              setPOFormData({ ...poFormData, items: poFormData.items.filter((_, i) => i !== idx) });
                            }}
                            className="text-slate-300 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {poFormData.items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">No items added to PO</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-end shrink-0 gap-8">
                <div className="flex-1">
                   <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    <span>Estimated Total</span>
                    <span className="text-xl text-slate-900 tracking-tight">₱{poFormData.items.reduce((acc, i) => acc + (i.quantity * i.cost_price), 0).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowAddPO(false)} className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors">Cancel</button>
                  <button type="submit" className="px-8 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-100 active:scale-95 transition-all">Create Order</button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ExpenseManager({ user }: { user: any }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState<Partial<Expense>>({ date: new Date().toISOString().split('T')[0] });

  const loadExpenses = useCallback(async () => {
    const data = await api.getExpenses();
    setExpenses(data);
  }, []);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.addExpense({ ...formData, user_id: user.id });
      loadExpenses();
      setShowAdd(false);
      setFormData({ date: new Date().toISOString().split('T')[0] });
    } catch (_err) {
      alert('Failed to log expense');
    }
  };

  const categories = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Marketing', 'Maintenance', 'Tax', 'Misc'];

  return (
    <div className="flex-1 p-6 space-y-6 overflow-hidden flex flex-col">
       <div className="flex justify-between items-center bg-white/80 p-8 rounded-[2.5rem] shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight text-red-600">Operational Expenses</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Track Overhead & Bills</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-slate-900 text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 active:scale-95 transition-all">
          Record Expense
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm p-4 flex-1 overflow-hidden">
        <table className="w-full text-left">
          <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 rounded-xl">
            <tr>
              <th className="p-6">Date</th>
              <th className="p-6">Description</th>
              <th className="p-6">Category</th>
              <th className="p-6">Logged By</th>
              <th className="p-6 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {expenses.map(ex => (
              <tr key={ex.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(ex.date).toLocaleDateString()}</td>
                <td className="p-6 font-bold text-slate-800">{ex.description}</td>
                <td className="p-6">
                  <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">{ex.category}</span>
                </td>
                <td className="p-6 text-[10px] font-black text-slate-400 uppercase">{ex.username}</td>
                <td className="p-6 text-right font-black text-rose-600">-₱{ex.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[3rem] p-10 w-full max-w-md">
            <h3 className="text-2xl font-black text-slate-800 mb-8 uppercase tracking-tight">Log Expense</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <input type="date" className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required />
              <input placeholder="Short Description" className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none" onChange={e => setFormData({ ...formData, description: e.target.value })} required />
              <select className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black text-slate-800 focus:outline-none uppercase text-[10px] tracking-widest" onChange={e => setFormData({ ...formData, category: e.target.value })} required>
                <option value="">Select Category</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" placeholder="Amount (₱)" className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold text-slate-800 focus:outline-none" onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })} required />
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Record</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ProductManager({ products, suppliers, onRefresh, setView, settings }: { products: Product[], suppliers: Supplier[], onRefresh: () => void, setView: (v: View) => void, settings: StoreSettings }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [localSearch, setLocalSearch] = useState('');
  const [localCategory, setLocalCategory] = useState('all');
  const [localStockFilter, setLocalStockFilter] = useState('all');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Product | 'none', direction: 'asc' | 'desc' }>({ key: 'none', direction: 'asc' });

  useEffect(() => {
    const handleBarcode = (_e: any) => {
      const match = _e.detail;
      setLocalSearch(match.barcode);
    };

    window.addEventListener('barcode-scanned', handleBarcode);
    return () => window.removeEventListener('barcode-scanned', handleBarcode);
  }, []);

  const filtered = useMemo(() => {
    let processed = products;
    const term = localSearch.trim();

    if (term) {
      if (term.startsWith('#')) {
        const tag = term.slice(1).toLowerCase();
        processed = products.filter(p => 
          p.tags?.toLowerCase().split(',').some(t => t.trim().includes(tag)) ||
          p.category?.toLowerCase().includes(tag)
        );
      } else {
        const fuse = new Fuse(products, {
          keys: [
            { name: 'name', weight: 1.0 },
            { name: 'description', weight: 0.7 },
            { name: 'tags', weight: 0.5 },
            { name: 'category', weight: 0.3 },
            { name: 'barcode', weight: 0.8 }
          ],
          threshold: 0.3,
          distance: 100,
          location: 0
        });
        processed = fuse.search(term).map(r => r.item);
      }
    }

    const result = processed.filter(p => {
      const matchesCat = localCategory === 'all' || p.category === localCategory;
      const threshold = (settings.category_thresholds && p.category && settings.category_thresholds[p.category]) 
        ? settings.category_thresholds[p.category] 
        : settings.low_stock_threshold;
        
      const matchesStock = localStockFilter === 'all' || 
                           (localStockFilter === 'low' && p.stock < threshold && p.stock > 0) ||
                           (localStockFilter === 'out' && p.stock <= 0);
      return matchesCat && matchesStock;
    });

    if (sortConfig.key !== 'none') {
      result.sort((a: any, b: any) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [products, localSearch, localCategory, localStockFilter, settings.low_stock_threshold, settings.category_thresholds, sortConfig]);

  const categories = Array.from(new Set(products.map(p => p.category || 'General')));

  const exportToCSV = () => {
    const headers = ['Name', 'Description', 'Price', 'Stock', 'Category', 'Barcode', 'Tags'];
    const rows = products.map(p => [
      p.name,
      p.description || '',
      p.price.toFixed(2),
      p.stock,
      p.category || 'General',
      p.barcode || '',
      p.tags || ''
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.map(String).map(s => `"${s.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `products_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const dataToValidate = {
      ...formData,
      price: parseFloat(formData.price as any) || 0,
      stock: parseInt(formData.stock as any) || 0,
    };

    const result = productSchema.safeParse(dataToValidate);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      if (editing) {
        await api.updateProduct(editing.id, result.data as any);
      } else {
        await api.addProduct(result.data as Omit<Product, 'id'>);
      }
      onRefresh();
      setEditing(null);
      setShowAdd(false);
      setFormData({});
    } catch (err) {
      alert('Error saving product: Barcode might already be in use');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await api.deleteProduct(id);
      onRefresh();
    } catch (err) {
      alert('Error deleting product');
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkCategory && !bulkPrice) {
      alert('Please enter a category or price to update');
      return;
    }
    if (selectedIds.size === 0) return;

    const priceVal = parseFloat(bulkPrice);
    if (bulkPrice && isNaN(priceVal)) {
      alert('Invalid price value');
      return;
    }

    if (!confirm(`Update ${selectedIds.size} selected products?`)) return;

    try {
      const promises = Array.from(selectedIds).map(id => {
        const product = products.find(p => p.id === id);
        if (!product) return Promise.resolve();
        
        const updates: any = { ...product };
        if (bulkCategory) updates.category = bulkCategory;
        if (bulkPrice) updates.price = priceVal;
        
        return api.updateProduct(id, updates);
      });
      await Promise.all(promises);
      onRefresh();
      setSelectedIds(new Set());
      setBulkCategory('');
      setBulkPrice('');
    } catch (err) {
      alert('Error during bulk update');
    }
  };

  const requestSort = (key: keyof Product) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { imageUrl } = await api.uploadImage(file);
      setFormData(prev => ({ ...prev, image_url: imageUrl }));
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message);
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="mb-6 flex flex-col gap-6 bg-white/50 backdrop-blur-md p-6 rounded-[2.5rem] shadow-sm shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight text-red-600">Inventory Vault</h2>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Master Product Database</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={exportToCSV}
              className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all border border-slate-100 shadow-sm active:scale-95"
            >
              Export CSV
            </button>
            <BulkImport onImported={onRefresh} />
            <button 
              onClick={() => { setShowAdd(true); setFormData({}); }}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-[1.5rem] flex items-center gap-3 transition-all shadow-xl shadow-red-100 font-black text-xs uppercase tracking-[0.2em] active:scale-95"
            >
              <Plus className="w-5 h-5" /> New SKU
            </button>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-1 flex items-center gap-4 bg-white/80 px-6 py-3 rounded-[1.5rem] shadow-sm">
            <Search className="w-5 h-5 text-slate-300" />
            <input 
              type="text"
              data-search-input="true"
              placeholder="Filter database..."
              className="bg-transparent border-none focus:outline-none text-xs font-black text-slate-600 w-full placeholder:text-slate-300 uppercase tracking-widest"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && localSearch.trim()) {
                  const match = products.find(p => 
                    p.barcode === localSearch.trim() || 
                    p.id.toString() === localSearch.trim()
                  );
                  if (match) {
                    setLocalSearch(match.barcode);
                  }
                }
              }}
            />
          </div>
          <div className="flex bg-white/80 px-6 py-3 rounded-[1.5rem] shadow-sm items-center gap-3">
            <Filter className="w-4 h-4 text-slate-300" />
            <select 
              value={localCategory}
              onChange={(e) => setLocalCategory(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-[10px] font-black text-slate-600 uppercase tracking-widest cursor-pointer pr-4"
            >
              <option value="all">Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex bg-white/80 px-6 py-3 rounded-[1.5rem] shadow-sm items-center gap-3">
            <Activity className="w-4 h-4 text-slate-300" />
            <select 
              value={localStockFilter}
              onChange={(e) => setLocalStockFilter(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-[10px] font-black text-slate-600 uppercase tracking-widest cursor-pointer pr-4"
            >
              <option value="all">Any Status</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 bg-white rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col p-2">
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-slate-900 text-white rounded-[1.5rem] mb-2 p-4 flex items-center justify-between overflow-hidden shrink-0"
            >
              <div className="flex items-center gap-4">
                <div className="bg-red-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  {selectedIds.size} Selected
                </div>
                <p className="text-xs text-slate-400 font-bold">Bulk Actions:</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex bg-slate-800 rounded-xl overflow-hidden p-1 border border-slate-700 divide-x divide-slate-700">
                  <div className="flex items-center px-2">
                    <Package className="w-3 h-3 text-slate-500 mr-2" />
                    <input 
                      type="text"
                      placeholder="Category..."
                      className="bg-transparent border-none focus:outline-none text-[10px] px-1 font-bold text-white placeholder:text-slate-500 w-28"
                      value={bulkCategory}
                      onChange={(e) => setBulkCategory(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center px-2">
                    <Banknote className="w-3 h-3 text-slate-500 mr-2" />
                    <input 
                      type="number"
                      placeholder="Price..."
                      className="bg-transparent border-none focus:outline-none text-[10px] px-1 font-bold text-white placeholder:text-slate-500 w-20"
                      value={bulkPrice}
                      onChange={(e) => setBulkPrice(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => handleBulkUpdate()}
                    className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap"
                  >
                    Apply Bulk Changes
                  </button>
                </div>
                <button 
                  onClick={() => setSelectedIds(new Set())}
                  className="text-slate-500 hover:text-white transition-colors p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="overflow-x-auto overflow-y-auto scrollbar-hide">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 text-slate-400 uppercase text-[10px] font-black tracking-widest sticky top-0 bg-white z-10 select-none">
              <tr>
                <th className="px-8 py-5 w-10">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-8 py-5 cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestSort('name')}>
                  <div className="flex items-center gap-2">
                    Product Identity
                    <SortIndicator column="name" sortConfig={sortConfig} />
                  </div>
                </th>
                <th className="px-8 py-5 cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestSort('category')}>
                   <div className="flex items-center gap-2">
                    Category
                    <SortIndicator column="category" sortConfig={sortConfig} />
                  </div>
                </th>
                <th className="px-8 py-5 cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestSort('price')}>
                   <div className="flex items-center gap-2">
                    Price
                    <SortIndicator column="price" sortConfig={sortConfig} />
                  </div>
                </th>
                <th className="px-8 py-5 cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestSort('stock')}>
                   <div className="flex items-center gap-2">
                    Available
                    <SortIndicator column="stock" sortConfig={sortConfig} />
                  </div>
                </th>
                <th className="px-8 py-5 text-right uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(product => {
                const threshold = (settings.category_thresholds && product.category && settings.category_thresholds[product.category]) 
                  ? settings.category_thresholds[product.category] 
                  : settings.low_stock_threshold;
                const isLowStock = product.stock < threshold && product.stock > 0;
                const isOutOfStock = product.stock <= 0;

                return (
                  <tr key={product.id} className={`hover:bg-slate-50 transition-colors group ${selectedIds.has(product.id) ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-8 py-6">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                      />
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-sm transition-transform group-hover:scale-105 overflow-hidden border border-slate-100">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>📦</span>
                          )}
                        </div>
                        <div>
                          <div className="font-black text-slate-800 tracking-tight line-clamp-1">{product.name}</div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <div className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg tracking-widest uppercase">
                              {product.barcode || 'NO BARCODE'}
                            </div>
                            {product.supplier_id && (
                              <div className="flex items-center gap-1 text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                <Truck className="w-2.5 h-2.5" />
                                {suppliers.find(s => s.id === product.supplier_id)?.name || 'Unknown'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="bg-slate-100/50 text-slate-500 px-3 py-1 rounded-[1rem] text-[10px] font-black uppercase tracking-widest border border-slate-100">
                        {product.category || 'General'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="font-black text-emerald-600 text-lg tracking-tight">₱{product.price?.toFixed(2)}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className={`text-xs font-black uppercase tracking-[0.2em] ${isOutOfStock ? 'text-rose-500' : isLowStock ? 'text-amber-500' : 'text-slate-400'}`}>
                          {product.stock} Units
                        </div>
                        {isOutOfStock && (
                          <div className="bg-rose-500 text-white p-1 rounded-full animate-pulse">
                            <AlertCircle className="w-3 h-3" />
                          </div>
                        )}
                        {isLowStock && (
                          <div className="bg-amber-100 text-amber-600 p-1 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right space-x-2">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                        <button 
                          onClick={() => { setEditing(product); setFormData(product); }}
                          className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all shadow-sm bg-white border border-slate-50"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(product.id)}
                          className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all shadow-sm bg-white border border-slate-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="py-40 text-center text-slate-300">
              <div className="w-24 h-24 bg-slate-50 rounded-[3rem] flex items-center justify-center mx-auto mb-8">
                <Package className="w-12 h-12 opacity-30" />
              </div>
              <p className="font-black uppercase tracking-[0.3em] text-[10px]">Vault Partition Empty</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {(showAdd || editing) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[3rem] w-full max-w-lg overflow-hidden shadow-2xl"
          >
            <div className="p-10 pb-4 flex justify-between items-center">
              <h3 className="font-black text-3xl text-slate-800 tracking-tight">{editing ? 'Update SKU' : 'New Product'}</h3>
              <button 
                onClick={() => { setShowAdd(false); setEditing(null); }}
                className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-800 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-10 pt-4 space-y-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Item Name</label>
                <input 
                  type="text"
                  placeholder="e.g. Organic Honey"
                  className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-800 transition-all ${errors.name ? 'ring-2 ring-rose-500/20' : ''}`}
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
                {errors.name && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Price (₱)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-800 transition-all ${errors.price ? 'ring-2 ring-rose-500/20' : ''}`}
                    value={formData.price || ''}
                    onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                  />
                  {errors.price && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.price}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Stock Level</label>
                  <input 
                    type="number"
                    className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-800 transition-all ${errors.stock ? 'ring-2 ring-rose-500/20' : ''}`}
                    value={formData.stock || ''}
                    onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) })}
                  />
                  {errors.stock && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.stock}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Barcode / SKU</label>
                  <input 
                    type="text"
                    placeholder="7890123456..."
                    className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-800 transition-all ${errors.barcode ? 'ring-2 ring-rose-500/20' : ''}`}
                    value={formData.barcode || ''}
                    onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                  />
                  {errors.barcode && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.barcode}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Category</label>
                  <input 
                    type="text"
                    placeholder="e.g. Produce"
                    className={`w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-800 transition-all ${errors.category ? 'ring-2 ring-rose-500/20' : ''}`}
                    value={formData.category || ''}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  />
                  {errors.category && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.category}</p>}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Assigned Supplier</label>
                <select 
                  className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-800 transition-all uppercase text-[10px] tracking-widest"
                  value={formData.supplier_id || ''}
                  onChange={e => setFormData({ ...formData, supplier_id: e.target.value ? parseInt(e.target.value) : undefined })}
                >
                  <option value="">No Supplier Assigned</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <p className="text-[8px] font-bold text-slate-400 mt-2 ml-2 uppercase tracking-widest italic">Used for automated purchase orders</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Product Image</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 border border-slate-100 shadow-sm transition-all hover:scale-105">
                      {formData.image_url ? (
                        <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="w-6 h-6 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="flex items-center justify-center gap-2 w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95">
                        <Upload className="w-4 h-4" />
                        Upload Photo
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    </div>
                  </div>
                  {errors.image_url && <p className="text-[9px] font-black text-rose-500 uppercase mt-2 px-2">{errors.image_url}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Tags (Comma separated)</label>
                  <input 
                    type="text"
                    placeholder="sale, organic, healthy"
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-800 transition-all"
                    value={formData.tags || ''}
                    onChange={e => setFormData({ ...formData, tags: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Internal Remarks</label>
                <textarea 
                  className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-bold text-slate-800 transition-all min-h-[100px] resize-none"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="pt-6">
                <button 
                  type="submit" 
                  className="w-full py-5 bg-red-600 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98]"
                >
                  {editing ? 'Commit System Update' : 'Initialize SKU'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onLogin, settings }: { onLogin: (user: any) => void, settings: StoreSettings }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await api.login({ username, password });
      onLogin(user);
    } catch (err) {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-500 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/10 backdrop-blur-3xl border border-white/10 p-8 md:p-12 rounded-[3rem] w-full max-w-md shadow-2xl relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-red-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-red-500/20">
            <Bug className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase">{settings.store_name}</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">Access Terminal Secured</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-xs font-bold text-center"
            >
              {error}
            </motion.div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Credential ID</label>
            <div className="relative">
              <UserCircle className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="text" 
                autoFocus
                className="w-full bg-white/5 border border-white/10 px-12 py-4 rounded-2xl text-white focus:outline-none focus:ring-4 focus:ring-red-500/10 placeholder:text-slate-600 outline-none"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Access Key</label>
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="password" 
                className="w-full bg-white/5 border border-white/10 px-12 py-4 rounded-2xl text-white focus:outline-none focus:ring-4 focus:ring-red-500/10 placeholder:text-slate-600 outline-none"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-red-500/10 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : (
              <>
                Initiate Session <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-12 text-center text-slate-500 font-bold uppercase text-[10px] tracking-widest">
          Authorized Personnel Only
        </div>
      </motion.div>
    </div>
  );
}

function ReportsView({ products, settings, user }: { products: Product[], settings: StoreSettings, user: any }) {
  const [salesData, setSalesData] = useState<any[]>([]);
  const [popularData, setPopularData] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [profitData, setProfitData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'year'>('week');

  const lowStockItems = useMemo(() => {
    return products.filter(p => p.stock < getProductThreshold(p, settings));
  }, [products, settings]);
  const totalSales = salesData.reduce((acc, curr) => acc + curr.total, 0);
  const transactionEstimate = salesData.length * 12;

  const fetchReportsData = useCallback(async () => {
    setLoading(true);
    try {
      const end = new Date();
      const start = new Date();
      if (timeFilter === 'today') start.setHours(0, 0, 0, 0);
      else if (timeFilter === 'week') start.setDate(start.getDate() - 7);
      else if (timeFilter === 'month') start.setMonth(start.getMonth() - 1);
      else if (timeFilter === 'year') start.setFullYear(start.getFullYear() - 1);

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      const [sales, popular, audits, profit] = await Promise.all([
        api.getSalesReport(),
        api.getPopularProducts(),
        api.getAuditLogs({ start_date: startStr, end_date: endStr }),
        api.getProfitReport()
      ]);
      
      setSalesData(sales);
      setPopularData(popular);
      setActivityLogs(audits.slice(0, 50));
      setProfitData(profit);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    fetchReportsData();
  }, [fetchReportsData]);

  const COLORS = ['#dc2626', '#1e293b', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      >
        <Activity className="w-12 h-12 mb-4 opacity-20" />
      </motion.div>
      <p className="font-black uppercase tracking-[0.3em] text-[10px]">Syncing Intelligence Layer...</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="mb-6 flex justify-between items-center bg-white/50 backdrop-blur-md p-6 rounded-[2.5rem] shadow-sm shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Intelligence Dashboard</h2>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Operational Performance Metrics</p>
        </div>
        <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
          {(['today', 'week', 'month', 'year'] as const).map(f => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeFilter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto space-y-6 pb-20 scrollbar-hide px-1">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm transition-all hover:translate-y-[-4px]">
            <div className="p-3 bg-red-50 rounded-2xl w-fit mb-6 shadow-sm">
              <TrendingUp className="w-6 h-6 text-red-600" />
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Period Revenue</div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">₱{totalSales.toFixed(2)}</div>
            <div className="mt-3 text-[10px] font-black text-red-600 flex items-center gap-1 uppercase tracking-widest">
              <Plus className="w-3 h-3" /> 12.5% vs previous
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm transition-all hover:translate-y-[-4px]">
            <div className="p-3 bg-rose-50 rounded-2xl w-fit mb-6 shadow-sm">
              <CreditCard className="w-6 h-6 text-rose-600" />
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Expenses</div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">₱{profitData?.expenses?.toFixed(2) || '0.00'}</div>
            <div className="mt-3 text-[10px] font-black text-rose-600 flex items-center gap-1 uppercase tracking-widest">
              <ArrowDown className="w-3 h-3" /> Operational Costs
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm transition-all hover:translate-y-[-4px]">
            <div className="p-3 bg-emerald-50 rounded-2xl w-fit mb-6 shadow-sm">
              <Banknote className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Net Profit</div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">₱{profitData?.net?.toFixed(2) || '0.00'}</div>
            <div className="mt-3 text-[10px] font-black text-emerald-600 flex items-center gap-1 uppercase tracking-widest">
              <TrendingUp className="w-3 h-3" /> Final Earnings
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm transition-all hover:translate-y-[-4px]">
            <div className="p-3 bg-indigo-50 rounded-2xl w-fit mb-6 shadow-sm">
              <History className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Transaction Volume</div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">{transactionEstimate}</div>
            <div className="mt-3 text-[10px] font-black text-indigo-600 flex items-center gap-1 uppercase tracking-widest">
              <Activity className="w-3 h-3" /> System Healthy
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm transition-all">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 rounded-2xl shadow-sm">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="font-black text-slate-800 uppercase tracking-widest text-[10px]">Revenue Velocity</h3>
              </div>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                  <XAxis dataKey="date" stroke="#cbd5e1" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="#cbd5e1" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(val) => `₱${val}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '2rem', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.05)', padding: '1.25rem' }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#dc2626" fillOpacity={1} fill="url(#colorTotal)" strokeWidth={4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm transition-all flex flex-col">
            <div className="flex items-center gap-4 mb-8 shrink-0">
              <div className="p-3 bg-indigo-50 rounded-2xl shadow-sm">
                <Activity className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-[10px]">Recent Activity Feed</h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide min-h-[300px]">
              {activityLogs.map((log, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50/50 border border-slate-100/50">
                  <div className={`p-2 rounded-xl text-white ${log.discrepancy < 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}>
                    {log.discrepancy < 0 ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight">Stock Adjustment: {log.product_name}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">{log.reason} • {new Date(log.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-black ${log.discrepancy < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {log.discrepancy > 0 ? '+' : ''}{log.discrepancy} Units
                    </span>
                  </div>
                </div>
              ))}
              {activityLogs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-200">
                  <ClipboardList className="w-12 h-12 opacity-10 mb-4" />
                  <p className="font-black uppercase tracking-widest text-[8px]">No recent audits found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] shadow-sm flex flex-col items-center">
            <div className="flex items-center gap-4 mb-8 w-full">
              <div className="p-3 bg-amber-50 rounded-2xl shadow-sm">
                <PieChartIcon className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-[10px]">Category Exposure</h3>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={popularData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={8}
                    dataKey="count"
                  >
                    {popularData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '2rem', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.05)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col">
            <h3 className="font-black text-rose-500 uppercase tracking-widest text-[10px] mb-8 flex items-center gap-3">
              <div className="p-2 bg-rose-50 rounded-lg shadow-sm"><AlertCircle className="w-5 h-5" /></div>
              Inventory Health Alerts
            </h3>
            <div className="space-y-3 flex-1 overflow-y-auto scrollbar-hide pr-2">
              {lowStockItems.length > 0 ? lowStockItems.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 transition-all hover:bg-white hover:shadow-sm">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center font-black text-rose-600 text-sm">
                      {item.stock}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-black text-slate-800 uppercase tracking-tight tracking-wide">{item.name}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{item.category}</span>
                        <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                        <span className="text-[8px] font-black text-rose-400 uppercase tracking-[0.2em]">Required: {getProductThreshold(item, settings)} Units</span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-[8px] font-black text-white bg-slate-800 px-3 py-1.5 rounded-xl tracking-widest uppercase">Action Required</div>
                  </div>
                </div>
              )) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-200 mt-8">
                  <Package className="w-16 h-16 opacity-20 mb-4" />
                  <p className="font-black uppercase tracking-[0.3em] text-[10px]">All Stock Levels Optimal</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShiftModal({ user, activeShift, onClose, onUpdate }: { user: any, activeShift: any, onClose: () => void, onUpdate: (uid: number) => void }) {
  const [cash, setCash] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.openShift(user.id, parseFloat(cash) || 0);
      onUpdate(user.id);
      onClose();
    } catch (err) {
      alert('Failed to open shift');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.closeShift(activeShift.id, parseFloat(cash) || 0);
      onUpdate(user.id);
      onClose();
    } catch (err) {
      alert('Failed to close shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[300] flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-8 pb-4 flex justify-between items-center">
          <h3 className="font-black text-xl text-slate-800 uppercase tracking-tighter">{activeShift ? 'Close Out Shift' : 'Initiate Shift'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        
        <form onSubmit={activeShift ? handleClose : handleOpen} className="p-8 pt-4 space-y-6">
          <div className="flex items-center justify-center w-20 h-20 bg-slate-50 rounded-[2rem] mx-auto mb-4">
            <Coins className={`w-8 h-8 ${activeShift ? 'text-rose-500' : 'text-emerald-500'}`} />
          </div>
          
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current User</p>
            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{user.username} ({user.role})</p>
          </div>

          {activeShift && (
            <div className="bg-slate-50 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Started At</span>
                <span className="text-[8px] font-black text-slate-800 uppercase">{new Date(activeShift.start_time).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Opening Float</span>
                <span className="text-[8px] font-black text-slate-800 uppercase">₱{activeShift.start_cash.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{activeShift ? 'Ending Cash Count' : 'Starting Cash Float'}</label>
            <input 
              type="number" 
              required
              step="0.01"
              placeholder="0.00"
              className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:outline-none focus:ring-4 focus:ring-red-500/5 font-black text-xl text-slate-800 text-center"
              value={cash}
              onChange={e => setCash(e.target.value)}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className={`w-full py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] shadow-xl transition-all active:scale-95 disabled:opacity-50 ${activeShift ? 'bg-slate-800 text-white shadow-slate-200' : 'bg-emerald-600 text-white shadow-emerald-100'}`}
          >
            {loading ? 'Processing...' : (activeShift ? 'End Shift & Lock Drawer' : 'Verify & Open Shift')}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function BulkImport({ onImported }: { onImported: () => void }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<{
    total: number;
    success: any[];
    failed: { row: number; reason: string; data: string }[];
    duplicates: { row: number; name: string }[];
  } | null>(null);

  const downloadTemplate = () => {
    const headers = ['name', 'description', 'price', 'stock', 'category', 'barcode', 'image_url', 'tags'];
    const csvContent = headers.join(',') + '\n' + 
      'Fresh Apple,Crispy Red Apples,15.50,100,Fruits,123456789,https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6,"fruit,fresh,red"';
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template.csv';
    a.click();
  };

  const parseCSV = (text: string) => {
    const result = [];
    const rows = text.split(/\r?\n/);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i].trim();
        if (!row) continue;
        
        const fields = [];
        let curField = '';
        let inQuotes = false;
        
        for (let j = 0; j < row.length; j++) {
            const char = row[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(curField.trim());
                curField = '';
            } else {
                curField += char;
            }
        }
        fields.push(curField.trim());
        result.push(fields);
    }
    return result;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setReport(null);

    try {
      const existingProducts = await api.getProducts();
      const existingBarcodes = new Set(existingProducts.map(p => p.barcode?.toLowerCase()).filter(Boolean));
      const existingNames = new Set(existingProducts.map(p => p.name.toLowerCase()));

      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        const allRows = parseCSV(text);
        
        if (allRows.length <= 1) {
          setLoading(false);
          alert('CSV is empty or missing data rows');
          return;
        }

        const headers = allRows[0].map(h => h.toLowerCase());
        const dataRows = allRows.slice(1);
        
        // Find header indices
        const iName = headers.indexOf('name');
        const iDesc = headers.indexOf('description');
        const iPrice = headers.indexOf('price');
        const iStock = headers.indexOf('stock');
        const iCat = headers.indexOf('category');
        const iBarcode = headers.indexOf('barcode');
        const iImageUrl = headers.indexOf('image_url');
        const iTags = headers.indexOf('tags');

        const success: any[] = [];
        const failed: any[] = [];
        const duplicates: any[] = [];
        const seenInCsv = new Set<string>();

        dataRows.forEach((parts, index) => {
          const rowIndex = index + 2; 
          
          if (parts.length < 1) return;

          const name = iName !== -1 ? parts[iName] : '';
          const description = iDesc !== -1 ? parts[iDesc] : '';
          const priceStr = iPrice !== -1 ? parts[iPrice] : '';
          const stockStr = iStock !== -1 ? parts[iStock] : '';
          const category = iCat !== -1 ? parts[iCat] : '';
          const barcode = iBarcode !== -1 ? parts[iBarcode] : '';
          const image_url = iImageUrl !== -1 ? parts[iImageUrl] : '';
          const tags = iTags !== -1 ? parts[iTags] : '';

          // Validation
          if (!name) {
            failed.push({ row: rowIndex, reason: 'Missing name', data: parts.join(',') });
            return;
          }

          const price = parseFloat(priceStr.replace(/[^0-9.-]+/g, ''));
          const stock = parseInt(stockStr.replace(/[^0-9.-]+/g, ''));

          if (isNaN(price)) {
            failed.push({ row: rowIndex, reason: 'Missing or invalid price', data: parts.join(',') });
            return;
          }

          // Duplicate check
          const normalizedName = name.toLowerCase();
          const normalizedBarcode = barcode?.toLowerCase();

          if (seenInCsv.has(normalizedName) || (normalizedBarcode && seenInCsv.has(normalizedBarcode))) {
            duplicates.push({ row: rowIndex, name: name });
            return;
          }

          if (existingNames.has(normalizedName) || (normalizedBarcode && existingBarcodes.has(normalizedBarcode))) {
            duplicates.push({ row: rowIndex, name: name });
            return;
          }

          seenInCsv.add(normalizedName);
          if (normalizedBarcode) seenInCsv.add(normalizedBarcode);

          success.push({
            name,
            description: description || '',
            price: price || 0,
            stock: isNaN(stock) ? 0 : stock,
            category: category || 'General',
            barcode: barcode || '',
            image_url: image_url || '',
            tags: tags || ''
          });
        });

        if (success.length > 0) {
          try {
            await api.bulkImportProducts(success);
            onImported();
          } catch (err) {
            console.error('Partial import failed', err);
          }
        }

        setReport({
          total: dataRows.length,
          success,
          failed,
          duplicates
        });
        setLoading(false);
      };
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <input 
        type="file" 
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden" 
        id="csv-upload"
      />
      <div className="flex items-center gap-2">
        <button 
          onClick={downloadTemplate}
          className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all border border-slate-100 shadow-sm active:scale-95"
          title="Download CSV Template"
        >
          <X className="w-4 h-4 rotate-45" /> Template
        </button>
        <label 
          htmlFor="csv-upload"
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          <Upload className="w-4 h-4" /> {loading ? 'Processing...' : 'Bulk Upload'}
        </label>

        <AnimatePresence>
          {report && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl p-10 max-h-[85vh] overflow-hidden flex flex-col">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Import Summary</h2>
                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">Status Report for {report.total} processed rows</p>
                  </div>
                  <button onClick={() => setReport(null)} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-8">
                  <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                    <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Successful</div>
                    <div className="text-3xl font-black text-emerald-700">{report.success.length}</div>
                  </div>
                  <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
                    <div className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Failed</div>
                    <div className="text-3xl font-black text-red-700">{report.failed.length}</div>
                  </div>
                  <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                    <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Duplicates</div>
                    <div className="text-3xl font-black text-amber-700">{report.duplicates.length}</div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                  {report.failed.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-[10px] font-black text-red-400 uppercase tracking-widest px-2">Critical Errors ({report.failed.length})</h3>
                      {report.failed.map((f, i) => (
                        <div key={i} className="p-4 bg-red-50/30 rounded-2xl border border-red-50 flex justify-between items-center">
                          <div>
                            <div className="text-xs font-black text-red-800">Row {f.row}: {f.reason}</div>
                            <div className="text-[10px] font-medium text-slate-400 mt-1 truncate max-w-sm">{f.data}</div>
                          </div>
                          <AlertCircle className="w-5 h-5 text-red-400" />
                        </div>
                      ))}
                    </div>
                  )}

                  {report.duplicates.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest px-2">Skipped Duplicates ({report.duplicates.length})</h3>
                      {report.duplicates.map((d, i) => (
                        <div key={i} className="p-4 bg-amber-50/30 rounded-2xl border border-amber-50 flex justify-between items-center">
                          <div>
                            <div className="text-xs font-black text-amber-800">Row {d.row}: Product already exists</div>
                            <div className="text-[10px] font-medium text-slate-400 mt-1">{d.name}</div>
                          </div>
                          <History className="w-5 h-5 text-amber-400" />
                        </div>
                      ))}
                    </div>
                  )}

                  {report.success.length === report.total && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-4">
                        <ClipboardCheck className="w-8 h-8" />
                      </div>
                      <p className="text-slate-800 font-black uppercase tracking-tight">Perfect Import!</p>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">All rows were successfully synchronized.</p>
                    </div>
                  )}
                </div>

                <div className="mt-8 pt-8 border-t border-slate-50">
                  <button 
                    onClick={() => setReport(null)}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                  >
                    Close Report
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
