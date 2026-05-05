import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
// @ts-ignore
import express from 'express';
// @ts-ignore
import cors from 'cors';
// @ts-ignore
import Database from 'better-sqlite3';
// @ts-ignore
import bcrypt from 'bcryptjs';

function expressPlugin() {
  return {
    name: 'express-plugin',
    configureServer(server: any) {
      const app = express();
      app.use(cors());
      app.use(express.json());

      const db = new Database('pos.db');
      
      // Initialize Database
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          password TEXT,
          role TEXT DEFAULT 'cashier'
        );

        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          price REAL NOT NULL,
          stock INTEGER NOT NULL,
          category TEXT,
          image_url TEXT,
          barcode TEXT UNIQUE,
          tags TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          total REAL NOT NULL,
          items_count INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transaction_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER,
          product_id INTEGER,
          quantity INTEGER NOT NULL,
          price_at_time REAL NOT NULL,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS transaction_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER,
          type TEXT NOT NULL,
          amount REAL NOT NULL,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER,
          previous_stock INTEGER,
          actual_stock INTEGER,
          discrepancy INTEGER,
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
      `);

      // Seed Users if empty
      const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
      if (userCount === 0) {
        const adminHash = bcrypt.hashSync('admin', 10);
        const cashierHash = bcrypt.hashSync('1234', 10);
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', adminHash, 'manager');
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('cashier', cashierHash, 'cashier');
      }

      // Seed Settings
      const defaultSettings = [
        ['store_name', 'RED ANT'],
        ['store_address', 'Anthill HQ, Colony Rd'],
        ['store_phone', '(555) ANT-0000'],
        ['receipt_footer', 'Thanks for being part of the colony!'],
        ['logo_url', ''],
        ['receipt_layout', 'standard'],
        ['show_tax_id', 'false'],
        ['tax_id', ''],
        ['tax_rate', '0'],
        ['low_stock_threshold', '10']
      ];
      for (const [key, value] of defaultSettings) {
        db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
      }

      // API Endpoints
      app.post('/api/auth/login', (req: any, res: any) => {
        const { username, password } = req.body;
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (user && bcrypt.compareSync(password, user.password)) {
          res.json({ id: user.id, username: user.username, role: user.role });
        } else {
          res.status(401).json({ error: 'Invalid credentials' });
        }
      });

      app.get('/api/reports/sales', (req: any, res: any) => {
        try {
          const sales = db.prepare(`
            SELECT date(created_at) as date, SUM(total) as total 
            FROM transactions 
            GROUP BY date(created_at) 
            ORDER BY date DESC LIMIT 7
          `).all();
          res.json(sales.reverse());
        } catch (e) {
          res.status(500).json({ error: 'Failed' });
        }
      });

      app.get('/api/reports/popular', (req: any, res: any) => {
        try {
          const popular = db.prepare(`
            SELECT p.name, SUM(ti.quantity) as count
            FROM transaction_items ti
            JOIN products p ON ti.product_id = p.id
            GROUP BY p.id
            ORDER BY count DESC LIMIT 5
          `).all();
          res.json(popular);
        } catch (e) {
          res.status(500).json({ error: 'Failed' });
        }
      });

      app.post('/api/products/bulk', (req: any, res: any) => {
        const { products } = req.body;
        const insert = db.prepare(`
          INSERT INTO products (name, description, price, stock, category, image_url, barcode, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const transaction = db.transaction((items: any[]) => {
          for (const item of items) {
            insert.run(item.name, item.description, item.price, item.stock, item.category, item.image_url, item.barcode, item.tags);
          }
        });
        try {
          transaction(products);
          res.json({ success: true });
        } catch (e) {
          res.status(500).json({ error: 'Bulk import failed' });
        }
      });

      app.get('/api/products', (req: any, res: any) => {
        const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
        res.json(products);
      });

      app.post('/api/products', (req: any, res: any) => {
        const { name, description, price, stock, category, image_url, barcode, tags } = req.body;
        const info = db.prepare(`
          INSERT INTO products (name, description, price, stock, category, image_url, barcode, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, description, price, stock, category, image_url, barcode, tags);
        res.json({ id: info.lastInsertRowid });
      });

      app.put('/api/products/:id', (req: any, res: any) => {
        const { id } = req.params;
        const { name, description, price, stock, category, image_url, barcode, tags } = req.body;
        db.prepare(`
          UPDATE products 
          SET name = ?, description = ?, price = ?, stock = ?, category = ?, image_url = ?, barcode = ?, tags = ?
          WHERE id = ?
        `).run(name, description, price, stock, category, image_url, barcode, tags, id);
        res.json({ success: true });
      });

      app.delete('/api/products/:id', (req: any, res: any) => {
        const { id } = req.params;
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
        res.json({ success: true });
      });

      app.post('/api/checkout', (req: any, res: any) => {
        const { items, total, payments } = req.body;
        const transaction = db.transaction(() => {
          const info = db.prepare('INSERT INTO transactions (total, items_count) VALUES (?, ?)').run(total, items.length);
          const tid = info.lastInsertRowid;
          
          for (const item of items) {
            db.prepare(`
              INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_time)
              VALUES (?, ?, ?, ?)
            `).run(tid, item.id, item.quantity, item.price);
            db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.id);
          }

          if (payments && Array.isArray(payments)) {
            for (const payment of payments) {
              db.prepare(`
                INSERT INTO transaction_payments (transaction_id, type, amount)
                VALUES (?, ?, ?)
              `).run(tid, payment.type, payment.amount);
            }
          } else {
            // Default to cash if no payments provided (for backward compatibility during migration)
            db.prepare(`
              INSERT INTO transaction_payments (transaction_id, type, amount)
              VALUES (?, 'cash', ?)
            `).run(tid, total);
          }

          return tid;
        });
        try {
          const id = transaction();
          res.json({ success: true, transactionId: id });
        } catch (e) {
          res.status(500).json({ error: 'Checkout failed' });
        }
      });

      app.get('/api/transactions', (req: any, res: any) => {
        try {
          const transactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
          res.json(transactions);
        } catch (e) {
          res.status(500).json({ error: 'Failed to fetch transactions' });
        }
      });

      app.get('/api/transactions/:id', (req: any, res: any) => {
        try {
          const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
          if (tx) res.json(tx);
          else res.status(404).json({ error: 'Not found' });
        } catch (e) {
          res.status(500).json({ error: 'Failed' });
        }
      });

      app.get('/api/transactions/:id/items', (req: any, res: any) => {
        try {
          const items = db.prepare(`
            SELECT ti.*, p.name 
            FROM transaction_items ti 
            JOIN products p ON ti.product_id = p.id 
            WHERE ti.transaction_id = ?
          `).all(req.params.id);
          res.json(items);
        } catch (e) {
          res.status(500).json({ error: 'Failed to fetch transaction items' });
        }
      });
      
      app.get('/api/transactions/:id/payments', (req: any, res: any) => {
        try {
          const payments = db.prepare('SELECT * FROM transaction_payments WHERE transaction_id = ?').all(req.params.id);
          res.json(payments);
        } catch (e) {
          res.status(500).json({ error: 'Failed' });
        }
      });

      app.post('/api/transactions/:id/void', (req: any, res: any) => {
        const trans = db.transaction(() => {
          const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(req.params.id);
          for (const item of items) {
            db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.product_id);
          }
          db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(req.params.id);
          db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
        });
        try {
          trans();
          res.json({ success: true });
        } catch (e) {
          res.status(500).json({ error: 'Void failure' });
        }
      });

      app.get('/api/settings', (req: any, res: any) => {
        try {
          const settings = db.prepare('SELECT * FROM settings').all();
          const settingsObj = settings.reduce((acc: any, curr: any) => {
            acc[curr.key] = curr.value;
            return acc;
          }, {});
          res.json(settingsObj);
        } catch (e) {
          res.status(500).json({ error: 'Failed' });
        }
      });

      app.post('/api/settings', (req: any, res: any) => {
        try {
          const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
          const update = db.transaction((data: any) => {
            for (const [key, value] of Object.entries(data)) {
              const valToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
              stmt.run(key, valToStore);
            }
          });
          update(req.body);
          res.json({ success: true });
        } catch (e) {
          res.status(500).json({ error: 'Failed' });
        }
      });

      app.get('/api/inventory/audits', (req: any, res: any) => {
        try {
          const { product_id, start_date, end_date } = req.query;
          let query = `
            SELECT a.*, p.name as product_name 
            FROM audit_logs a 
            JOIN products p ON a.product_id = p.id 
          `;
          const params = [];
          const conditions = [];

          if (product_id) {
            conditions.push(`a.product_id = ?`);
            params.push(product_id);
          }
          if (start_date) {
            conditions.push(`date(a.created_at) >= date(?)`);
            params.push(start_date);
          }
          if (end_date) {
            conditions.push(`date(a.created_at) <= date(?)`);
            params.push(end_date);
          }

          if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
          }

          query += ` ORDER BY a.created_at DESC LIMIT 100`;
          
          const audits = db.prepare(query).all(...params);
          res.json(audits);
        } catch (e) {
          res.status(500).json({ error: 'Failed' });
        }
      });

      app.post('/api/inventory/audit', (req: any, res: any) => {
        const { product_id, actual_stock, reason } = req.body;
        const trans = db.transaction(() => {
          const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(product_id);
          if (!product) throw new Error('Product not found');
          
          const discrepancy = actual_stock - product.stock;
          
          db.prepare(`
            INSERT INTO audit_logs (product_id, previous_stock, actual_stock, discrepancy, reason)
            VALUES (?, ?, ?, ?, ?)
          `).run(product_id, product.stock, actual_stock, discrepancy, reason);
          
          db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(actual_stock, product_id);
          
          return { discrepancy };
        });
        
        try {
          const result = trans();
          res.json({ success: true, ...result });
        } catch (e) {
          res.status(500).json({ error: 'Audit failed' });
        }
      });

      server.middlewares.use(app);
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), expressPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend'),
    },
  },
  server: {
    port: 3000,
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});

