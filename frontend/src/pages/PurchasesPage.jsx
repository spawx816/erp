import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingBag, Plus, Search, X, RefreshCw,
  CheckCircle2, Warehouse, Truck, Package, FileText,
  Printer, Clock, AlertTriangle, Calendar, DollarSign,
  Check, ExternalLink, MessageCircle, Mail, Eye,
  ArrowRight, Copy, CheckCircle, Edit
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/Pagination';

export default function PurchasesPage({ activeBranch }) {
  const { addToast } = useToast();

  // Navigation tab: 'orders' (Órdenes de Compra) | 'purchases' (Compras & Recepción)
  const [activeTab, setActiveTab] = useState('orders');

  // Data states
  const [purchases, setPurchases] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // UI / Status states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'received' | 'cancelled'
  const [lastRefresh, setLastRefresh] = useState(null);

  // Pagination states
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [purchasesPageSize, setPurchasesPageSize] = useState(10);

  // New / Edit Purchase Order Modal
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderFormData, setOrderFormData] = useState({
    supplier_id: '',
    warehouse_id: '',
    expected_date: '',
    notes: '',
    items: [{ product_id: '', quantity: '5', unit_cost: '0', tax_rate: '18' }]
  });

  // Direct Purchase / Receive Modal
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [receivingOrderId, setReceivingOrderId] = useState(null);
  const [purchaseFormData, setPurchaseFormData] = useState({
    supplier_id: '',
    warehouse_id: '',
    supplier_invoice_number: '',
    payment_terms: 'cash',
    credit_days: '30',
    notes: '',
    items: [{ product_id: '', quantity: '1', unit_cost: '0', tax_rate: '18' }]
  });

  // View / Print Purchase Order Modal
  const [showViewOrderModal, setShowViewOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loadingOrderDetail, setLoadingOrderDetail] = useState(false);

  useEffect(() => {
    loadAllData();
    loadMeta();
  }, [activeBranch]);

  const loadMeta = async () => {
    try {
      const [sRes, pRes, wRes] = await Promise.all([
        api.get('/third-parties/suppliers'),
        api.get('/catalog/products', { limit: 200 }),
        api.get('/admin/branches-warehouses')
      ]);
      if (sRes.success) setSuppliers(sRes.data || []);
      if (pRes.success) setProducts(pRes.data || []);
      if (wRes.success) setWarehouses(wRes.warehouses || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAllData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [purchRes, poRes] = await Promise.all([
        api.get('/purchases'),
        api.get('/purchases/orders')
      ]);

      if (purchRes.success) {
        setPurchases(purchRes.data || []);
      }
      if (poRes.success) {
        setPurchaseOrders(poRes.data || []);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error(err);
      addToast('Error conectando al servidor: ' + (err.message || ''), 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  const handleRefresh = () => loadAllData(true);

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // PURCHASE ORDER CREATION & EDITING HANDLERS
  // -------------------------------------------------------------
  const handleOpenNewOrderModal = () => {
    setEditingOrderId(null);
    const defaultSup = suppliers[0]?.id ? String(suppliers[0].id) : '';
    const defaultWh = warehouses[0]?.id ? String(warehouses[0].id) : '';
    const defaultProd = products[0]?.id ? String(products[0].id) : '';
    const defaultCost = products[0]?.cost ? String(products[0].cost) : '0';

    const defaultExp = new Date();
    defaultExp.setDate(defaultExp.getDate() + 7);
    const defaultExpStr = defaultExp.toISOString().split('T')[0];

    setOrderFormData({
      supplier_id: defaultSup,
      warehouse_id: defaultWh,
      expected_date: defaultExpStr,
      notes: '',
      items: [{
        product_id: defaultProd,
        quantity: '10',
        unit_cost: defaultCost,
        tax_rate: '18'
      }]
    });
    setShowOrderModal(true);
  };

  const handleOpenEditOrder = async (orderId) => {
    setLoading(true);
    try {
      const res = await api.get(`/purchases/orders/${orderId}`);
      if (res.success && res.data) {
        const o = res.data;
        setEditingOrderId(o.id);
        setOrderFormData({
          supplier_id: String(o.supplier_id || ''),
          warehouse_id: String(o.warehouse_id || ''),
          expected_date: o.expected_date ? o.expected_date.split('T')[0] : '',
          notes: o.notes || '',
          items: o.items && o.items.length > 0 ? o.items.map(it => ({
            product_id: String(it.product_id),
            quantity: String(it.quantity),
            unit_cost: String(it.unit_cost || 0),
            tax_rate: String(it.tax_rate !== undefined ? it.tax_rate : 18)
          })) : [{ product_id: '', quantity: '1', unit_cost: '0', tax_rate: '18' }]
        });
        setShowOrderModal(true);
      } else {
        addToast(res.message || 'No se pudo cargar la orden para edición.', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error cargando orden para edición.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrderItem = () => {
    const defaultProd = products[0]?.id ? String(products[0].id) : '';
    const defaultCost = products[0]?.cost ? String(products[0].cost) : '0';
    setOrderFormData({
      ...orderFormData,
      items: [...orderFormData.items, { product_id: defaultProd, quantity: '1', unit_cost: defaultCost, tax_rate: '18' }]
    });
  };

  const handleRemoveOrderItem = (idx) => {
    if (orderFormData.items.length <= 1) {
      addToast('La orden de compra debe contener al menos un artículo.', 'warning');
      return;
    }
    setOrderFormData({
      ...orderFormData,
      items: orderFormData.items.filter((_, i) => i !== idx)
    });
  };

  const handleOrderItemChange = (idx, field, val) => {
    const it = [...orderFormData.items];
    it[idx][field] = val;
    if (field === 'product_id') {
      const prod = products.find(p => String(p.id) === String(val));
      if (prod) {
        it[idx].unit_cost = prod.cost || 0;
      }
    }
    setOrderFormData({ ...orderFormData, items: it });
  };

  const orderCalculatedSubtotal = orderFormData.items.reduce((acc, item) => {
    return acc + (parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0));
  }, 0);

  const orderCalculatedTax = orderFormData.items.reduce((acc, item) => {
    const sub = parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0);
    return acc + (sub * (parseFloat(item.tax_rate || 18) / 100));
  }, 0);

  const orderCalculatedTotal = orderCalculatedSubtotal + orderCalculatedTax;

  const handleSavePurchaseOrder = async (e) => {
    e.preventDefault();

    if (!orderFormData.supplier_id) {
      addToast('Seleccione un proveedor para la orden.', 'warning');
      return;
    }
    if (!orderFormData.warehouse_id) {
      addToast('Seleccione el almacén de destino.', 'warning');
      return;
    }
    const hasInvalid = orderFormData.items.some(it => !it.product_id || parseFloat(it.quantity || 0) <= 0);
    if (hasInvalid) {
      addToast('Verifique que todos los artículos y cantidades sean válidos.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier_id: parseInt(orderFormData.supplier_id, 10),
        warehouse_id: parseInt(orderFormData.warehouse_id, 10),
        expected_date: orderFormData.expected_date || null,
        notes: orderFormData.notes,
        items: orderFormData.items.map(it => ({
          product_id: parseInt(it.product_id, 10),
          quantity: parseFloat(it.quantity),
          unit_cost: parseFloat(it.unit_cost || 0),
          tax_rate: parseFloat(it.tax_rate || 18)
        }))
      };

      let res;
      if (editingOrderId) {
        res = await api.put(`/purchases/orders/${editingOrderId}`, payload);
      } else {
        res = await api.post('/purchases/orders', payload);
      }

      if (res.success) {
        addToast(
          editingOrderId
            ? 'Orden de compra actualizada exitosamente.'
            : `Orden de Compra ${res.order_number} creada exitosamente.`,
          'success'
        );
        setShowOrderModal(false);
        setEditingOrderId(null);
        await loadAllData(true);
      } else {
        addToast(res.message || 'Error al guardar orden de compra.', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error al procesar orden.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // ORDER ACTIONS: VIEW DETAIL, APPROVE, CANCEL, RECEIVE
  // -------------------------------------------------------------
  const handleOpenViewOrder = async (orderId) => {
    setLoadingOrderDetail(true);
    setShowViewOrderModal(true);
    try {
      const res = await api.get(`/purchases/orders/${orderId}`);
      if (res.success && res.data) {
        setSelectedOrder(res.data);
      } else {
        addToast('No se pudo obtener el detalle de la orden.', 'error');
        setShowViewOrderModal(false);
      }
    } catch (err) {
      addToast(err.message || 'Error cargando orden.', 'error');
      setShowViewOrderModal(false);
    } finally {
      setLoadingOrderDetail(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await api.put(`/purchases/orders/${orderId}/status`, { status: newStatus });
      if (res.success) {
        addToast(res.message || 'Estado actualizado.', 'success');
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(prev => ({ ...prev, status: newStatus }));
        }
        await loadAllData(true);
      } else {
        addToast(res.message || 'Error actualizando estado.', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error al actualizar estado.', 'error');
    }
  };

  const handleStartReceiveOrder = async (order) => {
    try {
      // Fetch full order with items if not loaded
      let fullOrder = order;
      if (!order.items || order.items.length === 0) {
        const res = await api.get(`/purchases/orders/${order.id}`);
        if (res.success && res.data) {
          fullOrder = res.data;
        }
      }

      setReceivingOrderId(fullOrder.id);
      setPurchaseFormData({
        supplier_id: String(fullOrder.supplier_id),
        warehouse_id: String(fullOrder.warehouse_id),
        supplier_invoice_number: `FPROV-${Date.now().toString().slice(-4)}`,
        payment_terms: 'credit',
        credit_days: '30',
        notes: `Ingreso generado por Orden de Compra ${fullOrder.order_number}`,
        items: (fullOrder.items || []).map(it => {
          const orderedQty = Number(it.quantity);
          const alreadyReceived = Number(it.received_quantity || 0);
          const remainingQty = Math.max(0, orderedQty - alreadyReceived);
          return {
            product_id: String(it.product_id),
            ordered_quantity: orderedQty,
            received_quantity: alreadyReceived,
            quantity: String(remainingQty > 0 ? remainingQty : orderedQty),
            unit_cost: String(it.unit_cost || 0),
            tax_rate: String(it.tax_rate || 18)
          };
        }).filter(it => Number(it.quantity) > 0)
      });

      setShowViewOrderModal(false);
      setShowPurchaseModal(true);
    } catch (err) {
      addToast(err.message || 'Error al preparar recepción de orden.', 'error');
    }
  };

  // -------------------------------------------------------------
  // DIRECT PURCHASE / RECEIVE SUBMISSION
  // -------------------------------------------------------------
  const handleOpenDirectPurchaseModal = () => {
    setReceivingOrderId(null);
    const defaultSup = suppliers[0]?.id ? String(suppliers[0].id) : '';
    const defaultWh = warehouses[0]?.id ? String(warehouses[0].id) : '';
    const defaultProd = products[0]?.id ? String(products[0].id) : '';
    const defaultCost = products[0]?.cost ? String(products[0].cost) : '0';

    setPurchaseFormData({
      supplier_id: defaultSup,
      warehouse_id: defaultWh,
      supplier_invoice_number: `FPROV-${Date.now().toString().slice(-4)}`,
      payment_terms: 'cash',
      credit_days: '30',
      notes: '',
      items: [{
        product_id: defaultProd,
        quantity: '5',
        unit_cost: defaultCost,
        tax_rate: '18'
      }]
    });
    setShowPurchaseModal(true);
  };

  const handleAddPurchaseItem = () => {
    const defaultProd = products[0]?.id ? String(products[0].id) : '';
    const defaultCost = products[0]?.cost ? String(products[0].cost) : '0';
    setPurchaseFormData({
      ...purchaseFormData,
      items: [...purchaseFormData.items, { product_id: defaultProd, quantity: '1', unit_cost: defaultCost, tax_rate: '18' }]
    });
  };

  const handleRemovePurchaseItem = (idx) => {
    if (purchaseFormData.items.length <= 1) {
      addToast('La compra debe contener al menos un artículo.', 'error');
      return;
    }
    setPurchaseFormData({
      ...purchaseFormData,
      items: purchaseFormData.items.filter((_, i) => i !== idx)
    });
  };

  const handlePurchaseItemChange = (idx, field, val) => {
    const it = [...purchaseFormData.items];
    it[idx][field] = val;
    if (field === 'product_id') {
      const prod = products.find(p => String(p.id) === String(val));
      if (prod) {
        it[idx].unit_cost = prod.cost || 0;
      }
    }
    setPurchaseFormData({ ...purchaseFormData, items: it });
  };

  const purchaseCalculatedSubtotal = purchaseFormData.items.reduce((acc, item) => {
    return acc + (parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0));
  }, 0);

  const purchaseCalculatedTax = purchaseFormData.items.reduce((acc, item) => {
    const sub = parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0);
    return acc + (sub * (parseFloat(item.tax_rate || 18) / 100));
  }, 0);

  const purchaseCalculatedTotal = purchaseCalculatedSubtotal + purchaseCalculatedTax;

  const handleSavePurchase = async (e) => {
    e.preventDefault();

    if (!purchaseFormData.supplier_id) {
      addToast('Por favor seleccione un proveedor.', 'error');
      return;
    }
    if (!purchaseFormData.warehouse_id) {
      addToast('Por favor seleccione el almacén de destino.', 'error');
      return;
    }
    const hasInvalidItem = purchaseFormData.items.some(it => !it.product_id || parseFloat(it.quantity || 0) <= 0);
    if (hasInvalidItem) {
      addToast('Verifique que todos los productos y cantidades sean válidos.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier_id: parseInt(purchaseFormData.supplier_id, 10),
        warehouse_id: parseInt(purchaseFormData.warehouse_id, 10),
        supplier_invoice_number: purchaseFormData.supplier_invoice_number,
        payment_terms: purchaseFormData.payment_terms,
        credit_days: parseInt(purchaseFormData.credit_days || 30, 10),
        notes: purchaseFormData.notes,
        items: purchaseFormData.items.map(it => ({
          product_id: parseInt(it.product_id, 10),
          quantity: parseFloat(it.quantity),
          unit_cost: parseFloat(it.unit_cost || 0),
          tax_rate: parseFloat(it.tax_rate || 18)
        }))
      };

      let res;
      if (receivingOrderId) {
        res = await api.post(`/purchases/orders/${receivingOrderId}/receive`, payload);
      } else {
        res = await api.post('/purchases', payload);
      }

      if (res.success) {
        addToast(
          receivingOrderId
            ? `Mercancía de la orden ingresada exitosamente (Compra ${res.purchase_number}). Stock actualizado.`
            : `Compra registrada exitosamente.${purchaseFormData.payment_terms === 'credit' ? ' Se generó CxP a proveedor.' : ''}`,
          'success'
        );
        setShowPurchaseModal(false);
        setReceivingOrderId(null);
        await loadAllData(true);
      } else {
        addToast(res.message || 'Error registrando compra.', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error registrando compra.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // FILTERING & PAGINATION LOGIC
  // -------------------------------------------------------------
  useEffect(() => {
    setOrdersPage(1);
  }, [searchTerm, orderStatusFilter]);

  useEffect(() => {
    setPurchasesPage(1);
  }, [searchTerm]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.purchase_number?.toLowerCase().includes(term) ||
        p.supplier_name?.toLowerCase().includes(term) ||
        p.supplier_invoice_number?.toLowerCase().includes(term)
      );
    });
  }, [purchases, searchTerm]);

  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter(po => {
      if (orderStatusFilter !== 'all' && po.status !== orderStatusFilter) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        po.order_number?.toLowerCase().includes(term) ||
        po.supplier_name?.toLowerCase().includes(term) ||
        po.warehouse_name?.toLowerCase().includes(term)
      );
    });
  }, [purchaseOrders, orderStatusFilter, searchTerm]);

  const paginatedOrders = useMemo(() => {
    const start = (ordersPage - 1) * ordersPageSize;
    return filteredOrders.slice(start, start + ordersPageSize);
  }, [filteredOrders, ordersPage, ordersPageSize]);

  const paginatedPurchases = useMemo(() => {
    const start = (purchasesPage - 1) * purchasesPageSize;
    return filteredPurchases.slice(start, start + purchasesPageSize);
  }, [filteredPurchases, purchasesPage, purchasesPageSize]);

  const pendingOrdersCount = purchaseOrders.filter(po => po.status === 'pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Print Styles for Purchase Order */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-po, #printable-po * {
            visibility: visible !important;
          }
          #printable-po {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 12mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBag size={24} style={{ color: '#38bdf8' }} />
            Compras & Recepción de Mercancía
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Gestión completa de Órdenes de Compra a proveedores y registro de facturas ingresadas a almacén &nbsp;·&nbsp;
            {lastRefresh ? `Actualizado ${lastRefresh.toLocaleTimeString('es-DO')}` : 'Cargando...'}
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn btn-secondary btn-sm"
            title="Actualizar datos"
            style={{ height: '36px' }}
          >
            <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>

          <button
            onClick={handleOpenNewOrderModal}
            className="btn btn-primary btn-sm"
            style={{ height: '36px', gap: '6px', fontWeight: 700 }}
          >
            <Plus size={16} />
            <span>Nueva Orden de Compra</span>
          </button>

          <button
            onClick={handleOpenDirectPurchaseModal}
            className="btn btn-secondary btn-sm"
            style={{ height: '36px', gap: '6px', fontWeight: 600 }}
          >
            <Truck size={16} />
            <span>Registrar Compra Directa</span>
          </button>
        </div>
      </div>

      {/* Tab Selector Navigation Bar */}
      <div className="card" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`btn btn-sm ${activeTab === 'orders' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ gap: '8px', fontSize: '0.85rem', fontWeight: 700, height: '34px', padding: '0 16px' }}
          >
            <FileText size={16} />
            <span>Órdenes de Compra</span>
            <span style={{
              background: activeTab === 'orders' ? 'rgba(255,255,255,0.25)' : 'var(--bg-subtle)',
              color: activeTab === 'orders' ? '#fff' : 'var(--text-secondary)',
              fontSize: '0.72rem',
              padding: '2px 7px',
              borderRadius: '10px',
              fontWeight: 800
            }}>
              {purchaseOrders.length}
            </span>
            {pendingOrdersCount > 0 && (
              <span style={{ background: '#f59e0b', color: '#000', fontSize: '0.68rem', padding: '1px 6px', borderRadius: '8px', fontWeight: 800 }}>
                {pendingOrdersCount} pend.
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('purchases')}
            className={`btn btn-sm ${activeTab === 'purchases' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ gap: '8px', fontSize: '0.85rem', fontWeight: 700, height: '34px', padding: '0 16px' }}
          >
            <Truck size={16} />
            <span>Compras & Recepción en Almacén</span>
            <span style={{
              background: activeTab === 'purchases' ? 'rgba(255,255,255,0.25)' : 'var(--bg-subtle)',
              color: activeTab === 'purchases' ? '#fff' : 'var(--text-secondary)',
              fontSize: '0.72rem',
              padding: '2px 7px',
              borderRadius: '10px',
              fontWeight: 800
            }}>
              {purchases.length}
            </span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px', justifyContent: 'flex-end' }}>
          {activeTab === 'orders' && (
            <select
              className="select-control"
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value)}
              style={{ height: '34px', fontSize: '0.8rem', minWidth: '150px' }}
            >
              <option value="all">Todos los Estados</option>
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobadas</option>
              <option value="received">Recibidas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          )}

          <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={activeTab === 'orders' ? 'Buscar No. Orden, proveedor...' : 'Buscar compra, factura prov...'}
              className="input-control"
              style={{ paddingLeft: '32px', height: '34px', fontSize: '0.8rem', width: '100%' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: PURCHASE ORDERS (ÓRDENES DE COMPRA)                    */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'orders' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>No. Orden</th>
                <th>Fecha Emisión</th>
                <th>Proveedor</th>
                <th>Almacén Destino</th>
                <th>Entrega Estimada</th>
                <th>Ítems</th>
                <th style={{ textAlign: 'right' }}>Total (RD$)</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>Cargando órdenes de compra...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <FileText size={32} color="var(--text-muted)" />
                      <span>No se encontraron órdenes de compra registradas.</span>
                      <button onClick={handleOpenNewOrderModal} className="btn btn-primary btn-sm" style={{ marginTop: '8px' }}>
                        <Plus size={14} />
                        <span>Crear Primera Orden de Compra</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map(po => {
                  const isPending = po.status === 'pending';
                  const isApproved = po.status === 'approved';
                  const isPartiallyReceived = po.status === 'partially_received';
                  const isReceived = po.status === 'received';
                  const isCancelled = po.status === 'cancelled';

                  return (
                    <tr key={po.id}>
                      <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                        {po.order_number}
                      </td>
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {po.created_at ? new Date(po.created_at).toLocaleDateString('es-DO') : '-'}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{po.supplier_name}</div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>RNC: {po.supplier_tax_id || 'N/D'}</span>
                      </td>
                      <td>
                        <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Warehouse size={12} />
                          {po.warehouse_name}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {po.expected_date ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-primary)' }}>
                            <Calendar size={13} color="var(--primary)" />
                            {new Date(po.expected_date).toLocaleDateString('es-DO')}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Inmediata</span>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                          {po.items_count || 1} prod.
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>
                        RD$ {Number(po.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td>
                        {isPending && (
                          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} />
                            Pendiente
                          </span>
                        )}
                        {isApproved && (
                          <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={12} />
                            Aprobada
                          </span>
                        )}
                        {isPartiallyReceived && (
                          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                            <Clock size={12} />
                            Parcial
                          </span>
                        )}
                        {isReceived && (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} />
                            Recibida
                          </span>
                        )}
                        {isCancelled && (
                          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <X size={12} />
                            Cancelada
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {/* Ver / Imprimir */}
                          <button
                            type="button"
                            onClick={() => handleOpenViewOrder(po.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0 8px', height: '28px', gap: '4px' }}
                            title="Ver documento oficial de la Orden"
                          >
                            <Eye size={13} />
                            <span>Ver / PDF</span>
                          </button>

                          {/* Editar */}
                          {(isPending || isApproved) && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditOrder(po.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0 8px', height: '28px', gap: '4px' }}
                              title="Editar Orden de Compra"
                            >
                              <Edit size={13} />
                              <span>Editar</span>
                            </button>
                          )}

                          {/* Aprobar */}
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(po.id, 'approved')}
                              className="btn btn-sm"
                              style={{ padding: '0 8px', height: '28px', background: '#0284c7', color: '#fff', border: 'none', gap: '4px' }}
                              title="Aprobar Orden para envío al proveedor"
                            >
                              <Check size={13} />
                              <span>Aprobar</span>
                            </button>
                          )}

                          {/* Recibir Mercancía */}
                          {(isPending || isApproved || isPartiallyReceived) && (
                            <button
                              type="button"
                              onClick={() => handleStartReceiveOrder(po)}
                              className="btn btn-success btn-sm"
                              style={{ padding: '0 8px', height: '28px', gap: '4px' }}
                              title={isPartiallyReceived ? "Ingresar siguiente entrega parcial al inventario" : "Ingresar mercancía de esta orden al inventario"}
                            >
                              <Truck size={13} />
                              <span>{isPartiallyReceived ? 'Recibir Resto' : 'Recibir'}</span>
                            </button>
                          )}

                          {/* Cancelar */}
                          {(isPending || isApproved) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`¿Seguro que desea cancelar la orden ${po.order_number}?`)) {
                                  handleUpdateOrderStatus(po.id, 'cancelled');
                                }
                              }}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '0 6px', height: '28px', color: '#ef4444' }}
                              title="Cancelar orden"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {filteredOrders.length > 0 && (
            <Pagination
              currentPage={ordersPage}
              totalItems={filteredOrders.length}
              pageSize={ordersPageSize}
              onPageChange={setOrdersPage}
              onPageSizeChange={setOrdersPageSize}
              itemLabel="órdenes"
              disabled={loading}
            />
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: PURCHASES & MERCHANDISE RECEPTION                     */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'purchases' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>No. Compra</th>
                <th>Fecha Ingreso</th>
                <th>Proveedor</th>
                <th>Factura Prov.</th>
                <th>Almacén</th>
                <th>Términos</th>
                <th style={{ textAlign: 'right' }}>Total (RD$)</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Cargando compras...</td></tr>
              ) : filteredPurchases.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No se encontraron registros de compra.</td></tr>
              ) : (
                paginatedPurchases.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{p.purchase_number}</td>
                    <td style={{ fontSize: '0.78rem' }}>{new Date(p.created_at).toLocaleDateString('es-DO')}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.supplier_name}</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>RNC: {p.supplier_tax_id}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{p.supplier_invoice_number || '-'}</td>
                    <td>
                      <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Warehouse size={12} />
                        {p.warehouse_name}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${p.payment_terms === 'credit' ? 'badge-warning' : 'badge-info'}`}>
                        {p.payment_terms === 'credit' ? 'Crédito (CxP)' : 'Contado'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>
                      RD$ {Number(p.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} />
                        Ingresado
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filteredPurchases.length > 0 && (
            <Pagination
              currentPage={purchasesPage}
              totalItems={filteredPurchases.length}
              pageSize={purchasesPageSize}
              onPageChange={setPurchasesPage}
              onPageSizeChange={setPurchasesPageSize}
              itemLabel="compras"
              disabled={loading}
            />
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: NEW PURCHASE ORDER (NUEVA ORDEN DE COMPRA)           */}
      {/* ------------------------------------------------------------- */}
      {showOrderModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content modal-content-lg" style={{ padding: '24px', maxWidth: '880px', width: '94%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '8px', borderRadius: '10px' }}>
                  <FileText size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {editingOrderId ? 'Modificar Orden de Compra' : 'Generar Orden de Compra'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {editingOrderId ? 'Actualizar detalles, cantidades y costos de la orden' : 'Solicitud formal de pedido a proveedor antes del ingreso a inventario'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowOrderModal(false)} className="btn btn-ghost btn-sm" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePurchaseOrder} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label className="label-control">Proveedor *</label>
                  <select
                    required
                    className="select-control"
                    value={orderFormData.supplier_id}
                    onChange={(e) => setOrderFormData({ ...orderFormData, supplier_id: e.target.value })}
                  >
                    <option value="">Seleccione proveedor...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.company_name} ({s.tax_id || 'Sin RNC'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label-control">Almacén Destino *</label>
                  <select
                    required
                    className="select-control"
                    value={orderFormData.warehouse_id}
                    onChange={(e) => setOrderFormData({ ...orderFormData, warehouse_id: e.target.value })}
                  >
                    <option value="">Seleccione almacén...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="label-control">Fecha Estimada de Entrega</label>
                  <input
                    type="date"
                    className="input-control"
                    value={orderFormData.expected_date}
                    onChange={(e) => setOrderFormData({ ...orderFormData, expected_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label-control">Instrucciones o Condiciones Comerciales</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ej: Entregar en horario matutino con empaque sellado y comprobante fiscal B01"
                  value={orderFormData.notes}
                  onChange={(e) => setOrderFormData({ ...orderFormData, notes: e.target.value })}
                />
              </div>

              {/* Items Section */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Productos Solicitados en la Orden
                  </h4>
                  <button type="button" onClick={handleAddOrderItem} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={14} />
                    <span>Agregar Artículo</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                  {orderFormData.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '3fr 1fr 1.2fr 1fr 40px',
                        gap: '8px',
                        alignItems: 'center',
                        background: 'rgba(255, 255, 255, 0.02)',
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <select
                        className="select-control"
                        required
                        value={item.product_id}
                        onChange={(e) => handleOrderItemChange(idx, 'product_id', e.target.value)}
                      >
                        <option value="">Seleccione producto...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>

                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="Cantidad"
                        className="input-control"
                        value={item.quantity}
                        onChange={(e) => handleOrderItemChange(idx, 'quantity', e.target.value)}
                        title="Cantidad"
                      />

                      <input
                        type="number"
                        step="0.01"
                        placeholder="Costo Pactado"
                        className="input-control"
                        value={item.unit_cost}
                        onChange={(e) => handleOrderItemChange(idx, 'unit_cost', e.target.value)}
                        title="Costo Unitario"
                      />

                      <select
                        className="select-control"
                        value={item.tax_rate}
                        onChange={(e) => handleOrderItemChange(idx, 'tax_rate', e.target.value)}
                      >
                        <option value="18">ITBIS 18%</option>
                        <option value="0">Exento (0%)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveOrderItem(idx)}
                        className="btn btn-danger btn-sm"
                        style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Calculation Panel */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <span>Subtotal Estimado:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    RD$ {orderCalculatedSubtotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <span>Impuestos (ITBIS):</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    RD$ {orderCalculatedTax.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '8px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Total Estimado de la Orden:</span>
                  <span style={{ fontWeight: 900, color: '#38bdf8', fontSize: '1.25rem' }}>
                    RD$ {orderCalculatedTotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowOrderModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary" style={{ minWidth: '220px', fontWeight: 700 }}>
                  {submitting
                    ? (editingOrderId ? 'Guardando Cambios...' : 'Emitiendo Orden...')
                    : (editingOrderId ? 'Guardar Cambios' : 'Emitir Orden de Compra')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: RECEIVE / DIRECT PURCHASE MODAL                      */}
      {/* ------------------------------------------------------------- */}
      {showPurchaseModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content modal-content-lg" style={{ padding: '24px', maxWidth: '880px', width: '94%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '8px', borderRadius: '10px' }}>
                  <Truck size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {receivingOrderId ? 'Recepción de Mercancía por Orden de Compra' : 'Registrar Factura de Compra Directa'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Ingreso físico al almacén, actualización inmediata de stock y generación de CxP
                  </p>
                </div>
              </div>
              <button onClick={() => setShowPurchaseModal(false)} className="btn btn-ghost btn-sm" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label className="label-control">Proveedor *</label>
                  <select
                    required
                    className="select-control"
                    value={purchaseFormData.supplier_id}
                    onChange={(e) => setPurchaseFormData({ ...purchaseFormData, supplier_id: e.target.value })}
                  >
                    <option value="">Seleccione proveedor...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name} ({s.tax_id})</option>)}
                  </select>
                </div>

                <div>
                  <label className="label-control">Almacén de Entrada *</label>
                  <select
                    required
                    className="select-control"
                    value={purchaseFormData.warehouse_id}
                    onChange={(e) => setPurchaseFormData({ ...purchaseFormData, warehouse_id: e.target.value })}
                  >
                    <option value="">Seleccione almacén...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="label-control">No. Factura Proveedor *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    placeholder="B01000... o FPROV-001"
                    value={purchaseFormData.supplier_invoice_number}
                    onChange={(e) => setPurchaseFormData({ ...purchaseFormData, supplier_invoice_number: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
                <div>
                  <label className="label-control">Condición de Pago</label>
                  <select
                    className="select-control"
                    value={purchaseFormData.payment_terms}
                    onChange={(e) => setPurchaseFormData({ ...purchaseFormData, payment_terms: e.target.value })}
                  >
                    <option value="cash">Contado</option>
                    <option value="credit">Crédito</option>
                  </select>
                </div>

                <div>
                  <label className="label-control">Días de Crédito</label>
                  <input
                    type="number"
                    min="1"
                    disabled={purchaseFormData.payment_terms !== 'credit'}
                    className="input-control"
                    value={purchaseFormData.credit_days}
                    onChange={(e) => setPurchaseFormData({ ...purchaseFormData, credit_days: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label-control">Notas u Observaciones</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Comentarios adicionales sobre la recepción"
                    value={purchaseFormData.notes}
                    onChange={(e) => setPurchaseFormData({ ...purchaseFormData, notes: e.target.value })}
                  />
                </div>
              </div>

              {/* Items Section */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Artículos a Ingresar
                  </h4>
                  <button type="button" onClick={handleAddPurchaseItem} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={14} />
                    <span>Agregar Ítem</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                  {purchaseFormData.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '3fr 1fr 1.2fr 1fr 40px',
                        gap: '8px',
                        alignItems: 'center',
                        background: 'rgba(255, 255, 255, 0.02)',
                        padding: '6px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <select
                        className="select-control"
                        required
                        value={item.product_id}
                        onChange={(e) => handlePurchaseItemChange(idx, 'product_id', e.target.value)}
                      >
                        <option value="">Seleccione producto...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>

                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="Cant."
                        className="input-control"
                        value={item.quantity}
                        onChange={(e) => handlePurchaseItemChange(idx, 'quantity', e.target.value)}
                      />

                      <input
                        type="number"
                        step="0.01"
                        placeholder="Costo (RD$)"
                        className="input-control"
                        value={item.unit_cost}
                        onChange={(e) => handlePurchaseItemChange(idx, 'unit_cost', e.target.value)}
                      />

                      <select
                        className="select-control"
                        value={item.tax_rate}
                        onChange={(e) => handlePurchaseItemChange(idx, 'tax_rate', e.target.value)}
                      >
                        <option value="18">18%</option>
                        <option value="0">0%</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemovePurchaseItem(idx)}
                        className="btn btn-danger btn-sm"
                        style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Calculation Panel */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <span>Subtotal:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    RD$ {purchaseCalculatedSubtotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <span>ITBIS:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    RD$ {purchaseCalculatedTax.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '8px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Total Factura:</span>
                  <span style={{ fontWeight: 900, color: '#38bdf8', fontSize: '1.25rem' }}>
                    RD$ {purchaseCalculatedTotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowPurchaseModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary" style={{ minWidth: '220px', fontWeight: 700 }}>
                  {submitting ? 'Ingresando Mercancía...' : (receivingOrderId ? 'Confirmar Recepción & Actualizar Stock' : 'Registrar Compra & Ingresar Stock')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: VIEW / PRINT OFFICIAL PURCHASE ORDER DOCUMENT        */}
      {/* ------------------------------------------------------------- */}
      {showViewOrderModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content modal-content-lg" style={{ maxWidth: '900px', width: '95%', padding: '24px' }}>
            {/* Top Toolbar (No-Print) */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="#38bdf8" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                  Documento Oficial de Orden de Compra
                </h3>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {selectedOrder && (selectedOrder.status === 'pending' || selectedOrder.status === 'approved') && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedOrder.id;
                      setShowViewOrderModal(false);
                      handleOpenEditOrder(id);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ gap: '6px', height: '32px', fontWeight: 600 }}
                  >
                    <Edit size={14} />
                    <span>Editar Orden</span>
                  </button>
                )}

                {selectedOrder && (selectedOrder.status === 'pending' || selectedOrder.status === 'approved' || selectedOrder.status === 'partially_received') && (
                  <button
                    type="button"
                    onClick={() => handleStartReceiveOrder(selectedOrder)}
                    className="btn btn-success btn-sm"
                    style={{ gap: '6px', height: '32px', fontWeight: 700 }}
                  >
                    <Truck size={14} />
                    <span>{selectedOrder.status === 'partially_received' ? 'Recibir Resto' : 'Recibir Mercancía'}</span>
                  </button>
                )}

                {selectedOrder && selectedOrder.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'approved')}
                    className="btn btn-sm"
                    style={{ background: '#0284c7', color: '#fff', border: 'none', gap: '6px', height: '32px', fontWeight: 600 }}
                  >
                    <Check size={14} />
                    <span>Aprobar Orden</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn btn-primary btn-sm"
                  style={{ gap: '6px', height: '32px' }}
                >
                  <Printer size={14} />
                  <span>Imprimir / PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowViewOrderModal(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '6px' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {loadingOrderDetail || !selectedOrder ? (
              <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Cargando orden de compra...
              </div>
            ) : (
              /* PRINTABLE SHEET CONTAINER */
              <div
                id="printable-po"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  borderRadius: '6px',
                  padding: '36px 42px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  fontFamily: "'Segoe UI', Roboto, sans-serif",
                  fontSize: '13px',
                  lineHeight: '1.45'
                }}
              >
                {/* 1. Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111827', paddingBottom: '16px', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#111827', margin: '0 0 4px 0', letterSpacing: '-0.3px' }}>
                      ORDEN DE COMPRA
                    </h2>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>
                      {selectedOrder.company?.name || 'Comercial Cambri SRL'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#4b5563' }}>
                      RNC: {selectedOrder.company?.tax_id || '131-45678-9'} &nbsp;·&nbsp; Tel: {selectedOrder.company?.phone || '809-555-0100'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#4b5563' }}>
                      {selectedOrder.company?.address || 'Av. Winston Churchill #1099, Santo Domingo'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: '12px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#0284c7', fontFamily: 'monospace' }}>
                      {selectedOrder.order_number}
                    </div>
                    <div style={{ marginTop: '4px', color: '#374151' }}>
                      <strong>Fecha de Emisión:</strong> {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString('es-DO') : '-'}
                    </div>
                    <div style={{ color: '#374151' }}>
                      <strong>Fecha de Entrega:</strong> {selectedOrder.expected_date ? new Date(selectedOrder.expected_date).toLocaleDateString('es-DO') : 'Inmediata'}
                    </div>
                    <div style={{ marginTop: '4px', color: '#4b5563' }}>
                      <strong>Estado:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{selectedOrder.status}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Metadata Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', backgroundColor: '#f9fafb', padding: '14px 18px', borderRadius: '4px', border: '1px solid #e5e7eb', marginBottom: '22px', fontSize: '12.5px' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#111827', marginBottom: '6px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
                      Datos del Proveedor
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827' }}>
                      {selectedOrder.supplier_name}
                    </div>
                    <div style={{ color: '#374151' }}>
                      <strong>RNC / Cédula:</strong> {selectedOrder.supplier_tax_id || 'N/D'}
                    </div>
                    <div style={{ color: '#374151' }}>
                      <strong>Contacto:</strong> {selectedOrder.supplier_contact || 'Representante de Ventas'}
                    </div>
                    <div style={{ color: '#374151' }}>
                      <strong>Teléfono:</strong> {selectedOrder.supplier_phone || '-'} &nbsp;·&nbsp; <strong>Email:</strong> {selectedOrder.supplier_email || '-'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, color: '#111827', marginBottom: '6px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
                      Destino de Entrega & Emisión
                    </div>
                    <div style={{ color: '#374151' }}>
                      <strong>Almacén Destino:</strong> {selectedOrder.warehouse_name}
                    </div>
                    <div style={{ color: '#374151' }}>
                      <strong>Sucursal:</strong> {selectedOrder.branch_name}
                    </div>
                    <div style={{ color: '#374151' }}>
                      <strong>Solicitado por:</strong> {selectedOrder.user_name}
                    </div>
                    {selectedOrder.notes && (
                      <div style={{ marginTop: '4px', fontStyle: 'italic', color: '#6b7280' }}>
                        "{selectedOrder.notes}"
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Items Table */}
                <div style={{ marginBottom: '24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #111827', borderTop: '1px solid #e5e7eb', background: '#f3f4f6' }}>
                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700 }}>Ítem / Código</th>
                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700 }}>Descripción del Producto</th>
                        <th style={{ textAlign: 'center', padding: '8px 6px', fontWeight: 700 }}>Cantidad</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 700 }}>Costo Pactado</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 700 }}>ITBIS</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 700 }}>Total (RD$)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedOrder.items || selectedOrder.items.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>No hay artículos en la orden.</td></tr>
                      ) : (
                        selectedOrder.items.map((it, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 6px', fontFamily: 'monospace', fontWeight: 600 }}>{it.sku || `PROD-${it.product_id}`}</td>
                            <td style={{ padding: '7px 6px', fontWeight: 600, color: '#111827' }}>{it.product_name}</td>
                            <td style={{ textAlign: 'center', padding: '7px 6px', fontWeight: 700 }}>{it.quantity}</td>
                            <td style={{ textAlign: 'right', padding: '7px 6px' }}>
                              {Number(it.unit_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', padding: '7px 6px', color: '#4b5563' }}>
                              {Number(it.tax_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', padding: '7px 6px', fontWeight: 700, color: '#111827' }}>
                              {Number(it.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 4. Totals Calculation */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginBottom: '36px' }}>
                  <div style={{ width: '280px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#4b5563' }}>
                      <span>Subtotal Neto:</span>
                      <span style={{ fontWeight: 600 }}>RD$ {Number(selectedOrder.subtotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#4b5563' }}>
                      <span>ITBIS (18%):</span>
                      <span style={{ fontWeight: 600 }}>RD$ {Number(selectedOrder.tax_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '2px solid #111827', marginTop: '4px', fontSize: '15px' }}>
                      <span style={{ fontWeight: 900, color: '#111827' }}>TOTAL ORDEN:</span>
                      <span style={{ fontWeight: 900, color: '#0284c7' }}>RD$ {Number(selectedOrder.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* 5. Signatures Block */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '30px', borderTop: '1px dashed #d1d5db', paddingTop: '40px', textAlign: 'center', fontSize: '11.5px', color: '#4b5563' }}>
                  <div>
                    <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
                      <strong>Solicitado por</strong><br />
                      {selectedOrder.user_name || 'Departamento de Compras'}
                    </div>
                  </div>
                  <div>
                    <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
                      <strong>Autorizado por</strong><br />
                      Gerencia General / Operaciones
                    </div>
                  </div>
                  <div>
                    <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
                      <strong>Recibido por Proveedor</strong><br />
                      Firma y Sello de Aceptación
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
