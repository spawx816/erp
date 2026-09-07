-- ====================================================================
-- NEXUS ERP - POSTGRESQL DATABASE INITIALIZATION SCRIPT
-- ====================================================================
-- Database: nexus_erp
-- User: educrm_user
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS & DOMAINS (Optional / Standard Types)
-- Tables use standard PostgreSQL TIMESTAMP WITH TIME ZONE and NUMERIC

-- 3. COMPANIES & STRUCTURE
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50) NOT NULL UNIQUE,
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'República Dominicana',
    currency VARCHAR(10) DEFAULT 'DOP',
    currency_symbol VARCHAR(10) DEFAULT 'RD$',
    logo_url TEXT,
    timezone VARCHAR(100) DEFAULT 'America/Santo_Domingo',
    allow_negative_inventory BOOLEAN DEFAULT FALSE,
    cash_requires_open_session BOOLEAN DEFAULT TRUE,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100),
    is_main BOOLEAN DEFAULT FALSE,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, code)
);

-- 4. SECURITY, ROLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    module VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT REFERENCES branches(id),
    role_id INT NOT NULL REFERENCES roles(id),
    username VARCHAR(100) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    id_card VARCHAR(50),
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    job_title VARCHAR(100),
    hire_date DATE,
    salary NUMERIC(14,2) DEFAULT 0.00,
    max_discount_percentage NUMERIC(5,2) DEFAULT 5.00,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_branches (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, branch_id)
);

-- 5. SALESPEOPLE
CREATE TABLE IF NOT EXISTS salespeople (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(150),
    zone VARCHAR(100),
    monthly_goal NUMERIC(14,2) DEFAULT 200000.00,
    commission_rate NUMERIC(5,2) DEFAULT 5.00,
    hire_date DATE,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. CATALOG & CLASSIFICATION
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(id),
    brand_id INT REFERENCES brands(id),
    unit_id INT REFERENCES units(id),
    internal_code VARCHAR(100),
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'physical',
    line VARCHAR(150),
    shade_number VARCHAR(50),
    family VARCHAR(100),
    is_dye BOOLEAN DEFAULT FALSE,
    color_hex VARCHAR(20),
    cost NUMERIC(14,4) DEFAULT 0.0000,
    price NUMERIC(14,4) DEFAULT 0.0000,
    min_price NUMERIC(14,4) DEFAULT 0.0000,
    special_price NUMERIC(14,4) DEFAULT 0.0000,
    tax_rate NUMERIC(5,2) DEFAULT 18.00,
    stock_min NUMERIC(14,2) DEFAULT 5.00,
    stock_max NUMERIC(14,2) DEFAULT 1000.00,
    location VARCHAR(100),
    allows_discount BOOLEAN DEFAULT TRUE,
    max_discount_percent NUMERIC(5,2) DEFAULT 15.00,
    image_url TEXT,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, sku)
);

CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(150) NOT NULL,
    sku VARCHAR(100) NOT NULL UNIQUE,
    barcode VARCHAR(100),
    cost NUMERIC(14,4) DEFAULT 0.0000,
    price NUMERIC(14,4) DEFAULT 0.0000,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_lists (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'percentage',
    percentage_change NUMERIC(5,2) DEFAULT 0.00,
    is_default BOOLEAN DEFAULT FALSE,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_list_items (
    id SERIAL PRIMARY KEY,
    price_list_id INT NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price NUMERIC(14,4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(price_list_id, product_id)
);

-- 7. INVENTORY, BATCHES & MOVEMENTS
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(14,4) DEFAULT 0.0000,
    reserved_quantity NUMERIC(14,4) DEFAULT 0.0000,
    average_cost NUMERIC(14,4) DEFAULT 0.0000,
    last_movement_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(warehouse_id, product_id)
);

CREATE TABLE IF NOT EXISTS inventory_batches (
    id SERIAL PRIMARY KEY,
    warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    expiration_date DATE NOT NULL,
    quantity NUMERIC(14,4) DEFAULT 0.0000,
    unit_cost NUMERIC(14,4) DEFAULT 0.0000,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_id INT REFERENCES inventory_batches(id),
    user_id INT REFERENCES users(id),
    type VARCHAR(50) NOT NULL, -- 'in', 'out', 'adjustment', 'transfer_in', 'transfer_out', 'sale', 'purchase', 'return'
    quantity NUMERIC(14,4) NOT NULL,
    balance_after NUMERIC(14,4) NOT NULL,
    unit_cost NUMERIC(14,4) DEFAULT 0.0000,
    total_cost NUMERIC(14,4) DEFAULT 0.0000,
    reference_type VARCHAR(50),
    reference_id INT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transfers (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    from_warehouse_id INT NOT NULL REFERENCES warehouses(id),
    to_warehouse_id INT NOT NULL REFERENCES warehouses(id),
    user_id INT REFERENCES users(id),
    transfer_number VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(30) DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transfer_items (
    id SERIAL PRIMARY KEY,
    transfer_id INT NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    quantity NUMERIC(14,4) NOT NULL,
    unit_cost NUMERIC(14,4) DEFAULT 0.0000
);

CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    warehouse_id INT NOT NULL REFERENCES warehouses(id),
    user_id INT REFERENCES users(id),
    adjustment_number VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(30) NOT NULL,
    reason TEXT,
    total_amount NUMERIC(14,4) DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_adjustment_items (
    id SERIAL PRIMARY KEY,
    adjustment_id INT NOT NULL REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    quantity NUMERIC(14,4) NOT NULL,
    unit_cost NUMERIC(14,4) DEFAULT 0.0000,
    total_cost NUMERIC(14,4) DEFAULT 0.0000
);

-- 8. CUSTOMERS & SUPPLIERS
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    salesperson_id INT REFERENCES salespeople(id),
    price_list_id INT REFERENCES price_lists(id),
    type VARCHAR(30) DEFAULT 'individual', -- individual, salon, business
    code VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(255),
    tax_id VARCHAR(50), -- RNC / Cedula
    rnc_type VARCHAR(50) DEFAULT 'cedula',
    phone VARCHAR(50),
    mobile VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100),
    zone VARCHAR(100),
    credit_limit NUMERIC(14,2) DEFAULT 0.00,
    credit_days INT DEFAULT 0,
    current_balance NUMERIC(14,2) DEFAULT 0.00,
    preferred_ncf_type VARCHAR(50) DEFAULT 'B02',
    notes TEXT,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL UNIQUE,
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(150),
    tax_id VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'República Dominicana',
    payment_terms_days INT DEFAULT 30,
    current_balance NUMERIC(14,2) DEFAULT 0.00,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. FISCAL & NCF (DGII REPÚBLICA DOMINICANA)
CREATE TABLE IF NOT EXISTS ncf_sequences (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT REFERENCES branches(id),
    ncf_type VARCHAR(10) NOT NULL, -- B01, B02, B04, B14, B15, E31, E32, etc.
    series VARCHAR(10) DEFAULT 'B',
    current_sequence BIGINT NOT NULL DEFAULT 1,
    start_sequence BIGINT NOT NULL DEFAULT 1,
    end_sequence BIGINT NOT NULL DEFAULT 99999999,
    authorization_number VARCHAR(100),
    expiration_date DATE,
    alert_threshold INT DEFAULT 100,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, ncf_type, series)
);

CREATE TABLE IF NOT EXISTS ncf_logs (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    ncf_sequence_id INT REFERENCES ncf_sequences(id),
    ncf VARCHAR(50) NOT NULL,
    ncf_type VARCHAR(10) NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id INT NOT NULL,
    customer_tax_id VARCHAR(50),
    total_amount NUMERIC(14,2) DEFAULT 0.00,
    itbis_amount NUMERIC(14,2) DEFAULT 0.00,
    status VARCHAR(30) DEFAULT 'issued', -- issued, cancelled, annulled
    user_id INT REFERENCES users(id),
    issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. CASH REGISTERS & SESSIONS
CREATE TABLE IF NOT EXISTS cash_registers (
    id SERIAL PRIMARY KEY,
    branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, code)
);

CREATE TABLE IF NOT EXISTS cash_sessions (
    id SERIAL PRIMARY KEY,
    cash_register_id INT NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id),
    branch_id INT NOT NULL REFERENCES branches(id),
    session_number VARCHAR(100) NOT NULL UNIQUE,
    opening_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    closing_amount NUMERIC(14,2),
    expected_amount NUMERIC(14,2),
    difference NUMERIC(14,2),
    status VARCHAR(30) DEFAULT 'open',
    opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS cash_movements (
    id SERIAL PRIMARY KEY,
    cash_session_id INT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id),
    type VARCHAR(30) NOT NULL, -- 'in', 'out', 'sale', 'payment', 'expense'
    amount NUMERIC(14,2) NOT NULL,
    concept TEXT NOT NULL,
    reference_type VARCHAR(50),
    reference_id INT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. SALES & BILLING
CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id),
    warehouse_id INT NOT NULL REFERENCES warehouses(id),
    cash_session_id INT REFERENCES cash_sessions(id),
    customer_id INT NOT NULL REFERENCES customers(id),
    salesperson_id INT REFERENCES salespeople(id),
    user_id INT NOT NULL REFERENCES users(id),
    sale_number VARCHAR(100) NOT NULL UNIQUE,
    ncf VARCHAR(50),
    ncf_type VARCHAR(10) DEFAULT 'B02',
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    type VARCHAR(30) DEFAULT 'cash', -- 'cash', 'credit'
    status VARCHAR(30) DEFAULT 'completed', -- 'completed', 'voided', 'quoted'
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(14,2) DEFAULT 0.00,
    tax_amount NUMERIC(14,2) DEFAULT 0.00,
    total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(14,2) DEFAULT 0.00,
    balance NUMERIC(14,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    batch_id INT REFERENCES inventory_batches(id),
    quantity NUMERIC(14,4) NOT NULL,
    unit_cost NUMERIC(14,4) DEFAULT 0.0000,
    unit_price NUMERIC(14,4) NOT NULL,
    discount_percent NUMERIC(5,2) DEFAULT 0.00,
    discount_amount NUMERIC(14,2) DEFAULT 0.00,
    tax_rate NUMERIC(5,2) DEFAULT 18.00,
    tax_amount NUMERIC(14,2) DEFAULT 0.00,
    total NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_payments (
    id SERIAL PRIMARY KEY,
    sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    cash_session_id INT REFERENCES cash_sessions(id),
    user_id INT REFERENCES users(id),
    payment_method VARCHAR(50) NOT NULL, -- cash, transfer, card, check, credit
    amount NUMERIC(14,2) NOT NULL,
    reference_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. ACCOUNTS RECEIVABLE (CxC)
CREATE TABLE IF NOT EXISTS accounts_receivable (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id),
    customer_id INT NOT NULL REFERENCES customers(id),
    sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100),
    ncf VARCHAR(50),
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    paid_amount NUMERIC(14,2) DEFAULT 0.00,
    balance NUMERIC(14,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending', -- pending, partial, paid
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receivable_payments (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id),
    customer_id INT NOT NULL REFERENCES customers(id),
    cash_session_id INT REFERENCES cash_sessions(id),
    user_id INT NOT NULL REFERENCES users(id),
    payment_number VARCHAR(100) NOT NULL UNIQUE,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount NUMERIC(14,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'cash',
    reference_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_allocations (
    id SERIAL PRIMARY KEY,
    payment_id INT NOT NULL REFERENCES receivable_payments(id) ON DELETE CASCADE,
    receivable_id INT NOT NULL REFERENCES accounts_receivable(id) ON DELETE CASCADE,
    amount_applied NUMERIC(14,2) NOT NULL
);

-- 13. CREDIT NOTES (NOTAS DE CRÉDITO B04)
CREATE TABLE IF NOT EXISTS credit_notes (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id),
    customer_id INT NOT NULL REFERENCES customers(id),
    sale_id INT REFERENCES sales(id),
    user_id INT NOT NULL REFERENCES users(id),
    credit_note_number VARCHAR(100) NOT NULL UNIQUE,
    ncf VARCHAR(50) NOT NULL, -- B04
    affected_ncf VARCHAR(50),
    reason TEXT NOT NULL,
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(14,2) DEFAULT 0.00,
    total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    return_to_inventory BOOLEAN DEFAULT TRUE,
    warehouse_id INT REFERENCES warehouses(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_note_items (
    id SERIAL PRIMARY KEY,
    credit_note_id INT NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    quantity NUMERIC(14,4) NOT NULL,
    unit_price NUMERIC(14,4) NOT NULL,
    tax_rate NUMERIC(5,2) DEFAULT 18.00,
    tax_amount NUMERIC(14,2) DEFAULT 0.00,
    total NUMERIC(14,2) NOT NULL
);

-- 14. PURCHASES & ACCOUNTS PAYABLE (CxP)
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id),
    warehouse_id INT NOT NULL REFERENCES warehouses(id),
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    user_id INT NOT NULL REFERENCES users(id),
    purchase_number VARCHAR(100) NOT NULL UNIQUE,
    supplier_invoice_number VARCHAR(100),
    ncf VARCHAR(50),
    ncf_type VARCHAR(10),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    type VARCHAR(30) DEFAULT 'credit',
    status VARCHAR(30) DEFAULT 'received',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(14,2) DEFAULT 0.00,
    total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(14,2) DEFAULT 0.00,
    balance NUMERIC(14,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    batch_number VARCHAR(100),
    expiration_date DATE,
    quantity NUMERIC(14,4) NOT NULL,
    unit_cost NUMERIC(14,4) NOT NULL,
    tax_rate NUMERIC(5,2) DEFAULT 18.00,
    tax_amount NUMERIC(14,2) DEFAULT 0.00,
    total NUMERIC(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts_payable (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id INT NOT NULL REFERENCES branches(id),
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    purchase_id INT REFERENCES purchases(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100),
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    paid_amount NUMERIC(14,2) DEFAULT 0.00,
    balance NUMERIC(14,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payable_payments (
    id SERIAL PRIMARY KEY,
    payable_id INT NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id),
    payment_number VARCHAR(100) NOT NULL UNIQUE,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(14,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'transfer',
    reference_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. EXPENSES & RECURRING EXPENSES
CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES expense_categories(id),
    user_id INT NOT NULL REFERENCES users(id),
    amount NUMERIC(14,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'cash',
    beneficiary VARCHAR(255),
    voucher_number VARCHAR(100),
    notes TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES expense_categories(id),
    concept VARCHAR(255) NOT NULL,
    estimated_amount NUMERIC(14,2) NOT NULL,
    frequency VARCHAR(50) DEFAULT 'monthly',
    due_day INT DEFAULT 15,
    next_due_date DATE NOT NULL,
    last_paid_date DATE,
    responsible_person VARCHAR(150),
    alert_days_before INT DEFAULT 5,
    status VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. IMPORT ORDERS & LANDED COST (SECCIÓN 8)
CREATE TABLE IF NOT EXISTS import_orders (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    order_number VARCHAR(100) NOT NULL UNIQUE,
    origin_country VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'USD',
    exchange_rate NUMERIC(10,4) DEFAULT 58.50,
    fob_total_foreign NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    fob_total_dop NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_expenses_dop NUMERIC(14,2) DEFAULT 0.00,
    total_landed_cost_dop NUMERIC(14,2) DEFAULT 0.00,
    landed_factor NUMERIC(10,6) DEFAULT 1.000000,
    status VARCHAR(30) DEFAULT 'ordered', -- ordered, in_transit, in_customs, received
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_costs (
    id SERIAL PRIMARY KEY,
    import_order_id INT NOT NULL REFERENCES import_orders(id) ON DELETE CASCADE,
    concept VARCHAR(150) NOT NULL, -- Freight, Customs (Aranceles), Insurance, Port charges, Delivery
    amount_dop NUMERIC(14,2) NOT NULL,
    receipt_reference VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS import_items (
    id SERIAL PRIMARY KEY,
    import_order_id INT NOT NULL REFERENCES import_orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    quantity NUMERIC(14,4) NOT NULL,
    unit_fob_foreign NUMERIC(14,4) NOT NULL,
    total_fob_foreign NUMERIC(14,2) NOT NULL,
    unit_fob_dop NUMERIC(14,4) NOT NULL,
    unit_landed_cost_dop NUMERIC(14,4) NOT NULL,
    total_landed_cost_dop NUMERIC(14,2) NOT NULL
);

-- 17. MONTHLY CLOSINGS (CIERRE FISCAL & AUDITORÍA)
CREATE TABLE IF NOT EXISTS monthly_closings (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    period VARCHAR(10) NOT NULL, -- 'YYYY-MM'
    closed_by_user_id INT NOT NULL REFERENCES users(id),
    closed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    total_sales NUMERIC(14,2) DEFAULT 0.00,
    total_tax NUMERIC(14,2) DEFAULT 0.00,
    total_purchases NUMERIC(14,2) DEFAULT 0.00,
    total_expenses NUMERIC(14,2) DEFAULT 0.00,
    net_profit NUMERIC(14,2) DEFAULT 0.00,
    status VARCHAR(30) DEFAULT 'closed',
    notes TEXT,
    UNIQUE(company_id, period)
);

-- 18. SYSTEM SETTINGS & AUDIT LOGS
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id) ON DELETE SET NULL,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    module VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 19. INDEXES FOR HIGH-SPEED LOOKUPS
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_ncf ON sales(ncf);
CREATE INDEX IF NOT EXISTS idx_sales_issue_date ON sales(issue_date);
CREATE INDEX IF NOT EXISTS idx_ar_customer_id ON accounts_receivable(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse_id ON inventory(warehouse_id);

-- ====================================================================
-- SEED INITIAL SYSTEM DATA (ROLES & ADMINISTRATOR)
-- ====================================================================

-- Company
INSERT INTO companies (id, name, legal_name, tax_id, phone, email, address, city)
VALUES (1, 'Nexus Distribuciones SRL', 'Nexus Distribuciones SRL', '131-99887-1', '809-555-0100', 'admin@nexus.do', 'Av. 27 de Febrero #450, Ensanche Naco', 'Santo Domingo')
ON CONFLICT (id) DO NOTHING;

-- Branch & Warehouse
INSERT INTO branches (id, company_id, name, code, is_main, phone, city)
VALUES (1, 1, 'Sucursal Principal', 'SUC-001', TRUE, '809-555-0100', 'Santo Domingo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouses (id, company_id, branch_id, name, code, is_default)
VALUES (1, 1, 1, 'Almacén Central', 'ALM-01', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Roles
INSERT INTO roles (id, company_id, name, slug, description, is_system)
VALUES 
(1, 1, 'Super Administrador', 'admin', 'Acceso total sin restricciones', TRUE),
(2, 1, 'Gerente General', 'gerente', 'Gestión operativa y reportes', TRUE),
(3, 1, 'Cajero Principal', 'cajero', 'Cobros, facturación POS y cuadre de caja', TRUE),
(4, 1, 'Vendedor Comercial', 'vendedor', 'Pedidos, cotizaciones y catálogo', TRUE),
(5, 1, 'Encargado de Almacén', 'almacen', 'Movimientos, compras y transferencias', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Demo Users (Password: admin123)
INSERT INTO users (id, company_id, branch_id, role_id, username, first_name, last_name, email, password_hash, status)
VALUES 
(1, 1, 1, 1, 'admin', 'Administrador', 'Nexus', 'admin@nexus.do', '$2b$10$kj.GS/gTXQvCP0LjtT8LKOyLLg37v3.E8.VPXgCEsNSCv0.gEK7DC', 'active'),
(2, 1, 1, 2, 'gerente', 'Laura', 'Gómez', 'gerente@nexus.do', '$2b$10$kj.GS/gTXQvCP0LjtT8LKOyLLg37v3.E8.VPXgCEsNSCv0.gEK7DC', 'active'),
(3, 1, 1, 3, 'cajero', 'Marcos', 'Díaz', 'cajero@nexus.do', '$2b$10$kj.GS/gTXQvCP0LjtT8LKOyLLg37v3.E8.VPXgCEsNSCv0.gEK7DC', 'active'),
(4, 1, 1, 4, 'vendedor', 'Carlos', 'Mendoza', 'vendedor@nexus.do', '$2b$10$kj.GS/gTXQvCP0LjtT8LKOyLLg37v3.E8.VPXgCEsNSCv0.gEK7DC', 'active'),
(5, 1, 1, 5, 'almacen', 'Roberto', 'Peña', 'almacen@nexus.do', '$2b$10$kj.GS/gTXQvCP0LjtT8LKOyLLg37v3.E8.VPXgCEsNSCv0.gEK7DC', 'active')
ON CONFLICT (id) DO UPDATE SET password_hash = excluded.password_hash, status = 'active';

-- NCF Sequences
INSERT INTO ncf_sequences (company_id, branch_id, ncf_type, series, current_sequence, start_sequence, end_sequence, authorization_number, expiration_date)
VALUES 
(1, 1, 'B01', 'B', 1, 1, 10000, 'NCF-DGII-2026-B01', '2027-12-31'),
(1, 1, 'B02', 'B', 1, 1, 100000, 'NCF-DGII-2026-B02', '2027-12-31'),
(1, 1, 'B04', 'B', 1, 1, 5000, 'NCF-DGII-2026-B04', '2027-12-31'),
(1, 1, 'B14', 'B', 1, 1, 5000, 'NCF-DGII-2026-B14', '2027-12-31'),
(1, 1, 'B15', 'B', 1, 1, 5000, 'NCF-DGII-2026-B15', '2027-12-31')
ON CONFLICT (id) DO NOTHING;

-- Ajustar las secuencias de auto-incremento para que coincidan con los IDs insertados
SELECT setval('companies_id_seq', COALESCE((SELECT MAX(id) FROM companies), 1));
SELECT setval('branches_id_seq', COALESCE((SELECT MAX(id) FROM branches), 1));
SELECT setval('warehouses_id_seq', COALESCE((SELECT MAX(id) FROM warehouses), 1));
SELECT setval('roles_id_seq', COALESCE((SELECT MAX(id) FROM roles), 1));
SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1));
SELECT setval('ncf_sequences_id_seq', COALESCE((SELECT MAX(id) FROM ncf_sequences), 1));
