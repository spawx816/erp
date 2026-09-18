import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Barcode, ShoppingCart, Trash2, Plus, Minus,
  CreditCard, Banknote, ArrowRight, UserPlus, Check,
  AlertTriangle, ShieldAlert, Sparkles, Receipt,
  UserCheck, FileText, HandCoins, AlertCircle, X,
  Phone, MapPin, DollarSign, Clock, ShieldCheck,
  Send, PackageCheck, ClipboardList
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
  const [statementTab, setStatementTab] = useState('invoices'); // 'invoices' or 'ledger'
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

  // Customer Autocomplete Search State
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef(null);

  // Seller flow and Orders state
  const isSeller = user?.role_slug === 'vendedor';
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [orderPaymentType, setOrderPaymentType] = useState('cash'); // 'cash' | 'credit'
  const [orderCreditDays, setOrderCreditDays] = useState(30);
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const [importableOrders, setImportableOrders] = useState([]);
  const [loadingImportOrders, setLoadingImportOrders] = useState(false);

  const barcodeRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    } else {
      setCustomerDetails(null);
    }

    const handlePaymentRecorded = () => {
      if (selectedCustomer?.id) {
        loadCustomerDetails(selectedCustomer.id);
      }
    };
    window.addEventListener('sgc:payment-recorded', handlePaymentRecorded);
    return () => window.removeEventListener('sgc:payment-recorded', handlePaymentRecorded);
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
        // Start in blank as requested to prevent accidental misallocation
        setSelectedCustomer(null);
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

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase().trim();
    const name = (c.company_name || `${c.first_name} ${c.last_name}`).toLowerCase();
    const taxId = (c.tax_id || c.id_card || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    const code = (c.code || '').toLowerCase();
    return name.includes(q) || taxId.includes(q) || phone.includes(q) || code.includes(q);
  });

  const handleSelectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setIsCustomerDropdownOpen(false);
    setCustomerSearch('');
    if (cust.tax_id) {
      setFiscalType('B01');
    }
    if (Number(cust.payment_terms_days) > 0) {
      setOrderCreditDays(Number(cust.payment_terms_days));
    }
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerDetails(null);
    setCustomerSearch('');
    setIsCustomerDropdownOpen(false);
  };
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
              tax_rate: (res.data.tax_rate !== undefined && res.data.tax_rate !== null) ? Number(res.data.tax_rate) : 18,
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
        tax_rate: (product.tax_rate !== undefined && product.tax_rate !== null) ? Number(product.tax_rate) : 18,
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

  // Dynamic Calculations adhering strictly to line-item tax rates (e.g. 0% exempt, 18% standard)
  let subtotal = 0;
  let totalDiscount = 0;
  let itbisTax = 0;
  let total = 0;
  let taxableSubtotal = 0;
  let exemptSubtotal = 0;

  cart.forEach(it => {
    const itemQty = Number(it.quantity || 1);
    const unitPrice = Number(it.price || 0);
    const itemBase = Math.round(itemQty * unitPrice * 100) / 100;
    const itemDiscPercent = discountPercent > 0 ? discountPercent : Number(it.discount_percent || 0);
    const itemDiscAmount = Math.round(itemBase * (itemDiscPercent / 100) * 100) / 100;
    const itemNet = Math.round((itemBase - itemDiscAmount) * 100) / 100;

    const itemTaxRate = (it.tax_rate !== undefined && it.tax_rate !== null) ? Number(it.tax_rate) : 18;
    const itemTaxAmount = Math.round(itemNet * (itemTaxRate / 100) * 100) / 100;
    const itemTotal = Math.round((itemNet + itemTaxAmount) * 100) / 100;

    subtotal = Math.round((subtotal + itemBase) * 100) / 100;
    totalDiscount = Math.round((totalDiscount + itemDiscAmount) * 100) / 100;
    itbisTax = Math.round((itbisTax + itemTaxAmount) * 100) / 100;
    total = Math.round((total + itemTotal) * 100) / 100;

    if (itemTaxRate > 0) {
      taxableSubtotal = Math.round((taxableSubtotal + itemNet) * 100) / 100;
    } else {
      exemptSubtotal = Math.round((exemptSubtotal + itemNet) * 100) / 100;
    }
  });

  const generalDiscountAmount = totalDiscount;
  const netSubtotal = Math.round((subtotal - totalDiscount) * 100) / 100;

  // Credit check
  const custCreditLimit = Number(customerDetails?.customer?.credit_limit || selectedCustomer?.credit_limit || 0);
  const custBalance = Number(customerDetails?.customer?.current_balance || selectedCustomer?.current_balance || 0);
  const custAvailable = Math.max(0, custCreditLimit - custBalance);
  const overdueCount = customerDetails?.kpis?.overdue_invoices_count || 0;
  const overdueBalance = customerDetails?.kpis?.overdue_balance || 0;

  // Visual Semaphore:
  // Verde: Al día
  // Amarillo: Facturas por vencer, crédito al 80% o autorización especial
  // Rojo: Bloqueado, facturas vencidas o crédito excedido
  const isCreditBlocked = (customerDetails?.customer?.is_credit_blocked === 1 || selectedCustomer?.is_credit_blocked === 1);
  const requiresSpecialAuth = (customerDetails?.customer?.requires_special_auth === 1 || selectedCustomer?.requires_special_auth === 1);

  let semaphoreColor = '#10b981';
  let semaphoreText = 'Al Día (Crédito Disponible)';
  let semaphoreClass = 'badge-success';

  if (isCreditBlocked) {
    semaphoreColor = '#ef4444';
    semaphoreText = 'Crédito Bloqueado por Administración';
    semaphoreClass = 'badge-danger';
  } else if (overdueCount > 0 || custBalance > custCreditLimit) {
    semaphoreColor = '#ef4444';
    semaphoreText = overdueCount > 0 ? `${overdueCount} Facturas Vencidas` : 'Límite de Crédito Excedido';
    semaphoreClass = 'badge-danger';
  } else if (requiresSpecialAuth) {
    semaphoreColor = '#f59e0b';
    semaphoreText = 'Requiere Autorización Especial';
    semaphoreClass = 'badge-warning';
  } else if (custCreditLimit > 0 && (custBalance / custCreditLimit) >= 0.8) {
    semaphoreColor = '#f59e0b';
    semaphoreText = 'Crédito al 80%+ de Utilización';
    semaphoreClass = 'badge-warning';
  }

  // VENDEDOR: Crear Pedido Comercial sin cobro ni caja
  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      addToast('Agregue al menos un producto al carrito para generar el pedido.', 'warning');
      return;
    }
    if (!selectedCustomer) {
      addToast('Debe seleccionar un cliente para registrar el pedido comercial.', 'warning');
      return;
    }

    setLoadingOrder(true);
    try {
      const payload = {
        customer_id: selectedCustomer.id,
        warehouse_id: selectedWarehouseId || (warehouses[0]?.id),
        fiscal_type_code: fiscalType,
        payment_type: orderPaymentType,
        credit_days: orderPaymentType === 'credit' ? orderCreditDays : 0,
        discount_percent: discountPercent,
        notes: `Pedido comercial (${orderPaymentType === 'credit' ? `A Crédito ${orderCreditDays}d` : 'Al Contado'}) generado por vendedor ${user.first_name || user.username}`,
        items: cart.map(it => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          quantity: it.quantity,
          unit_price: it.price,
          discount_percent: discountPercent
        }))
      };

      const res = await api.post('/sales/orders', payload);
      if (res.success) {
        addToast(`Pedido ${res.data.orderNumber} generado exitosamente. Enviado a Gerencia para autorización.`, 'success');
        setCart([]);
        setDiscountPercent(0);
        window.dispatchEvent(new CustomEvent('sgc:order-created', { detail: res.data }));
      }
    } catch (err) {
      addToast(err.message || 'Error al generar el pedido comercial.', 'error');
    } finally {
      setLoadingOrder(false);
    }
  };

  // CAJERO: Cargar Pedido Autorizado / Despachado al carrito
  const loadImportableOrders = async () => {
    setLoadingImportOrders(true);
    try {
      const res = await api.get('/sales/orders', { status: 'approved' });
      const res2 = await api.get('/sales/orders', { status: 'dispatched' });
      const combined = [...(res.data || []), ...(res2.data || [])];
      setImportableOrders(combined);
      setShowImportOrderModal(true);
    } catch (err) {
      addToast('Error al consultar pedidos autorizados.', 'error');
    } finally {
      setLoadingImportOrders(false);
    }
  };

  const handleImportOrder = async (orderId) => {
    try {
      const res = await api.get(`/sales/orders/${orderId}`);
      if (res.success && res.data) {
        const ord = res.data;
        // Select customer
        const cust = customers.find(c => c.id === ord.customer_id) || {
          id: ord.customer_id,
          company_name: ord.customer_name,
          tax_id: ord.customer_tax_id,
          phone: ord.customer_phone
        };
        setSelectedCustomer(cust);
        setSelectedWarehouseId(ord.warehouse_id);
        setFiscalType(ord.fiscal_type_code || 'B02');

        // Populate cart
        const newCart = (ord.items || []).map(it => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          name: it.product_name,
          sku: it.sku || '',
          price: Number(it.unit_price),
          tax_rate: Number(it.tax_rate !== undefined ? it.tax_rate : 18),
          quantity: Number(it.quantity)
        }));

        setCart(newCart);
        setShowImportOrderModal(false);
        addToast(`Pedido ${ord.order_number} cargado en el POS para facturación.`, 'success');
      }
    } catch (err) {
      addToast('Error al importar ítems del pedido.', 'error');
    }
  };

  const handleOpenPayment = () => {
    if (cart.length === 0) return;

    const requiresCash = user?.cash_requires_open_session !== undefined && user?.cash_requires_open_session !== null
      ? (Number(user.cash_requires_open_session) === 1 || user.cash_requires_open_session === true)
      : true;

    if (requiresCash && !activeSession) {
      addToast('No hay un turno de caja abierto en esta sucursal. Debe aperturar caja antes de facturar.', 'warning');
      if (onOpenCashModal) {
        onOpenCashModal();
      }
      return;
    }

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
    // If credit sale, verify credit status via unified credit-check endpoint
    if (paymentMethod === 'credit') {
      if (!selectedCustomer) {
        addToast('Debe seleccionar un cliente con línea de crédito autorizada para ventas a crédito.', 'error');
        return;
      }

      try {
        const checkRes = await api.get(`/third-parties/customers/${selectedCustomer.id}/credit-check?amount=${total}`);
        if (checkRes.success && checkRes.data) {
          const assessment = checkRes.data;
          if (assessment.blocked) {
            addToast(assessment.reason || 'Cliente no habilitado para operaciones a crédito.', 'error');
            return;
          }
          if (assessment.needs_supervisor_auth && !supervisorCreds.username) {
            setSupervisorReason(assessment.reason || 'Se requiere autorización de supervisor para este crédito.');
            setShowSupervisorModal(true);
            return;
          }
        }
      } catch (err) {
        console.warn('Error en verificación previa de crédito:', err);
      }
    }

    // If fiscal invoice B01, B14, B15, require registered customer with tax ID
    if (['B01', 'B14', 'B15'].includes(fiscalType) && (!selectedCustomer || !selectedCustomer.tax_id)) {
      addToast(`Para comprobantes fiscales ${fiscalType} es obligatorio seleccionar un cliente con RNC o Cédula registrado.`, 'warning');
      return;
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

      let targetCustomerId = selectedCustomer?.id;
      if (!targetCustomerId) {
        const defaultCust = customers.find(c => c.id_card === '000-0000000-0') || customers[0];
        targetCustomerId = defaultCust?.id || 1;
      }

      const payload = {
        customer_id: targetCustomerId,
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
        const serverItems = (res.data?.items && res.data.items.length > 0)
          ? res.data.items
          : cart.map(it => {
              const itemBase = it.price * it.quantity;
              const itemDisc = itemBase * (discountPercent / 100);
              const itemNet = itemBase - itemDisc;
              const itemTax = itemNet * (Number(it.tax_rate !== undefined ? it.tax_rate : 18) / 100);
              return {
                product_name: it.name,
                quantity: it.quantity,
                unit_price: it.price,
                subtotal: itemNet,
                total: itemNet + itemTax
              };
            });

        setCompletedSale({
          ...res.data,
          customer_name: selectedCustomer ? (selectedCustomer.company_name || `${selectedCustomer.first_name} ${selectedCustomer.last_name}`) : 'Consumidor Final',
          customer_tax_id: selectedCustomer?.tax_id || selectedCustomer?.id_card,
          seller_name: customerDetails?.customer?.salesperson_name || `${user.first_name} ${user.last_name}`,
          items: serverItems,
          payments: payments.map(p => ({
            ...p,
            amount: Number(p.amount)
          }))
        });

        // Reset cart
        setCart([]);
        setDiscountPercent(0);
        setShowPayModal(false);
        setSupervisorCreds({ username: '', password: '' });
        if (selectedCustomer) loadCustomerDetails(selectedCustomer.id);
        window.dispatchEvent(new CustomEvent('sgc:sale-completed', { detail: res.data }));
      }
    } catch (err) {
      if (err.requires_cash_open || (err.message && err.message.toLowerCase().includes('caja'))) {
        addToast(err.message || 'Se requiere una caja abierta para procesar ventas.', 'error');
        if (onOpenCashModal) onOpenCashModal();
      } else {
        addToast(err.message || 'Error procesando la venta.', 'error');
      }
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
        {/* Banner: Modo Preventa para Vendedor o Estado de Caja para Cajero */}
        {isSeller ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(30, 58, 138, 0.2))',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontSize: '0.82rem', fontWeight: 700 }}>
              <Send size={18} />
              <span>Modo Preventa Comercial: Los pedidos creados serán enviados a Gerencia para autorización y Almacén para despacho.</span>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('orders')}
                className="btn btn-sm btn-secondary"
                style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '5px 12px', fontWeight: 700 }}
              >
                Ver Mis Pedidos
              </button>
            )}
          </div>
        ) : (
          <div style={{
            background: activeSession ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: activeSession ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: activeSession ? '#10b981' : '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>
              {activeSession ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>
                {activeSession
                  ? `Caja Abierta: Turno #${activeSession.id} (${activeSession.register_name || 'Caja Principal'})`
                  : 'Caja Cerrada: Requiere apertura para facturar en mostrador.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={loadImportableOrders}
                className="btn btn-sm btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px', fontWeight: 700, borderColor: '#38bdf8', color: '#38bdf8' }}
              >
                <ClipboardList size={14} style={{ marginRight: '4px' }} />
                Cargar Pedido Autorizado
              </button>
              {!activeSession && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('cash-register')}
                  className="btn btn-sm btn-primary"
                  style={{ background: '#ef4444', borderColor: '#ef4444', fontSize: '0.75rem', padding: '4px 10px', fontWeight: 700 }}
                >
                  Abrir Caja
                </button>
              )}
            </div>
          </div>
        )}

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
          <div ref={customerDropdownRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Cliente Asignado</label>
              <button
                type="button"
                onClick={() => setShowCustomerSidePanel(!showCustomerSidePanel)}
                style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <UserCheck size={12} />
                <span>{showCustomerSidePanel ? 'Ocultar Ficha' : 'Ver Ficha'}</span>
              </button>
            </div>

            {selectedCustomer ? (
              /* SELECTED CUSTOMER CHIP CARD */
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: 'var(--accent-primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {(selectedCustomer.company_name || selectedCustomer.first_name || 'C')[0].toUpperCase()}
                  </div>
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedCustomer.company_name || `${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
                    </p>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      RNC/Céd: {selectedCustomer.tax_id || selectedCustomer.id_card || 'Consumidor Final'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="btn btn-secondary btn-sm"
                  title="Quitar cliente y dejar en blanco"
                  style={{ padding: '3px 7px', height: '24px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--danger)' }}
                >
                  <X size={12} />
                  <span>Quitar</span>
                </button>
              </div>
            ) : (
              /* SEARCH INPUT WITH DROPDOWN */
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px' }} />
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Buscar cliente (Nombre, RNC, Cédula)..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    style={{ paddingLeft: '32px', paddingRight: customerSearch ? '28px' : '10px', height: '34px', fontSize: '0.78rem' }}
                  />
                  {customerSearch && (
                    <button
                      type="button"
                      onClick={() => setCustomerSearch('')}
                      style={{ position: 'absolute', right: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {isCustomerDropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
                    maxHeight: '230px',
                    overflowY: 'auto',
                    zIndex: 60,
                    padding: '4px'
                  }}>
                    {/* Quick Select Consumidor Final */}
                    <button
                      type="button"
                      onClick={() => {
                        const cf = customers.find(c => c.id_card === '000-0000000-0') || { id: null, company_name: 'Consumidor Final Mostrador', first_name: 'Consumidor', last_name: 'Final', tax_id: null, id_card: '000-0000000-0' };
                        handleSelectCustomer(cf);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#60a5fa',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        marginBottom: '4px',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={13} />
                        <span>⚡ Consumidor Final (Venta Rápida)</span>
                      </div>
                      <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>Sin RNC</span>
                    </button>

                    {filteredCustomers.length === 0 ? (
                      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        No se encontraron clientes coincidentes.
                      </div>
                    ) : (
                      filteredCustomers.map(cust => (
                        <div
                          key={cust.id}
                          onClick={() => handleSelectCustomer(cust)}
                          style={{
                            padding: '7px 9px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            borderBottom: '1px solid var(--border-color)',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {cust.company_name || `${cust.first_name} ${cust.last_name}`}
                            </span>
                            {cust.credit_limit > 0 && (
                              <span className="badge badge-info" style={{ fontSize: '0.62rem' }}>
                                Crédito RD$ {Number(cust.credit_limit).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{cust.tax_id || cust.id_card || 'Sin RNC'}</span>
                            <span>{cust.salesperson_name ? `Vend: ${cust.salesperson_name}` : (cust.city || '')}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

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

          {exemptSubtotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>Base Exenta (0% ITBIS):</span>
              <span>RD$ {exemptSubtotal.toFixed(2)}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span>ITBIS ({exemptSubtotal > 0 ? 'Mixto' : '18%'}):</span>
            <span>RD$ {itbisTax.toFixed(2)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
            <span>TOTAL:</span>
            <span style={{ color: '#38bdf8' }}>RD$ {total.toFixed(2)}</span>
          </div>

          {isSeller ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {/* Selector de Condición: Contado vs Crédito */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Condición del Pedido:
                  </span>
                  {orderPaymentType === 'credit' && selectedCustomer && (
                    <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700 }}>
                      Disp: RD$ {Math.max(0, Number(selectedCustomer.credit_limit || 0) - Number(selectedCustomer.current_balance || 0)).toLocaleString()}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setOrderPaymentType('cash')}
                    className={`btn btn-sm ${orderPaymentType === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.75rem', height: '32px', padding: '0 8px', gap: '4px' }}
                  >
                    <Banknote size={14} />
                    <span>💵 Contado</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderPaymentType('credit')}
                    className={`btn btn-sm ${orderPaymentType === 'credit' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.75rem', height: '32px', padding: '0 8px', gap: '4px' }}
                  >
                    <CreditCard size={14} />
                    <span>💳 A Crédito</span>
                  </button>
                </div>

                {orderPaymentType === 'credit' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--border-color)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Plazo de pago:</span>
                    <select
                      value={orderCreditDays}
                      onChange={(e) => setOrderCreditDays(Number(e.target.value))}
                      className="input-control"
                      style={{ height: '28px', fontSize: '0.75rem', width: '120px', padding: '0 6px' }}
                    >
                      <option value={15}>15 días</option>
                      <option value={30}>30 días</option>
                      <option value={45}>45 días</option>
                      <option value={60}>60 días</option>
                      <option value={90}>90 días</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Selector de Comprobante Fiscal */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.03)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>NCF SOLICITADO:</span>
                <select
                  value={fiscalType}
                  onChange={(e) => setFiscalType(e.target.value)}
                  className="input-control"
                  style={{ height: '28px', fontSize: '0.75rem', width: '170px', padding: '0 6px' }}
                >
                  <option value="B02">B02 - Consumidor Final</option>
                  <option value="B01">B01 - Crédito Fiscal</option>
                  <option value="B14">B14 - Régimen Especial</option>
                  <option value="B15">B15 - Gubernamental</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={cart.length === 0 || loadingOrder}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  height: '46px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  marginTop: '2px',
                  background: orderPaymentType === 'credit'
                    ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                    : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Send size={18} />
                <span>
                  {loadingOrder
                    ? 'Enviando Pedido...'
                    : `Generar Pedido ${orderPaymentType === 'credit' ? '(A Crédito)' : '(Contado)'} - RD$ ${total.toFixed(2)}`}
                </span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleOpenPayment}
              disabled={cart.length === 0}
              className="btn btn-primary"
              style={{ width: '100%', height: '42px', fontSize: '0.95rem', marginTop: '2px' }}
            >
              <Banknote size={18} />
              <span>Cobrar (RD$ {total.toFixed(2)})</span>
            </button>
          )}
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

                {/* Tab Switcher */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setStatementTab('invoices')}
                    className={`btn btn-sm ${statementTab === 'invoices' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.76rem' }}
                  >
                    Facturas & Saldos ({statementData.invoices?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatementTab('ledger')}
                    className={`btn btn-sm ${statementTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.76rem' }}
                  >
                    Libro Mayor / Movimientos ({statementData.ledger?.length || 0})
                  </button>
                </div>

                {/* Invoices Table */}
                {statementTab === 'invoices' && (
                  <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Factura / NCF</th>
                          <th>Vencimiento</th>
                          <th style={{ textAlign: 'right' }}>Monto Total</th>
                          <th style={{ textAlign: 'right' }}>Balance Pendiente</th>
                          <th style={{ textAlign: 'center' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!statementData.invoices || statementData.invoices.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                              No hay facturas registradas para este cliente.
                            </td>
                          </tr>
                        ) : (
                          statementData.invoices.map(inv => (
                            <tr key={inv.id}>
                              <td>{inv.issue_date || '-'}</td>
                              <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number || inv.ncf || inv.sale_number}</td>
                              <td style={{ color: inv.is_overdue ? 'var(--danger)' : 'inherit', fontWeight: inv.is_overdue ? 700 : 400 }}>
                                {inv.due_date || 'Inmediato'}
                                {inv.is_overdue && <span style={{ fontSize: '0.68rem', marginLeft: '4px' }}>({inv.days_overdue}d)</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}>RD$ {Number(inv.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: Number(inv.balance) > 0 ? '#38bdf8' : 'var(--success)' }}>
                                RD$ {Number(inv.balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`badge ${inv.status === 'paid' ? 'badge-success' : inv.status === 'overdue' || inv.is_overdue ? 'badge-danger' : 'badge-warning'}`}>
                                  {inv.is_overdue ? 'Vencida' : inv.status === 'paid' ? 'Pagada' : 'Pendiente'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Ledger Table */}
                {statementTab === 'ledger' && (
                  <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Tipo</th>
                          <th>Documento</th>
                          <th>NCF</th>
                          <th style={{ textAlign: 'right' }}>Débito (+)</th>
                          <th style={{ textAlign: 'right' }}>Crédito (-)</th>
                          <th style={{ textAlign: 'right' }}>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!statementData.ledger || statementData.ledger.length === 0 ? (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                              No hay movimientos históricos en el libro mayor.
                            </td>
                          </tr>
                        ) : (
                          statementData.ledger.map((entry, idx) => (
                            <tr key={idx}>
                              <td>{entry.date ? new Date(entry.date).toISOString().split('T')[0] : '-'}</td>
                              <td>
                                <span className={`badge ${entry.doc_type === 'Factura' ? 'badge-info' : entry.doc_type === 'Nota de Crédito' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.68rem' }}>
                                  {entry.doc_type}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{entry.document || entry.invoice_number || '-'}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{entry.ncf || '-'}</td>
                              <td style={{ textAlign: 'right', color: entry.debit > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                {entry.debit > 0 ? `RD$ ${Number(entry.debit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td style={{ textAlign: 'right', color: entry.credit > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: entry.credit > 0 ? 700 : 400 }}>
                                {entry.credit > 0 ? `RD$ ${Number(entry.credit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: entry.balance > 0 ? '#38bdf8' : 'var(--success)' }}>
                                RD$ {Number(entry.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

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

      {/* MODAL IMPORTAR PEDIDO AUTORIZADO (PARA CAJEROS) */}
      {showImportOrderModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="card" style={{ maxWidth: '650px', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Pedidos Listos para Facturar</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportOrderModal(false)}
                className="btn btn-sm btn-secondary"
              >
                <X size={16} />
              </button>
            </div>

            {loadingImportOrders ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                Cargando pedidos...
              </div>
            ) : importableOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                No hay pedidos autorizados o despachados pendientes de facturación.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {importableOrders.map(ord => (
                  <div
                    key={ord.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: '#38bdf8' }}>{ord.order_number}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ord.customer_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Vendedor: {ord.seller_name} | Total: RD$ {Number(ord.total).toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleImportOrder(ord.id)}
                      className="btn btn-sm btn-primary"
                      style={{ fontWeight: 700 }}
                    >
                      Cargar en POS
                    </button>
                  </div>
                ))}
              </div>
            )}
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
