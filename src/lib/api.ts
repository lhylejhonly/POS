export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  image_url: string;
  barcode?: string;
  tags?: string;
  supplier_id?: number;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  points: number;
  store_credit: number;
}

export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface PurchaseOrder {
  id: number;
  supplier_id: number;
  status: 'pending' | 'received' | 'cancelled';
  total_amount: number;
  created_at: string;
  supplier_name?: string;
}

export interface POItem {
  id: number;
  po_id: number;
  product_id: number;
  quantity: number;
  cost_price: number;
  product_name?: string;
}

export interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  user_id: number;
  username?: string;
}

const API_BASE = '/api';

export const api = {
  async logout() {
    // Client-side logout, just clearing state
  },

  async login(credentials: any): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    return res.json();
  },

  async getSalesReport(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/reports/sales`);
    if (!res.ok) throw new Error('Failed to fetch sales reports');
    return res.json();
  },

  async getPopularProducts(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/reports/popular`);
    if (!res.ok) throw new Error('Failed to fetch popular products');
    return res.json();
  },

  async bulkImportProducts(products: any[]): Promise<void> {
    const res = await fetch(`${API_BASE}/products/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products }),
    });
    if (!res.ok) throw new Error('Bulk import failed');
  },

  async getProducts(): Promise<Product[]> {
    const res = await fetch(`${API_BASE}/products`);
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
  },

  async addProduct(product: Omit<Product, 'id'>): Promise<{ id: number }> {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    if (!res.ok) throw new Error('Failed to add product');
    return res.json();
  },

  async updateProduct(id: number, product: Partial<Product>): Promise<void> {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    if (!res.ok) throw new Error('Failed to update product');
  },

  async deleteProduct(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete product');
  },

  async checkout(
    items: any[], 
    total: number, 
    payments?: { type: string, amount: number }[],
    userId?: number,
    shiftId?: number,
    customerId?: number,
    taxAmount?: number
  ): Promise<{ transactionId: number }> {
    const res = await fetch(`${API_BASE}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, total, payments, user_id: userId, shift_id: shiftId, customer_id: customerId, tax_amount: taxAmount }),
    });
    if (!res.ok) throw new Error('Checkout failed');
    return res.json();
  },

  async getTransactions(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/transactions`);
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return res.json();
  },

  async getTransaction(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/transactions/${id}`);
    if (!res.ok) throw new Error('Failed to fetch transaction');
    return res.json();
  },

  async getTransactionItems(id: number): Promise<any[]> {
    const res = await fetch(`${API_BASE}/transactions/${id}/items`);
    if (!res.ok) throw new Error('Failed to fetch items');
    return res.json();
  },

  async getTransactionPayments(id: number): Promise<any[]> {
    const res = await fetch(`${API_BASE}/transactions/${id}/payments`);
    if (!res.ok) throw new Error('Failed to fetch payments');
    return res.json();
  },

  async voidTransaction(id: number, reason: string): Promise<void> {
    const res = await fetch(`${API_BASE}/transactions/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('Void failed');
  },

  async getSettings(): Promise<any> {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(settings: any): Promise<void> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Update settings failed');
  },

  async getAuditLogs(filters?: { product_id?: number, start_date?: string, end_date?: string }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.product_id) params.append('product_id', filters.product_id.toString());
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    
    const res = await fetch(`${API_BASE}/inventory/audits?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch audits');
    return res.json();
  },

  async performAudit(auditData: { product_id: number, actual_stock: number, reason: string, user_id?: number }): Promise<any> {
    const res = await fetch(`${API_BASE}/inventory/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditData),
    });
    if (!res.ok) throw new Error('Audit failed');
    return res.json();
  },

  async getActiveShift(userId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/shifts/active/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch active shift');
    return res.json();
  },

  async openShift(userId: number, startCash: number): Promise<any> {
    const res = await fetch(`${API_BASE}/shifts/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, start_cash: startCash }),
    });
    if (!res.ok) throw new Error('Failed to open shift');
    return res.json();
  },

  async closeShift(shiftId: number, endCash: number): Promise<void> {
    const res = await fetch(`${API_BASE}/shifts/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shift_id: shiftId, end_cash: endCash }),
    });
    if (!res.ok) throw new Error('Failed to close shift');
  },

  async notifyLowStock(productId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/notify/low-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    });
    if (!res.ok) throw new Error('Notification failed');
  },

  async uploadImage(file: File): Promise<{ imageUrl: string }> {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },

  async getCustomers(): Promise<Customer[]> {
    const res = await fetch(`${API_BASE}/customers`);
    if (!res.ok) throw new Error('Failed to fetch customers');
    return res.json();
  },

  async addCustomer(customer: Partial<Customer>): Promise<Customer> {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customer),
    });
    if (!res.ok) throw new Error('Failed to add customer');
    return res.json();
  },

  async updateCustomer(id: number, customer: Partial<Customer>): Promise<void> {
    const res = await fetch(`${API_BASE}/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customer),
    });
    if (!res.ok) throw new Error('Failed to update customer');
  },

  async getSuppliers(): Promise<Supplier[]> {
    const res = await fetch(`${API_BASE}/suppliers`);
    if (!res.ok) throw new Error('Failed to fetch suppliers');
    return res.json();
  },

  async addSupplier(supplier: Partial<Supplier>): Promise<Supplier> {
    const res = await fetch(`${API_BASE}/suppliers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplier),
    });
    if (!res.ok) throw new Error('Failed to add supplier');
    return res.json();
  },

  async updateSupplier(id: number, supplier: Partial<Supplier>): Promise<void> {
    const res = await fetch(`${API_BASE}/suppliers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplier),
    });
    if (!res.ok) throw new Error('Failed to update supplier');
  },

  async deleteSupplier(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/suppliers/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete supplier');
  },

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    const res = await fetch(`${API_BASE}/purchase-orders`);
    if (!res.ok) throw new Error('Failed to fetch POs');
    return res.json();
  },

  async createPurchaseOrder(po: { supplier_id: number, items: any[] }): Promise<PurchaseOrder> {
    const res = await fetch(`${API_BASE}/purchase-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(po),
    });
    if (!res.ok) throw new Error('Failed to create PO');
    return res.json();
  },

  async getPOItems(id: number): Promise<POItem[]> {
    const res = await fetch(`${API_BASE}/purchase-orders/${id}/items`);
    if (!res.ok) throw new Error('Failed to fetch PO items');
    return res.json();
  },

  async updatePOStatus(id: number, status: string): Promise<void> {
    const res = await fetch(`${API_BASE}/purchase-orders/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update PO status');
  },

  async getExpenses(): Promise<Expense[]> {
    const res = await fetch(`${API_BASE}/expenses`);
    if (!res.ok) throw new Error('Failed to fetch expenses');
    return res.json();
  },

  async addExpense(expense: Partial<Expense>): Promise<Expense> {
    const res = await fetch(`${API_BASE}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expense),
    });
    if (!res.ok) throw new Error('Failed to log expense');
    return res.json();
  },

  async getProfitReport(): Promise<any> {
    const res = await fetch(`${API_BASE}/reports/profit`);
    if (!res.ok) throw new Error('Failed to fetch profit report');
    return res.json();
  }
};
