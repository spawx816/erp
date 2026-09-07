import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Barcode, ShoppingCart, Trash2, Plus, Minus,
  CreditCard, Banknote, ArrowRight, UserPlus, Check,
  AlertTriangle, ShieldAlert, Sparkles, Receipt,
  UserCheck, FileText, HandCoins, AlertCircle, X,
  Phone, MapPin, DollarSign, Clock, ShieldCheck
} from 'lucide-react';
import api from '../services/api';
import ThermalReceipt from '../components/ThermalReceipt';
import { useToast } from '../context/ToastContext';

export default function POSPage({ user, activeBranch, activeSession, onOpenCashModal, onNavigate }) {
  const { addToast } = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');

  // Cart State
  const [cart, setCart] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [fiscalType, setFiscalType] = useState('B02'); // B02: Consumo
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [showCustomerSidePanel, setShowCustomerSidePanel] = useState(true);
  const [warehouses, setWarehouses] = useState([]);
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  // Payment Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // cash, card, transfer, credit, mixed
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [paymentBreakdown, setPaymentBreakdown] = useState([]); // for mixed
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);

  // Statement modal & Quick payment modal from side panel
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementData, setStatementData] = useState(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Quick Collection Modal from side panel
  const [showQuickCollectionModal, setShowQuickCollectionModal] = useState(false);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayMethod, setQuickPayMethod] = useState('cash');
  const [payingCollection, setPayingCollection] = useState(false);

  // Supervisor discount / credit override modal
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [supervisorCreds, setSupervisorCreds] = useState({ username: '', password: '' });
  const [supervisorReason, setSupervisorReason] = useState('');

  const barcodeRef = useRef(null);

  useEffect(() => {
    loadInitialData();
  }, [activeBranch]);

  useEffect(() => {
    if (selectedWarehouseId) {
      loadProductsForWarehouse(selectedWarehouseId);
    }
  }, [selectedWarehouseId]);

  const loadProductsForWarehouse = async (whId) => {
    try {
      const res = await api.get('/catalog/products', { limit: 120, warehouse_id: whId });
      if (res.success) setProducts(res.data);
    } catch (err) {
      console.error('Error updating products for warehouse:', err);
    }
  };

  useEffect(() => {
    if (allWarehouses.length > 0) {
      const branchWhs = activeBranch?.id
        ? allWarehouses.filter(w => Number(w.branch_id) === Number(activeBranch.id))
        : [];
      const finalWhs = branchWhs.length > 0 ? branchWhs : allWarehouses;
      setWarehouses(finalWhs);
      const matched = finalWhs.find(w => Number(w.id) === Number(selectedWarehouseId));
      if (!matched) {
        const defaultWh = finalWhs.find(w => w.is_default === 1) || finalWhs[0];
        if (defaultWh) {
          setSelectedWarehouseId(defaultWh.id);
        }
      }
    }
  }, [activeBranch, allWarehouses]);

  useEffect(() => {
    if (selectedCustomer?.id) {
      loadCustomerDetails(selectedCustomer.id);
    }
  }, [selectedCustomer]);

  const loadInitialData = async () => {
    try {
      const [prodsRes, catsRes, custsRes, branchRes] = await Promise.all([
        api.get('/catalog/products', { limit: 120, warehouse_id: selectedWarehouseId || undefined }),
        api.get('/catalog/categories'),
        api.get('/third-parties/customers'),
        api.get('/admin/branches-warehouses')
      ]);

      if (prodsRes.success) setProducts(prodsRes.data);
      if (catsRes.success) setCategories(catsRes.data);
      if (custsRes.success) {
        setCustomers(custsRes.data);
        // Default to first customer or Consumidor Final
        const defaultCust = custsRes.data.find(c => c.id_card === '000-0000000-0') || custsRes.data[0];
        setSelectedCustomer(defaultCust);
      }
      if (branchRes.success && Array.isArray(branchRes.warehouses)) {
        setAllWarehouses(branchRes.warehouses);
        const branchWarehouses = activeBranch?.id
          ? branchRes.warehouses.filter(w => Number(w.branch_id) === Number(activeBranch.id))
          : [];
        const finalWhs = branchWarehouses.length > 0 ? branchWarehouses : branchRes.warehouses;
        setWarehouses(finalWhs);
        const defaultWh = finalWhs.find(w => w.is_default === 1) || finalWhs[0];
        if (defaultWh) {
          setSelectedWarehouseId(defaultWh.id);
        }
      }
    } catch (err) {
      console.error('Failed to load POS data:', err);
    }
  };

  const loadCustomerDetails = async (custId) => {
    try {
      const res = await api.get(`/third-parties/customers/${custId}/360`);
      if (res.success) {
        setCustomerDetails(res.data);
        // Auto apply fixed discount if configured
        if (res.data.customer?.discount_percent > 0) {
          setDiscountPercent(Number(res.data.customer.discount_percent));
        }
      }
    } catch (err) {
      console.error('Error loading customer 360 for side panel:', err);
    }
  };

  const loadStatement = async () => {
    if (!selectedCustomer) return;
    setLoadingStatement(true);
    setShowStatementModal(true);
    try {
      const res = await api.get(`/third-parties/customers/${selectedCustomer.id}/statement`);
      if (res.success) {
        setStatementData(res.data);
      }
    } catch (err) {
      addToast('Error cargando estado de cuenta.', 'error');
    } finally {
      setLoadingStatement(false);
    }
  };

  const handleQuickCollection = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !quickPayAmount || Number(quickPayAmount) <= 0) return;
    setPayingCollection(true);
    try {
      const res = await api.post('/finance/receivables/pay', {
        customer_id: selectedCustomer.id,
        amount: Number(quickPayAmount),
        payment_method: quickPayMethod,
        notes: 'Cobro rápido registrado desde Facturación POS'
      });
      if (res.success) {
        addToast(`Cobro de RD$ ${Number(quickPayAmount).toFixed(2)} registrado con éxito.`, 'success');
        setShowQuickCollectionModal(false);
        setQuickPayAmount('');
        loadCustomerDetails(selectedCustomer.id);
      }
    } catch (err) {
      addToast(err.message || 'Error registrando cobro.', 'error');
    } finally {
      setPayingCollection(false);
    }
  };

  // Barcode scanner trigger
  const handleBarcodeScan = async (e) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      e.preventDefault();
      try {
        const res = await api.get(`/catalog/products/barcode/${barcodeInput.trim()}`);
        if (res.success) {
          if (res.type === 'variant') {
            addToCart({
              id: res.data.product_id,
              name: `${res.data.product_name} (${res.data.variant_name})`,
              price: res.data.price,
              cost: res.data.cost,
              tax_rate: res.data.tax_rate,
              type: res.data.type,
              variant_id: res.data.id
            });
          } else {
            addToCart(res.data);
          }
          setBarcodeInput('');
        }
      } catch (err) {
        addToast(err.message || 'Código de barras no registrado.', 'warning');
      }
    }
  };

  const addToCart = (product, variant = null) => {
    const stockAvailable = Number(product.total_stock ?? 0);
    if (product.type === 'physical' && stockAvailable <= 0) {
      addToast(`Sin existencias en este almacén para [${product.name}].`, 'warning');
      return;
    }

    const itemKey = variant ? `${product.id}-${variant.id}` : `${product.id}-null`;
    const existingIndex = cart.findIndex(it => it.key === itemKey);

    const price = variant ? Number(variant.price) : Number(product.price);
    const cost = variant ? Number(variant.cost) : Number(product.cost);

    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      setCart([...cart, {
        key: itemKey,
        product_id: product.id,
        variant_id: variant ? variant.id : null,
        name: variant ? `${product.name} (${variant.variant_name})` : product.name,
        price,
        cost,
        tax_rate: Number(product.tax_rate || 18),
        type: product.type,
        quantity: 1,
        discount_percent: 0
      }]);
    }
  };

  const updateQuantity = (key, delta) => {
    setCart(cart.map(item => {
      if (item.key === key) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromCart = (key) => {
    setCart(cart.filter(item => item.key !== key));
  };

  // Calculations
  const subtotal = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const generalDiscountAmount = subtotal * (discountPercent / 100);
  const netSubtotal = subtotal - generalDiscountAmount;
  const itbisTax = netSubtotal * 0.18;
  const total = netSubtotal + itbisTax;

  // Credit check
  const custCreditLimit = Number(customerDetails?.customer?.credit_limit || selectedCustomer?.credit_limit || 0);
  const custBalance = Number(customerDetails?.customer?.current_balance || selectedCustomer?.current_balance || 0);
  const custAvailable = Math.max(0, custCreditLimit - custBalance);
  const overdueCount = customerDetails?.kpis?.overdue_invoices_count || 0;
  const overdueBalance = customerDetails?.kpis?.overdue_balance || 0;

  // Visual Semaphore:
  // Verde: Al día
  // Amarillo: Facturas por vencer o crédito al 80%
  // Rojo: Facturas vencidas o crédito excedido
  let semaphoreColor = '#10b981';
  let semaphoreText = 'Al Día (Crédito Disponible)';
  let semaphoreClass = 'badge-success';

  if (overdueCount > 0 || custBalance > custCreditLimit) {
    semaphoreColor = '#ef4444';
    semaphoreText = overdueCount > 0 ? `${overdueCount} Facturas Vencidas` : 'Límite de Crédito Excedido';
    semaphoreClass = 'badge-danger';
  } else if (custCreditLimit > 0 && (custBalance / custCreditLimit) >= 0.8) {
    semaphoreColor = '#f59e0b';
    semaphoreText = 'Crédito al 80%+ de Utilización';
    semaphoreClass = 'badge-warning';
  }

  const handleOpenPayment = () => {
    if (cart.length === 0) return;

    if (!selectedWarehouseId && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }

    // Check discount limit authorization
    if (discountPercent > Number(user.max_discount_percentage || 15)) {
      setSupervisorReason(`Descuento de ${discountPercent}% excede el límite del vendedor (${user.max_discount_percentage}%).`);
      setShowSupervisorModal(true);
      return;
    }

    setTenderedAmount(total.toFixed(2));
    setShowPayModal(true);
  };

  const handleProcessCheckout = async () => {
    // If credit sale, check credit available
    if (paymentMethod === 'credit') {
      if (custCreditLimit <= 0) {
        addToast('El cliente no posee línea de crédito autorizada.', 'error');
        return;
      }
      if (total > custAvailable && !supervisorCreds.username) {
        setSupervisorReason(`Monto de venta (RD$ ${total.toFixed(2)}) supera el crédito disponible (RD$ ${custAvailable.toFixed(2)}).`);
        setShowSupervisorModal(true);
        return;
      }
    }

    setLoadingCheckout(true);
    try {
      let payments = [];
      const tender = Number(tenderedAmount || total);

      if (paymentMethod === 'cash') {
        payments = [{ payment_method: 'cash', amount: total, tendered: tender }];
      } else if (paymentMethod === 'card') {
        payments = [{ payment_method: 'card', amount: total, tendered: total }];
      } else if (paymentMethod === 'transfer') {
        payments = [{ payment_method: 'transfer', amount: total, tendered: total }];
      } else if (paymentMethod === 'credit') {
        payments = [{ payment_method: 'credit', amount: total, tendered: total }];
      } else if (paymentMethod === 'mixed') {
        payments = paymentBreakdown;
      }

      const payload = {
        customer_id: selectedCustomer?.id,
        warehouse_id: selectedWarehouseId || (warehouses[0]?.id),
        fiscal_type_code: fiscalType,
        discount_percent: discountPercent,
        supervisor_auth: supervisorCreds.username ? supervisorCreds : null,
        items: cart.map(it => ({
          product_id: it.product_id,
          variant_id: it.variant_id,
          quantity: it.quantity,
          unit_price: it.price,
          tax_rate: it.tax_rate
        })),
        payments
      };

      const res = await api.post('/sales/checkout', payload);
      if (res.success) {
        addToast('Venta facturada exitosamente con NCF fiscal asignado.', 'success');
        setCompletedSale({
          ...res.data,
          customer_name: selectedCustomer ? (selectedCustomer.company_name || `${selectedCustomer.first_name} ${selectedCustomer.last_name}`) : 'Consumidor Final',
          customer_tax_id: selectedCustomer?.tax_id || selectedCustomer?.id_card,
          seller_name: customerDetails?.customer?.salesperson_name || `${user.first_name} ${user.last_name}`,
          items: cart.map(it => ({
            product_name: it.name,
            quantity: it.quantity,
            unit_price: it.price,
            total: (it.price * it.quantity) * 1.18
          })),
          payments
        });

        // Reset cart
        setCart([]);
        setDiscountPercent(0);
        setShowPayModal(false);
        setSupervisorCreds({ username: '', password: '' });
        if (selectedCustomer) loadCustomerDetails(selectedCustomer.id);
      }
    } catch (err) {
      addToast(err.message || 'Error procesando la venta.', 'error');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.shade_number && p.shade_number.toLowerCase().includes(search.toLowerCase()));
    return matchCategory && matchSearch;
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: showCustomerSidePanel ? '1fr 380px 320px' : '1fr 400px',
      gap: '16px',
      height: 'calc(100vh - 120px)',
      minHeight: '620px',
      transition: 'all 0.3s ease'
    }}>
      {/* COLUMN 1: Catalog, Barcode Scan & Search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'hidden' }}>
        {/* Barcode & Search Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Barcode size={18} color="var(--accent-primary)" style={{ position: 'absolute', left: '12px' }} />
            <input
              ref={barcodeRef}
              type="text"
              className="input-control"
              placeholder="Escanear código de barras (Enter)..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              style={{ paddingLeft: '40px', height: '42px', fontWeight: 600, border: '1px solid #3b82f6' }}
            />
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px' }} />
            <input
              type="text"
              className="input-control"
              placeholder="Buscar por nombre, tono (ej: 6.0) o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '40px', height: '42px' }}
            />
          </div>
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          <button
            onClick={() => setSelectedCategory(null)}
            className={`btn btn-sm ${!selectedCategory ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '9999px', whiteSpace: 'nowrap', fontSize: '0.75rem' }}
          >
            Todos
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`btn btn-sm ${selectedCategory === cat.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '9999px', whiteSpace: 'nowrap', fontSize: '0.75rem' }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px', paddingRight: '2px' }}>
          {filteredProducts.map(prod => (
            <div
              key={prod.id}
              className="card"
              style={{
                padding: '12px',
                cursor: prod.total_stock <= 0 ? 'not-allowed' : 'pointer',
                opacity: prod.total_stock <= 0 ? 0.65 : 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.16s ease'
              }}
              onClick={() => {
                if (prod.variants && prod.variants.length > 0) {
                  addToCart(prod, prod.variants[0]);
                } else {
                  addToCart(prod);
                }
              }}
              onMouseEnter={(e) => {
                if (prod.total_stock > 0) {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{prod.sku}</span>
                  <span
                    className={`badge ${prod.total_stock > prod.stock_min ? 'badge-success' : prod.total_stock > 0 ? 'badge-warning' : 'badge-danger'}`}
                    style={{ fontSize: '0.62rem', fontWeight: 700 }}
                  >
                    {prod.total_stock > 0 ? `Stock: ${prod.total_stock}` : 'Sin Stock'}
                  </span>
                </div>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: '1.25', minHeight: '32px' }}>
                  {prod.name}
                </h4>
              </div>

              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#60a5fa' }}>
                  RD$ {Number(prod.price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
                {prod.shade_number && (
                  <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.2)', color: '#f472b6', fontSize: '0.65rem' }}>
                    {prod.shade_number}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* COLUMN 2: Cart & Billing Form */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '16px', overflow: 'hidden' }}>
        {/* Document Header & Customer Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
            {/* Fiscal Type */}
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Comprobante Fiscal</label>
              <select
                className="select-control"
                value={fiscalType}
                onChange={(e) => setFiscalType(e.target.value)}
                style={{ height: '34px', fontSize: '0.78rem', padding: '4px 8px' }}
              >
                <option value="B02">B02 - Consumo Final</option>
                <option value="B01">B01 - Crédito Fiscal</option>
                <option value="B14">B14 - Regímenes Especiales</option>
                <option value="B15">B15 - Gubernamental</option>
              </select>
            </div>

            {/* Warehouse */}
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Almacén</label>
              <select
                id="pos-warehouse-select"
                className="select-control"
                value={selectedWarehouseId || ''}
                onChange={(e) => setSelectedWarehouseId(Number(e.target.value))}
                style={{ height: '34px', fontSize: '0.78rem', padding: '4px 8px' }}
              >
                {warehouses.length === 0 ? (
                  <option value="">Cargando almacén...</option>
                ) : (
                  warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.code ? `(${w.code})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Customer Selection & Side Panel Toggle */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Cliente Asignado</label>
              <button
                type="button"
                onClick={() => setShowCustomerSidePanel(!showCustomerSidePanel)}
                style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <UserCheck size={12} />
                <span>{showCustomerSidePanel ? 'Ocultar Panel' : 'Ver Ficha'}</span>
              </button>
            </div>

            <select
              className="select-control"
              value={selectedCustomer?.id || ''}
              onChange={(e) => {
                const found = customers.find(c => c.id === parseInt(e.target.value, 10));
                setSelectedCustomer(found);
              }}
              style={{ height: '34px', fontSize: '0.78rem', padding: '4px 8px' }}
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.company_name || `${c.first_name} ${c.last_name}`} {c.tax_id ? `(${c.tax_id})` : ''}
                </option>
              ))}
            </select>

            {/* Permanent Salesperson Auto-assigned Badge */}
            {selectedCustomer && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', padding: '4px 8px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', fontSize: '0.72rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Vendedor Asignado:</span>
                <span style={{ fontWeight: 700, color: '#60a5fa' }}>
                  {selectedCustomer.salesperson_name || 'Vendedor General'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Cart Items List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {cart.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <ShoppingCart size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p style={{ fontSize: '0.82rem' }}>El carrito está vacío</p>
            </div>
          ) : (
            cart.map(item => (
              <div
                key={item.key}
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{item.name}</p>
                  <button onClick={() => removeFromCart(item.key)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    <Trash2 size={13} color="var(--danger)" />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button onClick={() => updateQuantity(item.key, -1)} className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', height: '24px' }}>
                      <Minus size={11} />
                    </button>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: '20px', textAlign: 'center', color: 'var(--text-primary)' }}>
                      {item.quantity}
                    </span>
                    <button onClick={() => updateQuantity(item.key, 1)} className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', height: '24px' }}>
                      <Plus size={11} />
                    </button>
                  </div>

                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#60a5fa' }}>
                    RD$ {(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Totals & Pay Button */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Descuento (%):</span>
            <input
              type="number"
              min="0"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              className="input-control"
              style={{ width: '65px', height: '26px', padding: '2px 6px', textAlign: 'right', fontSize: '0.78rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span>Subtotal:</span>
            <span>RD$ {subtotal.toFixed(2)}</span>
          </div>

          {discountPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--warning)' }}>
              <span>Descuento ({discountPercent}%):</span>
              <span>- RD$ {generalDiscountAmount.toFixed(2)}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span>ITBIS (18%):</span>
            <span>RD$ {itbisTax.toFixed(2)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
            <span>TOTAL:</span>
            <span style={{ color: '#38bdf8' }}>RD$ {total.toFixed(2)}</span>
          </div>

          <button
            onClick={handleOpenPayment}
            disabled={cart.length === 0}
            className="btn btn-primary"
            style={{ width: '100%', height: '42px', fontSize: '0.95rem', marginTop: '2px' }}
          >
            <Banknote size={18} />
            <span>Cobrar (RD$ {total.toFixed(2)})</span>
          </button>
        </div>
      </div>

      {/* COLUMN 3: SECTION #37 CUSTOMER SIDE PANEL */}
      {showCustomerSidePanel && (
        <div className="card" style={{ padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--bg-card)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
          {/* Side Panel Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserCheck size={16} color="#60a5fa" />
              <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>Ficha del Cliente</h4>
            </div>
            <span className={`badge ${semaphoreClass}`} style={{ fontSize: '0.65rem' }}>
              {semaphoreText}
            </span>
          </div>

          {selectedCustomer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* General Data */}
              <div>
                <h5 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedCustomer.company_name || `${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
                </h5>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  RNC/Cédula: {selectedCustomer.tax_id || selectedCustomer.id_card || 'Consumidor Final'}
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {selectedCustomer.city || 'Santo Domingo'} • Tel: {selectedCustomer.phone || '-'}
                </p>
              </div>

              {/* Commercial Conditions */}
              <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Vendedor Permanente:</span>
                  <span style={{ fontWeight: 700, color: '#60a5fa' }}>{selectedCustomer.salesperson_name || 'Carlos Mendoza'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Lista de Precios:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedCustomer.price_list_name || 'Mayorista Estándar'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Descuento Fijo:</span>
                  <span style={{ fontWeight: 700, color: '#a78bfa' }}>{selectedCustomer.discount_percent || 0}%</span>
                </div>
              </div>

              {/* Credit Status & Semaphores */}
              <div style={{ background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Línea de Crédito & Saldos
                </span>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Límite Aprobado:</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    RD$ {custCreditLimit.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Balance Deudor Actual:</span>
                  <span style={{ fontWeight: 800, color: custBalance > 0 ? '#38bdf8' : 'var(--text-muted)' }}>
                    RD$ {custBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Crédito Disponible:</span>
                  <span style={{ fontWeight: 800, color: custAvailable > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    RD$ {custAvailable.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Credit bar */}
                {custCreditLimit > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle-2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.round((custBalance / custCreditLimit) * 100))}%`,
                          height: '100%',
                          background: semaphoreColor,
                          borderRadius: '3px'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Overdue Invoices Alert Box */}
              {overdueCount > 0 && (
                <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.12)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', fontWeight: 700 }}>
                    <AlertCircle size={14} />
                    <span>{overdueCount} Facturas Vencidas</span>
                  </div>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.9rem', marginTop: '4px' }}>
                    RD$ {Number(overdueBalance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}

              {/* Quick Actions Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={loadStatement}
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <FileText size={14} />
                  <span>Ver Estado de Cuenta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQuickCollectionModal(true)}
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  <HandCoins size={14} />
                  <span>Registrar Cobro Rápido</span>
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>
              Selecciona un cliente para ver su panel lateral.
            </p>
          )}
        </div>
      )}

      {/* QUICK COLLECTION MODAL */}
      {showQuickCollectionModal && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setShowQuickCollectionModal(false)}>
          <div className="modal-content" style={{ maxWidth: '420px', padding: '22px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Registrar Cobro a Cliente</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {selectedCustomer.company_name || `${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
                </p>
              </div>
              <button onClick={() => setShowQuickCollectionModal(false)} className="btn btn-secondary btn-sm">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleQuickCollection} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ padding: '10px 12px', background: 'var(--bg-main)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Balance Total Adeudado:</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8' }}>
                  RD$ {custBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <label className="label-control">Monto a Cobrar (RD$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-control"
                  placeholder="0.00"
                  value={quickPayAmount}
                  onChange={(e) => setQuickPayAmount(e.target.value)}
                  style={{ fontSize: '1.1rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label className="label-control">Método de Cobro</label>
                <select
                  className="select-control"
                  value={quickPayMethod}
                  onChange={(e) => setQuickPayMethod(e.target.value)}
                >
                  <option value="cash">Efectivo (Ingreso a Caja)</option>
                  <option value="transfer">Transferencia Bancaria</option>
                  <option value="check">Cheque</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowQuickCollectionModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={payingCollection} className="btn btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  {payingCollection ? 'Registrando...' : 'Confirmar Cobro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOMER STATEMENT MODAL */}
      {showStatementModal && (
        <div className="modal-overlay" onClick={() => setShowStatementModal(false)}>
          <div className="modal-content modal-content-xl" style={{ padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Estado de Cuenta: {statementData?.customer?.company_name || selectedCustomer?.company_name || `${selectedCustomer?.first_name} ${selectedCustomer?.last_name}`}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  RNC/Cédula: {statementData?.customer?.tax_id || selectedCustomer?.tax_id || selectedCustomer?.id_card}
                </p>
              </div>
              <button onClick={() => setShowStatementModal(false)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            {loadingStatement ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
                <div style={{ width: '28px', height: '28px', border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              </div>
            ) : statementData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Balance totals */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Saldo Total Adeudado</span>
                    <p style={{ fontSize: '1.3rem', fontWeight: 900, color: statementData.summary?.current_balance > 0 ? '#38bdf8' : 'var(--success)' }}>
                      RD$ {Number(statementData.summary?.current_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total Facturas Pendientes</span>
                    <p style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                      {statementData.summary?.open_invoices_count || 0}
                    </p>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Saldo Vencido</span>
                    <p style={{ fontSize: '1.3rem', fontWeight: 900, color: statementData.summary?.overdue_balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      RD$ {Number(statementData.summary?.overdue_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Ledger table */}
                <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Factura / NCF</th>
                        <th>Vencimiento</th>
                        <th>Monto Original</th>
                        <th>Balance Pendiente</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.invoices?.map(inv => (
                        <tr key={inv.id}>
                          <td>{inv.issue_date}</td>
                          <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number || inv.ncf}</td>
                          <td style={{ color: inv.is_overdue ? 'var(--danger)' : 'inherit' }}>{inv.due_date}</td>
                          <td>RD$ {Number(inv.amount).toFixed(2)}</td>
                          <td style={{ fontWeight: 800, color: '#38bdf8' }}>RD$ {Number(inv.balance).toFixed(2)}</td>
                          <td>
                            <span className={`badge ${inv.status === 'paid' ? 'badge-success' : inv.status === 'overdue' ? 'badge-danger' : 'badge-warning'}`}>
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={() => window.print()} className="btn btn-secondary">
                    Imprimir Estado
                  </button>
                  <button onClick={() => setShowStatementModal(false)} className="btn btn-primary">
                    Cerrar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPayModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Finalizar Venta & Pago
            </h3>

            <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: '12px', textAlign: 'center', marginBottom: '18px', border: '1px solid var(--border-color)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total a Facturar</p>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8' }}>
                RD$ {total.toFixed(2)}
              </p>
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: '18px' }}>
              <label className="label-control">Método de Pago</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {[
                  { id: 'cash', label: 'Efectivo', icon: Banknote },
                  { id: 'card', label: 'Tarjeta', icon: CreditCard },
                  { id: 'transfer', label: 'Transf.', icon: ArrowRight },
                  { id: 'credit', label: 'Crédito', icon: Receipt }
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`btn btn-sm ${paymentMethod === m.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flexDirection: 'column', height: '60px', gap: '4px' }}
                  >
                    <m.icon size={18} />
                    <span style={{ fontSize: '0.72rem' }}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Tendered & Change */}
            {paymentMethod === 'cash' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                <div>
                  <label className="label-control">Efectivo Recibido</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-control"
                    value={tenderedAmount}
                    onChange={(e) => setTenderedAmount(e.target.value)}
                    style={{ fontSize: '1.2rem', fontWeight: 700, height: '44px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>Cambio a devolver:</span>
                  <span style={{ fontSize: '1.1rem', color: 'var(--success)', fontWeight: 800 }}>
                    RD$ {Math.max(0, Number(tenderedAmount || total) - total).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {paymentMethod === 'credit' && (
              <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)', marginBottom: '18px', fontSize: '0.82rem', color: '#f59e0b' }}>
                <p>⚠️ Venta a Crédito. Se registrará en la Cartera CxC de <strong>{selectedCustomer?.company_name || selectedCustomer?.first_name}</strong> con 30 días de plazo.</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.78rem' }}>
                  <span>Crédito Disponible:</span>
                  <strong style={{ color: custAvailable >= total ? 'var(--success)' : 'var(--danger)' }}>
                    RD$ {custAvailable.toFixed(2)}
                  </strong>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleProcessCheckout}
                disabled={loadingCheckout}
                className="btn btn-primary"
                style={{ flex: 2, height: '44px' }}
              >
                {loadingCheckout ? 'Procesando...' : 'Confirmar & Facturar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPERVISOR DISCOUNT / CREDIT AUTH MODAL */}
      {showSupervisorModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px', padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <ShieldAlert size={36} color="var(--warning)" style={{ margin: '0 auto 8px' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Autorización de Supervisor</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {supervisorReason || 'Operación requiere aprobación gerencial.'}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="label-control">Usuario Supervisor / Gerente</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="admin o supervisor"
                  value={supervisorCreds.username}
                  onChange={(e) => setSupervisorCreds({ ...supervisorCreds, username: e.target.value })}
                />
              </div>
              <div>
                <label className="label-control">Contraseña</label>
                <input
                  type="password"
                  className="input-control"
                  placeholder="••••••••"
                  value={supervisorCreds.password}
                  onChange={(e) => setSupervisorCreds({ ...supervisorCreds, password: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => { setShowSupervisorModal(false); setSupervisorCreds({ username: '', password: '' }); }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!supervisorCreds.username || !supervisorCreds.password) {
                    alert('Debe ingresar credenciales del supervisor.');
                    return;
                  }
                  setShowSupervisorModal(false);
                  setShowPayModal(true);
                }}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                Autorizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED SALE / THERMAL RECEIPT MODAL */}
      {completedSale && (
        <ThermalReceipt
          saleData={completedSale}
          onClose={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
}
