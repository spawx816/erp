-- ====================================================================
-- NEXUS ERP - POSTGRESQL NATIVE SCHEMA (AUTO-GENERATED FROM SCHEMA.JS)
-- ====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- COMPATIBILITY FUNCTIONS
CREATE OR REPLACE FUNCTION strftime(fmt text, ts timestamptz) RETURNS text AS $$
BEGIN
  fmt := replace(fmt, '%Y', 'YYYY');
  fmt := replace(fmt, '%m', 'MM');
  fmt := replace(fmt, '%d', 'DD');
  fmt := replace(fmt, '%H', 'HH24');
  fmt := replace(fmt, '%M', 'MI');
  fmt := replace(fmt, '%S', 'SS');
  RETURN to_char(ts, fmt);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION strftime(fmt text, ts text) RETURNS text AS $$
BEGIN
  IF ts = 'now' THEN
    RETURN strftime(fmt, NOW());
  ELSE
    RETURN strftime(fmt, ts::timestamptz);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION strftime(fmt text, ts date) RETURNS text AS $$
BEGIN
  RETURN strftime(fmt, ts::timestamptz);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION date(ts text) RETURNS date AS $$
BEGIN
  IF ts = 'now' THEN
    RETURN CURRENT_DATE;
  ELSE
    RETURN ts::date;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION date(ts timestamptz) RETURNS date AS $$
BEGIN
  RETURN ts::date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION ifnull(a anyelement, b anyelement) RETURNS anyelement AS $$
