# RetailPOS — Complete Point of Sale System

A modern, full-stack POS & inventory management system built with React, TypeScript, Tailwind CSS, Node.js, and PostgreSQL.

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 2. Database Setup

```bash
# Create database
psql -U postgres -c "CREATE DATABASE retail_pos;"

# Run schema (creates tables + default admin user)
psql -U postgres -d retail_pos -f database/schema.sql

# Optional: Load sample data
psql -U postgres -d retail_pos -f database/seed.sql
```

### 3. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials

npm install
npm run dev
# API runs on http://localhost:5000
```

### 4. Frontend Setup

```bash
cd frontend
cp .env.example .env

npm install
npm run dev
# App runs on http://localhost:5173
```

### 5. Login

- URL: `http://localhost:5173`
- Email: `admin@retailpos.com`
- Password: `admin123`

---

## Features

| Module | Description |
|--------|-------------|
| **POS Sales** | Fast billing, barcode scanner, promotions, cash/card/mixed payment |
| **Products** | Full CRUD, categories, brands, barcode, SKU |
| **Inventory** | Real-time stock, weighted avg cost, adjustments, movements log |
| **GRN** | Receive goods, auto-update stock & weighted avg cost |
| **Promotions** | % discount, fixed amount, buy-x-get-y, category promos |
| **Reports** | Daily/monthly sales, product sales, inventory, cashier reports |
| **Shifts** | Open/close shift, cash reconciliation, shift reports |
| **Users** | Admin, Manager, Cashier roles with permissions |
| **Dashboard** | Revenue, profit, transactions, top products, trend chart |

---

## Architecture

```
Retail_POS/
├── frontend/          # React + TypeScript + Tailwind (Vite)
│   └── src/
│       ├── pages/     # Login, POS, Products, Inventory, GRN, etc.
│       ├── components/# Layout, UI components, shared
│       ├── store/     # Zustand (auth, POS cart, toasts)
│       ├── services/  # Axios API client
│       └── types/     # TypeScript interfaces
│
├── backend/           # Node.js + Express + TypeScript
│   └── src/
│       ├── routes/    # API route definitions
│       ├── controllers/ # Request handlers
│       ├── services/  # Business logic
│       ├── middleware/ # Auth, error handling
│       └── config/    # Database connection
│
└── database/
    ├── schema.sql     # Full PostgreSQL schema + seed roles
    └── seed.sql       # Sample products and suppliers
```

---

## API Endpoints

```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/products
POST   /api/products
GET    /api/products/barcode/:barcode
GET    /api/products/categories

POST   /api/sales
GET    /api/sales
GET    /api/sales/:id
PUT    /api/sales/:id/void

POST   /api/shifts/open
GET    /api/shifts/current
PUT    /api/shifts/:id/close

POST   /api/grn
GET    /api/grn
GET    /api/grn/suppliers

GET    /api/inventory/movements
POST   /api/inventory/adjust/:productId

GET    /api/reports/dashboard
GET    /api/reports/sales
GET    /api/reports/inventory
GET    /api/reports/product-sales
GET    /api/reports/cashiers

GET    /api/promotions
POST   /api/promotions
GET    /api/users
POST   /api/users
```

---

## Keyboard Shortcuts (POS)

| Key | Action |
|-----|--------|
| F2  | Focus search bar |
| F10 | Open payment dialog |
| Esc | Close modal |

---

## Business Logic

### Weighted Average Cost
When stock is received via GRN:
```
new_avg_cost = (current_stock × current_avg_cost + new_qty × new_price) / (current_stock + new_qty)
```

### Negative Stock
Products allow sales even when stock is 0 or negative (`allow_negative_stock = true`).

### Shift Reconciliation
```
expected_cash = opening_cash + all_cash_sales_during_shift
difference = actual_cash_counted - expected_cash
```

---

## Future Packaging (Electron/Tauri)

The architecture is ready for desktop packaging:

**Electron:**
```bash
# Add to root package.json
npm install --save-dev electron electron-builder
# Build frontend, serve with electron, connect to local PostgreSQL
```

**Tauri:**
```bash
# Add Tauri to frontend
cargo install tauri-cli
npm run tauri init
```

Both approaches work because:
- Frontend is a standard Vite SPA (no SSR)
- Backend runs as a local server
- PostgreSQL can run as a local service or embedded

---

## Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@retailpos.com | admin123 |

Change the password immediately after first login!