BEGIN
  RETURN COALESCE(a, b);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


    -- 1. COMPANIES & STRUCTURE
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      legal_name TEXT NOT NULL,
      tax_id TEXT NOT NULL UNIQUE, -- RNC / Cedula
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'República Dominicana',
      currency TEXT DEFAULT 'DOP',
      currency_symbol TEXT DEFAULT 'RD$',
      logo_url TEXT,
      timezone TEXT DEFAULT 'America/Santo_Domingo',
      allow_negative_inventory INTEGER DEFAULT 0,
      cash_requires_open_session INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      is_main INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, code)
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branch_id, code)
    );

    -- 2. SECURITY, ROLES & PERMISSIONS
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      is_system INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      module TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER REFERENCES branches(id),
      role_id INTEGER NOT NULL REFERENCES roles(id),
      username TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      id_card TEXT, -- Cédula
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      job_title TEXT,
      hire_date DATE,
      salary DECIMAL(14,2) DEFAULT 0.00,
      max_discount_percentage DECIMAL(5,2) DEFAULT 5.00,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_branches (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, branch_id)
    );

    -- 3. SALESPEOPLE (VENDEDORES)
    CREATE TABLE IF NOT EXISTS salespeople (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      zone TEXT,
      monthly_goal DECIMAL(14,2) DEFAULT 200000.00,
      commission_rate DECIMAL(5,2) DEFAULT 5.00,
      hire_date DATE,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. CATALOG & CLASSIFICATION
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL, -- UND, PAR, CJ, TUBO, LT, etc.
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id),
      brand_id INTEGER REFERENCES brands(id),
      unit_id INTEGER REFERENCES units(id),
      internal_code TEXT,
      sku TEXT NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'physical', -- physical, service
      line TEXT, -- e.g. "Coloración Permanente", "Tratamiento Botox", "Cuidado Post-Color"
      shade_number TEXT, -- e.g. "5.0", "5.1", "6.0", "7.3" para tintes
      family TEXT, -- e.g. "Cenizos", "Dorados", "Naturales", "Cobrizos"
      is_dye INTEGER DEFAULT 0, -- 1 si es tinte para vista matricial
      color_hex TEXT, -- preview visual del matiz/color
      cost DECIMAL(14,4) DEFAULT 0.0000,
      price DECIMAL(14,4) DEFAULT 0.0000,
      min_price DECIMAL(14,4) DEFAULT 0.0000,
      special_price DECIMAL(14,4) DEFAULT 0.0000,
      tax_rate DECIMAL(5,2) DEFAULT 18.00, -- ITBIS 18% default RD
      stock_min DECIMAL(14,2) DEFAULT 5.00,
      stock_max DECIMAL(14,2) DEFAULT 1000.00,
      location TEXT,
      allows_discount INTEGER DEFAULT 1,
      max_discount_percent DECIMAL(5,2) DEFAULT 15.00,
      image_url TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, sku)
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT,
      cost DECIMAL(14,4) DEFAULT 0.0000,
      price DECIMAL(14,4) DEFAULT 0.0000,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_lists (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_list_items (
      id SERIAL PRIMARY KEY,
      price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
      price DECIMAL(14,4) NOT NULL,
      UNIQUE(price_list_id, product_id, variant_id)
    );

    -- 5. THIRD PARTIES: CUSTOMERS, SUPPLIERS, AFFILIATES
    CREATE TABLE IF NOT EXISTS customer_groups (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      discount_percentage DECIMAL(5,2) DEFAULT 0.00,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS affiliates (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      institution_name TEXT,
      agreement_details TEXT,
      discount_percentage DECIMAL(5,2) DEFAULT 0.00,
      valid_until DATE,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      salesperson_id INTEGER NOT NULL REFERENCES salespeople(id),
      customer_group_id INTEGER REFERENCES customer_groups(id),
      affiliate_id INTEGER REFERENCES affiliates(id),
      price_list_id INTEGER REFERENCES price_lists(id),
      person_type TEXT DEFAULT 'natural', -- natural, juridica
      first_name TEXT,
      last_name TEXT,
      company_name TEXT,
      id_card TEXT, -- Cedula
      tax_id TEXT, -- RNC
      email TEXT,
      phone TEXT,
      mobile TEXT,
      address TEXT,
      province TEXT,
      municipality TEXT,
      sector TEXT,
      city TEXT,
      latitude REAL,
      longitude REAL,
      contact_person TEXT,
      customer_type TEXT DEFAULT 'Salón de Belleza', -- Salón, Distribuidor, Farmacia, Mayorista, Consumidor Final
      credit_condition TEXT DEFAULT 'credit', -- cash, credit
      credit_limit DECIMAL(14,2) DEFAULT 0.00,
      credit_days INTEGER DEFAULT 30,
      current_balance DECIMAL(14,2) DEFAULT 0.00,
      credit_notes_balance DECIMAL(14,2) DEFAULT 0.00,
      is_credit_blocked INTEGER DEFAULT 0,
      requires_special_auth INTEGER DEFAULT 0,
      allow_sales_with_overdue_invoices INTEGER DEFAULT 0,
      delivery_type TEXT DEFAULT 'Ruta Estándar',
      risk_score TEXT DEFAULT 'low', -- low, medium, high, critical
      authorized_discount DECIMAL(5,2) DEFAULT 0.00,
      credit_notes TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active', -- active, inactive, blocked
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, code)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code TEXT,
      company_name TEXT NOT NULL,
      trade_name TEXT,
      tax_id TEXT NOT NULL, -- RNC
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      contact_person TEXT,
      credit_limit DECIMAL(14,2) DEFAULT 0.00,
      credit_days INTEGER DEFAULT 30,
      current_balance DECIMAL(14,2) DEFAULT 0.00,
      notes TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. INVENTORY, KARDEX & LOTS
    CREATE TABLE IF NOT EXISTS inventories (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
      quantity DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      reserved_quantity DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(warehouse_id, product_id, variant_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_lots (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
      supplier_id INTEGER REFERENCES suppliers(id),
      purchase_id INTEGER,
      lot_number TEXT NOT NULL,
      purchase_date DATE,
      entry_date DATE DEFAULT CURRENT_TIMESTAMP,
      expiration_date DATE,
      initial_quantity DECIMAL(14,4) NOT NULL,
      current_quantity DECIMAL(14,4) NOT NULL,
      unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      to_warehouse_id INTEGER REFERENCES warehouses(id),
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      movement_type TEXT NOT NULL, -- purchase, sale, sale_return, purchase_return, transfer_in, transfer_out, adjustment_in, adjustment_out, physical_count, initial
      previous_quantity DECIMAL(14,4) NOT NULL,
      quantity DECIMAL(14,4) NOT NULL,
      new_quantity DECIMAL(14,4) NOT NULL,
      unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      total_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      reference_type TEXT, -- sales, purchases, transfers, adjustments
      reference_id INTEGER,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      from_branch_id INTEGER NOT NULL REFERENCES branches(id),
      from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      to_branch_id INTEGER NOT NULL REFERENCES branches(id),
      to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      transfer_number TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'requested',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      received_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS inventory_transfer_items (
      id SERIAL PRIMARY KEY,
      transfer_id INTEGER NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      variant_id INTEGER REFERENCES product_variants(id),
      quantity DECIMAL(14,4) NOT NULL,
      unit_cost DECIMAL(14,4) DEFAULT 0.0000
    );

    CREATE TABLE IF NOT EXISTS stock_counts (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      count_number TEXT NOT NULL UNIQUE,
      notes TEXT,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS stock_count_items (
      id SERIAL PRIMARY KEY,
      stock_count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      variant_id INTEGER REFERENCES product_variants(id),
      system_quantity DECIMAL(14,4) NOT NULL,
      counted_quantity DECIMAL(14,4) NOT NULL,
      difference_quantity DECIMAL(14,4) NOT NULL,
      unit_cost DECIMAL(14,4) DEFAULT 0.0000
    );

    -- 7. PURCHASES & ACCOUNTS PAYABLE (CxP)
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      order_number TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'pending',
      expected_date DATE,
      subtotal DECIMAL(14,4) DEFAULT 0.0000,
      tax_amount DECIMAL(14,4) DEFAULT 0.0000,
      total DECIMAL(14,4) DEFAULT 0.0000,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      variant_id INTEGER REFERENCES product_variants(id),
      quantity DECIMAL(14,4) NOT NULL,
      received_quantity DECIMAL(14,4) DEFAULT 0.0000,
      unit_cost DECIMAL(14,4) NOT NULL,
      subtotal DECIMAL(14,4) NOT NULL,
      tax_rate DECIMAL(5,2) DEFAULT 18.00,
      tax_amount DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,4) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      purchase_order_id INTEGER REFERENCES purchase_orders(id),
      purchase_number TEXT NOT NULL UNIQUE,
      supplier_invoice_number TEXT,
      ncf TEXT,
      payment_terms TEXT DEFAULT 'credit', -- cash, credit
      payment_status TEXT DEFAULT 'pending', -- pending, partial, paid
      subtotal DECIMAL(14,4) NOT NULL,
      discount_amount DECIMAL(14,4) DEFAULT 0.0000,
      tax_amount DECIMAL(14,4) NOT NULL,
      other_costs DECIMAL(14,4) DEFAULT 0.0000,
      total DECIMAL(14,4) NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'received',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id SERIAL PRIMARY KEY,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      variant_id INTEGER REFERENCES product_variants(id),
      quantity DECIMAL(14,4) NOT NULL,
      unit_cost DECIMAL(14,4) NOT NULL,
      subtotal DECIMAL(14,4) NOT NULL,
      tax_rate DECIMAL(5,2) DEFAULT 18.00,
      tax_amount DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,4) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts_payable (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      purchase_id INTEGER REFERENCES purchases(id),
      document_number TEXT NOT NULL,
      issue_date DATE NOT NULL,
      due_date DATE NOT NULL,
      amount DECIMAL(14,4) NOT NULL,
      balance DECIMAL(14,4) NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, partial, paid, overdue
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payable_payments (
      id SERIAL PRIMARY KEY,
      payable_id INTEGER NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      payment_date DATE NOT NULL,
      amount DECIMAL(14,4) NOT NULL,
      payment_method TEXT NOT NULL, -- cash, transfer, check
      reference_number TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. FISCAL SPECIFICATION (REPUBLICA DOMINICANA: NCF)
    CREATE TABLE IF NOT EXISTS fiscal_document_types (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code TEXT NOT NULL, -- B01, B02, B04, B14, B15
      name TEXT NOT NULL,
      description TEXT,
      affects_inventory INTEGER DEFAULT 1,
      is_credit_note INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS fiscal_sequences (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      fiscal_type_code TEXT NOT NULL,
      series TEXT NOT NULL DEFAULT 'B',
      prefix TEXT NOT NULL,
      current_number INTEGER NOT NULL DEFAULT 1,
      final_number INTEGER NOT NULL,
      expiration_date DATE,
      warning_threshold INTEGER DEFAULT 50,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branch_id, fiscal_type_code)
    );

    CREATE TABLE IF NOT EXISTS fiscal_sequence_logs (
      id SERIAL PRIMARY KEY,
      fiscal_sequence_id INTEGER NOT NULL REFERENCES fiscal_sequences(id),
      ncf TEXT NOT NULL UNIQUE,
      reference_type TEXT,
      reference_id INTEGER,
      user_id INTEGER REFERENCES users(id),
      used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. CASH REGISTERS & SESSIONS
    CREATE TABLE IF NOT EXISTS cash_registers (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branch_id, code)
    );

    CREATE TABLE IF NOT EXISTS cash_sessions (
      id SERIAL PRIMARY KEY,
      cash_register_id INTEGER NOT NULL REFERENCES cash_registers(id) ON DELETE RESTRICT,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMPTZ,
      initial_cash DECIMAL(14,2) NOT NULL,
      expected_cash DECIMAL(14,2) DEFAULT 0.00,
      counted_cash DECIMAL(14,2) DEFAULT 0.00,
      cash_difference DECIMAL(14,2) DEFAULT 0.00,
      total_card DECIMAL(14,2) DEFAULT 0.00,
      total_transfer DECIMAL(14,2) DEFAULT 0.00,
      total_check DECIMAL(14,2) DEFAULT 0.00,
      total_credit DECIMAL(14,2) DEFAULT 0.00,
      total_sales DECIMAL(14,2) DEFAULT 0.00,
      status TEXT DEFAULT 'open',
      close_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cash_movements (
      id SERIAL PRIMARY KEY,
      cash_session_id INTEGER NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      reason TEXT,
      reference_type TEXT,
      reference_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. SALES, POS & BILLING
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      salesperson_id INTEGER REFERENCES salespeople(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      quote_number TEXT NOT NULL UNIQUE,
      valid_until DATE,
      subtotal DECIMAL(14,4) NOT NULL,
      discount_amount DECIMAL(14,4) DEFAULT 0.0000,
      tax_amount DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,4) NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quote_items (
      id SERIAL PRIMARY KEY,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      variant_id INTEGER REFERENCES product_variants(id),
      quantity DECIMAL(14,4) NOT NULL,
      unit_price DECIMAL(14,4) NOT NULL,
      discount_percent DECIMAL(5,2) DEFAULT 0.00,
      discount_amount DECIMAL(14,4) DEFAULT 0.0000,
      subtotal DECIMAL(14,4) NOT NULL,
      tax_rate DECIMAL(5,2) DEFAULT 18.00,
      tax_amount DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,4) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      cash_session_id INTEGER REFERENCES cash_sessions(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      salesperson_id INTEGER REFERENCES salespeople(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      sale_number TEXT NOT NULL UNIQUE,
      invoice_number TEXT,
      ncf TEXT,
      fiscal_type_code TEXT,
      sale_type TEXT DEFAULT 'cash', -- cash, credit, mixed
      subtotal DECIMAL(14,4) NOT NULL,
      discount_amount DECIMAL(14,4) DEFAULT 0.0000,
      tax_amount DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,4) NOT NULL,
      amount_paid DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      balance DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      change_given DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      due_date DATE,
      delivery_type TEXT DEFAULT 'standard',
      status TEXT DEFAULT 'paid', -- paid, pending, partial, overdue, cancelled
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      variant_id INTEGER REFERENCES product_variants(id),
      product_name TEXT NOT NULL,
      quantity DECIMAL(14,4) NOT NULL,
      unit_cost DECIMAL(14,4) NOT NULL,
      unit_price DECIMAL(14,4) NOT NULL,
      discount_percent DECIMAL(5,2) DEFAULT 0.00,
      discount_amount DECIMAL(14,4) DEFAULT 0.0000,
      subtotal DECIMAL(14,4) NOT NULL,
      tax_rate DECIMAL(5,2) DEFAULT 18.00,
      tax_amount DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,4) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_payments (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      payment_method TEXT NOT NULL,
      amount DECIMAL(14,4) NOT NULL,
      tendered DECIMAL(14,4) DEFAULT 0.00,
      change_given DECIMAL(14,4) DEFAULT 0.00,
      reference_number TEXT,
      card_last_digits TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discount_authorizations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sale_id INTEGER REFERENCES sales(id),
      customer_id INTEGER REFERENCES customers(id),
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
      authorized_by_user_id INTEGER NOT NULL REFERENCES users(id),
      auth_type TEXT DEFAULT 'discount', -- discount, credit_exceeded, blocked_customer, overdue_invoices
      requested_percent DECIMAL(5,2) DEFAULT 0.00,
      discount_amount DECIMAL(14,4) DEFAULT 0.00,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'approved',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. ACCOUNTS RECEIVABLE (CxC), PAYMENTS & COLLECTIONS
    CREATE TABLE IF NOT EXISTS accounts_receivable (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      sale_id INTEGER REFERENCES sales(id),
      invoice_number TEXT NOT NULL,
      ncf TEXT,
      issue_date DATE NOT NULL,
      due_date DATE NOT NULL,
      amount DECIMAL(14,4) NOT NULL,
      balance DECIMAL(14,4) NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, partial, paid, overdue
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS receivable_payments (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      cash_session_id INTEGER REFERENCES cash_sessions(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      payment_number TEXT NOT NULL UNIQUE,
      payment_date DATE NOT NULL,
      total_amount DECIMAL(14,4) NOT NULL,
      payment_method TEXT NOT NULL, -- cash, card, transfer, check, other
      bank_name TEXT,
      reference_number TEXT,
      received_by TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id SERIAL PRIMARY KEY,
      payment_id INTEGER NOT NULL REFERENCES receivable_payments(id) ON DELETE CASCADE,
      receivable_id INTEGER NOT NULL REFERENCES accounts_receivable(id) ON DELETE CASCADE,
      amount_applied DECIMAL(14,4) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Collection follow-ups and payment promises
    CREATE TABLE IF NOT EXISTS collection_notes (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      contact_channel TEXT NOT NULL, -- phone, whatsapp, email, visit
      result TEXT NOT NULL, -- promise, not_answering, disputed, rescheduled, paid
      notes TEXT,
      promise_date DATE,
      promise_amount DECIMAL(14,4) DEFAULT 0.0000,
      status TEXT DEFAULT 'pending', -- pending, fulfilled, broken, cancelled
      next_action_date DATE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. RETURNS & CREDIT NOTES
    CREATE TABLE IF NOT EXISTS credit_notes (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      ncf TEXT NOT NULL UNIQUE, -- B04
      credit_note_number TEXT NOT NULL UNIQUE,
      return_type TEXT DEFAULT 'partial', -- total, partial, financial_adjustment
      reason TEXT NOT NULL,
      subtotal DECIMAL(14,4) NOT NULL,
      tax_amount DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,4) NOT NULL,
      action_taken TEXT NOT NULL, -- refund_cash, credit_cxc, store_credit
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS credit_note_items (
      id SERIAL PRIMARY KEY,
      credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      variant_id INTEGER REFERENCES product_variants(id),
      quantity DECIMAL(14,4) NOT NULL,
      unit_price DECIMAL(14,4) NOT NULL,
      subtotal DECIMAL(14,4) NOT NULL,
      tax_rate DECIMAL(5,2) NOT NULL,
      tax_amount DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,4) NOT NULL,
      returned_to_inventory INTEGER DEFAULT 1
    );

    -- 13. EXPENSES, PETTY CASH & RECURRING PAYMENTS
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      category_id INTEGER NOT NULL REFERENCES expense_categories(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      cash_session_id INTEGER REFERENCES cash_sessions(id),
      amount DECIMAL(14,2) NOT NULL,
      payment_method TEXT NOT NULL,
      beneficiary TEXT,
      voucher_number TEXT,
      voucher_file_url TEXT,
      notes TEXT,
      expense_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER REFERENCES branches(id),
      category_id INTEGER REFERENCES expense_categories(id),
      concept TEXT NOT NULL,
      estimated_amount DECIMAL(14,2) NOT NULL,
      frequency TEXT DEFAULT 'monthly', -- monthly, biweekly, annual, weekly
      due_day INTEGER NOT NULL, -- día del mes (1 al 31)
      next_due_date DATE NOT NULL,
      responsible_person TEXT,
      alert_days_before INTEGER DEFAULT 7,
      status TEXT DEFAULT 'pending', -- pending, upcoming, overdue, paid
      last_paid_date DATE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 14. SALES COMMISSIONS
    CREATE TABLE IF NOT EXISTS commissions (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      salesperson_id INTEGER NOT NULL REFERENCES salespeople(id) ON DELETE CASCADE,
      sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES receivable_payments(id),
      invoice_number TEXT NOT NULL,
      base_amount DECIMAL(14,4) NOT NULL,
      commission_rate DECIMAL(5,2) NOT NULL,
      commission_amount DECIMAL(14,4) NOT NULL,
      calculation_type TEXT DEFAULT 'invoiced', -- invoiced, collected
      status TEXT DEFAULT 'pending', -- pending, paid, cancelled
      paid_at TIMESTAMPTZ,
      receipt_number TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 15. MONTHLY CLOSINGS (CIERRE MENSUAL)
    CREATE TABLE IF NOT EXISTS monthly_closings (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      total_sales DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      total_collections DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      pending_receivables DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      discounts_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      credit_notes_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      purchases_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      operating_expenses DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      administrative_expenses DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      fixed_expenses DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      commissions_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      cogs DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      gross_profit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      net_profit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      previous_sales DECIMAL(14,2) DEFAULT 0.00,
      previous_net_profit DECIMAL(14,2) DEFAULT 0.00,
      status TEXT DEFAULT 'closed', -- open, closed
      closed_by_user_id INTEGER REFERENCES users(id),
      closed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      UNIQUE(company_id, month, year)
    );

    -- 16. AUDIT TRAIL, NOTIFICATIONS & SETTINGS
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      ip_address TEXT,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT,
      old_values TEXT,
      new_values TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      type TEXT NOT NULL, -- overdue_invoice, credit_exceeded, stock_low, recurring_expense, authorization, promise_broken
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
      is_read INTEGER DEFAULT 0,
      link TEXT,
      reference_type TEXT,
      reference_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS backups (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id),
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      backup_type TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'completed',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_logs (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      entity_type TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      success_rows INTEGER NOT NULL,
      error_rows INTEGER NOT NULL,
      error_details TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, key)
    );

    -- INDEXES FOR PEAK QUERY PERFORMANCE
    CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_line ON products(line);
    CREATE INDEX IF NOT EXISTS idx_products_shade ON products(shade_number);
    CREATE INDEX IF NOT EXISTS idx_inventories_lookup ON inventories(warehouse_id, product_id, variant_id);
    CREATE INDEX IF NOT EXISTS idx_movements_prod ON inventory_movements(product_id, warehouse_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_company ON sales(company_id, branch_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_ncf ON sales(ncf);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_salesperson ON sales(salesperson_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_company ON purchases(company_id, branch_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_cxc_customer ON accounts_receivable(customer_id, status);
    CREATE INDEX IF NOT EXISTS idx_cxp_supplier ON accounts_payable(supplier_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_lookup ON audit_logs(company_id, module, created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(company_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_expenses(next_due_date, status);
  