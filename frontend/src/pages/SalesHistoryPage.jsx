import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Receipt, Search, Printer, Ban, AlertCircle, X,
  FileX, CheckCircle, Undo2, ChevronRight, ChevronLeft,
  ChevronsLeft, ChevronsRight, Building2, Wallet, CreditCard,
  Filter, RefreshCw, Calendar, Download, User, RotateCcw,
  FileText
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import ThermalReceipt from '../components/ThermalReceipt';

const FISCAL_TYPES = [
  { code: 'B01', label: 'B01 - Factura de Crédito Fiscal' },
  { code: 'B02', label: 'B02 - Factura de Consumo' },
  { code: 'B04', label: 'B04 - Nota de Crédito' },
  { code: 'B14', label: 'B14 - Regímenes Especiales' },
  { code: 'B15', label: 'B15 - Gubernamental' }
];

const ACTION_OPTIONS = [
  {
    value: 'refund_cash',
    label: 'Reembolso en Efectivo',
    description: 'Se devuelve el dinero al cliente directamente.',
    color: '#10b981'
  },
  {
    value: 'credit_cxc',
    label: 'Nota de Crédito en CxC',
    description: 'Se aplica como abono en la cuenta por cobrar del cliente.',
    color: '#3b82f6'
  },
  {
    value: 'store_credit',
    label: 'Crédito en Tienda',
    description: 'Se acredita al saldo disponible del cliente para próximas compras.',
    color: '#f59e0b'
  }
];

export default function SalesHistoryPage({ activeBranch }) {
  const { addToast } = useToast();

  // Data states
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [salespeople, setSalespeople] = useState([]);

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(activeBranch?.id !== undefined ? String(activeBranch.id) : '');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [fiscalTypeCode, setFiscalTypeCode] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [datePreset, setDatePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, pages: 1 });
  const [summary, setSummary] = useState({
    totalAmount: 0,
    cashCount: 0,
    creditCount: 0,
    cancelledCount: 0,
    activeCount: 0,
    totalCount: 0
  });

  // Modals
  const [selectedSale, setSelectedSale] = useState(null);
  const [cancelModalSale, setCancelModalSale] = useState(null);
  const [cancelReason, setCancelReason] = useState('Devolución de cliente');
  const [actionTaken, setActionTaken] = useState('refund_cash');
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sync activeBranch if changed from topbar
  useEffect(() => {
    if (activeBranch?.id !== undefined) {
      setSelectedBranchId(String(activeBranch.id));
      setPage(1);
    }
  }, [activeBranch]);

  // Load catalogs (branches & salespeople)
  useEffect(() => {
    api.get('/admin/branches-warehouses')
      .then(res => {
        if (res.success && Array.isArray(res.branches)) {
          setBranches(res.branches);
        }
      })
      .catch(err => console.error('Error fetching branches:', err));

    api.get('/third-parties/salespeople')
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setSalespeople(res.data);
        }
      })
      .catch(err => console.error('Error fetching salespeople:', err));
  }, []);

  // Quick date presets calculation
  const handleDatePresetChange = (preset) => {
    setDatePreset(preset);
    setPage(1);

    const now = new Date();
    const toISODate = (d) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      const today = toISODate(now);
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'week') {
      const start = new Date();
      start.setDate(now.getDate() - 7);
      setStartDate(toISODate(start));
      setEndDate(toISODate(now));
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toISODate(start));
      setEndDate(toISODate(now));
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Reset page to 1 when changing filters
  const handleFilterChange = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedBranchId('');
    setFilterStatus('');
    setFilterType('');
    setFiscalTypeCode('');
    setSalespersonId('');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  // Load sales with active filters & pagination
  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        search: search.trim() || undefined,
        branch_id: selectedBranchId || undefined,
        status: filterStatus || undefined,
        sale_type: filterType || undefined,
        fiscal_type_code: fiscalTypeCode || undefined,
        salesperson_id: salespersonId || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined
      };

      const res = await api.get('/sales', params);
      if (res.success) {
        setSales(res.data || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
        if (res.summary) {
          setSummary(res.summary);
        }
      }
    } catch (err) {
      console.error(err);
      addToast('Error cargando el listado de ventas.', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    search,
    selectedBranchId,
    filterStatus,
    filterType,
    fiscalTypeCode,
    salespersonId,
    startDate,
    endDate,
    addToast
  ]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  // Export to CSV
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      // Fetch up to 1000 matching records for export
      const params = {
        page: 1,
        limit: 1000,
        search: search.trim() || undefined,
        branch_id: selectedBranchId || undefined,
        status: filterStatus || undefined,
        sale_type: filterType || undefined,
        fiscal_type_code: fiscalTypeCode || undefined,
        salesperson_id: salespersonId || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined
      };

      const res = await api.get('/sales', params);
      if (!res.success || !res.data || res.data.length === 0) {
        addToast('No hay datos para exportar con los filtros actuales.', 'warning');
        return;
      }

      const rows = res.data;
      const headers = [
        'No. Factura',
        'NCF',
        'Tipo Fiscal',
        'Fecha',
        'Sucursal',
        'Cliente',
        'RNC / Cédula',
        'Tipo de Venta',
        'Vendedor',
        'Subtotal (RD$)',
        'ITBIS (RD$)',
        'Total (RD$)',
        'Estado'
      ];

      const csvRows = [headers.join(',')];

      rows.forEach(r => {
        const row = [
          `"${r.sale_number || ''}"`,
          `"${r.ncf || ''}"`,
          `"${r.fiscal_type_code || ''}"`,
          `"${new Date(r.created_at).toLocaleString('es-DO')}"`,
          `"${(r.branch_name || '').replace(/"/g, '""')}"`,
          `"${(r.customer_name || '').replace(/"/g, '""')}"`,
          `"${r.customer_tax_id || r.customer_id_card || ''}"`,
          `"${r.sale_type === 'credit' ? 'Crédito' : r.sale_type === 'mixed' ? 'Mixta' : 'Contado'}"`,
          `"${(r.salesperson_name || r.seller_name || '').replace(/"/g, '""')}"`,
          Number(r.subtotal || 0).toFixed(2),
          Number(r.tax_amount || 0).toFixed(2),
          Number(r.total || 0).toFixed(2),
          `"${r.status === 'cancelled' ? 'Anulada' : r.status === 'paid' ? 'Pagada' : 'Pendiente'}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Ventas_Facturacion_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast('Archivo CSV descargado exitosamente.', 'success');
    } catch (err) {
      console.error(err);
      addToast('Error al exportar los datos.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleViewReceipt = async (id) => {
    try {
      const res = await api.get(`/sales/${id}`);
      if (res.success) setSelectedSale(res.data);
    } catch (err) {
      addToast(err.message || 'Error cargando comprobante.', 'error');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalSale) return;
    if (!cancelReason.trim()) {
      addToast('Debe ingresar un motivo de anulación.', 'warning');
      return;
    }
    setCancelling(true);
    try {
      const res = await api.post(`/sales/${cancelModalSale.id}/cancel`, {
        reason: cancelReason,
        action_taken: actionTaken
      });
      if (res.success) {
        addToast(
          `Venta anulada. NC B04 generada: ${res.credit_note?.ncf || ''}`,
          'success'
        );
        setCancelModalSale(null);
        setCancelReason('Devolución de cliente');
        setActionTaken('refund_cash');
        loadSales();
      }
    } catch (err) {
      addToast(err.message || 'Error anulando venta.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const saleTypeLabel = (t) => {
    if (t === 'credit') return { label: 'Crédito', cls: 'badge-warning' };
    if (t === 'mixed') return { label: 'Mixta', cls: 'badge-info' };
    return { label: 'Contado', cls: 'badge-success' };
  };

  // Pagination bounds calculation
  const totalRecords = pagination.total || 0;
  const totalPages = Math.max(1, pagination.pages || 1);
  const startRecord = totalRecords === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(totalRecords, page * limit);

  // Active filter count
  const hasActiveFilters = useMemo(() => {
    return Boolean(
      search.trim() ||
      selectedBranchId ||
      filterStatus ||
      filterType ||
      fiscalTypeCode ||
      salespersonId ||
      startDate ||
      endDate ||
      datePreset !== 'all'
    );
  }, [search, selectedBranchId, filterStatus, filterType, fiscalTypeCode, salespersonId, startDate, endDate, datePreset]);

  // Generate page numbers to show
  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxButtons = 5;
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);

    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [page, totalPages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Receipt size={24} color="#3b82f6" />
            Ventas &amp; Facturación Histórica
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
            Histórico oficial de comprobantes fiscales emitidos (NCF DGII) y anulación con Notas de Crédito B04
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleExportCSV}
            disabled={exporting || loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px' }}
            title="Exportar registros filtrados a CSV / Excel"
          >
            <Download size={15} color="#10b981" />
            <span style={{ fontWeight: 600 }}>{exporting ? 'Exportando...' : 'Exportar CSV'}</span>
          </button>

          <button
            onClick={loadSales}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            title="Refrescar listado"
            style={{ height: '38px', padding: '0 12px' }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards (Global Summary of Filtered Set) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Facturación Activa</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={16} color="#3b82f6" />
            </div>
          </div>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#60a5fa' }}>
            RD$ {summary.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {summary.activeCount} facturas activas
          </p>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Ventas al Contado</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={16} color="#10b981" />
            </div>
          </div>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{summary.cashCount}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Efectivo, tarjetas y transferencias</p>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Ventas a Crédito</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={16} color="#f59e0b" />
            </div>
          </div>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>{summary.creditCount}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Con línea de crédito y balance CxC</p>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Facturas Anuladas</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ban size={16} color="#ef4444" />
            </div>
          </div>
          <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{summary.cancelledCount}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Con Nota de Crédito B04 generada</p>
        </div>
      </div>

      {/* ADVANCED FILTERS PANEL */}
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Row 1: Search & Primary Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Free text search */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="text"
              className="input-control"
              placeholder="Buscar por No. Factura, NCF, Cliente, RNC o Cédula..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              style={{ paddingLeft: '38px', paddingRight: search ? '32px' : '12px', height: '38px' }}
            />
            {search && (
              <button
                onClick={() => handleFilterChange(setSearch, '')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '11px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0
                }}
                title="Borrar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Branch Filter */}
          <select
            className="select-control"
            value={selectedBranchId}
            onChange={(e) => handleFilterChange(setSelectedBranchId, e.target.value)}
            style={{ width: '200px', height: '38px', fontSize: '0.82rem' }}
          >
            <option value="">🏢 Todas las sucursales</option>
            {branches.map(b => (
              <option key={b.id} value={String(b.id)}>
                📍 {b.name}
              </option>
            ))}
          </select>

          {/* Fiscal Voucher NCF Filter */}
          <select
            className="select-control"
            value={fiscalTypeCode}
            onChange={(e) => handleFilterChange(setFiscalTypeCode, e.target.value)}
            style={{ width: '200px', height: '38px', fontSize: '0.82rem' }}
          >
            <option value="">📑 Todos los comprobantes (NCF)</option>
            {FISCAL_TYPES.map(f => (
              <option key={f.code} value={f.code}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Salesperson Filter */}
          <select
            className="select-control"
            value={salespersonId}
            onChange={(e) => handleFilterChange(setSalespersonId, e.target.value)}
            style={{ width: '180px', height: '38px', fontSize: '0.82rem' }}
          >
            <option value="">👤 Todos los vendedores</option>
            {salespeople.map(sp => (
              <option key={sp.id} value={String(sp.id)}>
                {sp.code ? `[${sp.code}] ` : ''}{sp.name}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Status, Type, Date Presets & Custom Range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Status Filter */}
          <select
            className="select-control"
            value={filterStatus}
            onChange={(e) => handleFilterChange(setFilterStatus, e.target.value)}
            style={{ width: '160px', height: '38px', fontSize: '0.82rem' }}
          >
            <option value="">Todos los estados</option>
            <option value="paid">✅ Pagadas</option>
            <option value="pending">⏳ Pendientes</option>
            <option value="cancelled">🚫 Anuladas</option>
          </select>

          {/* Sale Type Filter */}
          <select
            className="select-control"
            value={filterType}
            onChange={(e) => handleFilterChange(setFilterType, e.target.value)}
            style={{ width: '150px', height: '38px', fontSize: '0.82rem' }}
          >
            <option value="">Todos los tipos</option>
            <option value="cash">Contado</option>
            <option value="credit">Crédito</option>
            <option value="mixed">Mixta</option>
          </select>

          {/* Date Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => handleDatePresetChange('all')}
              style={{
                background: datePreset === 'all' ? 'var(--primary-color, #3b82f6)' : 'transparent',
                color: datePreset === 'all' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Histórico
            </button>
            <button
              type="button"
              onClick={() => handleDatePresetChange('today')}
              style={{
                background: datePreset === 'today' ? 'var(--primary-color, #3b82f6)' : 'transparent',
                color: datePreset === 'today' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => handleDatePresetChange('week')}
              style={{
                background: datePreset === 'week' ? 'var(--primary-color, #3b82f6)' : 'transparent',
                color: datePreset === 'week' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              7 Días
            </button>
            <button
              type="button"
              onClick={() => handleDatePresetChange('month')}
              style={{
                background: datePreset === 'month' ? 'var(--primary-color, #3b82f6)' : 'transparent',
                color: datePreset === 'month' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('custom')}
              style={{
                background: datePreset === 'custom' ? 'var(--primary-color, #3b82f6)' : 'transparent',
                color: datePreset === 'custom' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Rango
            </button>
          </div>

          {/* Custom Date Pickers (visible if custom or preset with dates) */}
          {datePreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Desde:</span>
                <input
                  type="date"
                  className="input-control"
                  value={startDate}
                  onChange={(e) => handleFilterChange(setStartDate, e.target.value)}
                  style={{ height: '38px', padding: '0 8px', fontSize: '0.8rem', width: '135px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hasta:</span>
                <input
                  type="date"
                  className="input-control"
                  value={endDate}
                  onChange={(e) => handleFilterChange(setEndDate, e.target.value)}
                  style={{ height: '38px', padding: '0 8px', fontSize: '0.8rem', width: '135px' }}
                />
              </div>
            </div>
          )}

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="btn btn-secondary btn-sm"
              style={{
                height: '38px',
                padding: '0 12px',
                color: '#ef4444',
                borderColor: 'rgba(239,68,68,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Restablecer todos los filtros"
            >
              <RotateCcw size={14} />
              <span>Limpiar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* SALES TABLE */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>No. Factura</th>
              <th>NCF DGII</th>
              <th>Fecha</th>
              <th>Sucursal</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Tipo</th>
              <th>Total (RD$)</th>
              <th>Estado</th>
              <th style={{ textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <RefreshCw size={24} className="spin" color="#3b82f6" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Cargando ventas del sistema...</span>
                  </div>
                </td>
              </tr>
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <FileX size={32} color="var(--text-muted)" opacity={0.6} />
                    <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>No se encontraron ventas con los filtros aplicados.</span>
                    {hasActiveFilters && (
                      <button onClick={handleClearFilters} className="btn btn-secondary btn-sm" style={{ marginTop: '6px' }}>
                        Restablecer Filtros
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sales.map(s => {
                const typeInfo = saleTypeLabel(s.sale_type);
                return (
                  <tr key={s.id} style={{ opacity: s.status === 'cancelled' ? 0.65 : 1 }}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>
                      {s.sale_number}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>{s.ncf}</span>
                      <span style={{ fontSize: '0.68rem', display: 'block', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {s.fiscal_type_code || 'B02'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{new Date(s.created_at).toLocaleString('es-DO')}</td>
                    <td>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Building2 size={12} color="#60a5fa" />
                        {s.branch_name || 'Principal'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.customer_name}</div>
                      {(s.customer_tax_id || s.customer_id_card) && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          {s.customer_tax_id || s.customer_id_card}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={12} color="var(--text-muted)" />
                        <span>{s.salesperson_name || s.seller_name || 'Directo'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${typeInfo.cls}`}>{typeInfo.label}</span>
                    </td>
                    <td style={{ fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      RD$ {Number(s.total).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'cancelled' ? 'badge-danger' : s.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                        {s.status === 'cancelled' ? '🚫 Anulada' : s.status === 'paid' ? '✅ Pagada' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleViewReceipt(s.id)}
                          className="btn btn-secondary btn-sm"
                          title="Ver/Imprimir Comprobante Fiscal"
                        >
                          <Printer size={14} />
                        </button>
                        {s.status !== 'cancelled' && (
                          <button
                            onClick={() => setCancelModalSale(s)}
                            className="btn btn-danger btn-sm"
                            title="Anular Venta → Nota de Crédito B04"
                          >
                            <Ban size={14} />
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
      </div>

      {/* PAGINATION BAR */}
      <div className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        {/* Left: Rows Per Page Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mostrar</span>
          <select
            className="select-control"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            style={{ width: '75px', height: '32px', fontSize: '0.8rem', padding: '0 6px' }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>por página</span>
        </div>

        {/* Center: Counter summary */}
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Mostrando <strong style={{ color: 'var(--text-primary)' }}>{startRecord}</strong> - <strong style={{ color: 'var(--text-primary)' }}>{endRecord}</strong> de <strong style={{ color: 'var(--text-primary)' }}>{totalRecords}</strong> facturas
        </div>

        {/* Right: Page Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* First Page */}
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1 || loading}
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px 8px', height: '32px' }}
            title="Primera página"
          >
            <ChevronsLeft size={14} />
          </button>

          {/* Previous Page */}
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px 8px', height: '32px' }}
            title="Página anterior"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Page numbers */}
          {pageNumbers.map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              disabled={loading}
              style={{
                minWidth: '32px',
                height: '32px',
                borderRadius: '6px',
                border: p === page ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                background: p === page ? '#3b82f6' : 'var(--bg-subtle)',
                color: p === page ? '#ffffff' : 'var(--text-primary)',
                fontWeight: p === page ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {p}
            </button>
          ))}

          {/* Next Page */}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px 8px', height: '32px' }}
            title="Página siguiente"
          >
            <ChevronRight size={14} />
          </button>

          {/* Last Page */}
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages || loading}
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px 8px', height: '32px' }}
            title="Última página"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>

      {/* MODAL: ANULACIÓN / NOTA DE CRÉDITO B04 */}
      {cancelModalSale && (
        <div className="modal-overlay" onClick={() => setCancelModalSale(null)}>
          <div className="modal-content" style={{ maxWidth: '520px', padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileX size={18} color="#ef4444" />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Anular Venta #{cancelModalSale.sale_number}
                  </h3>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '44px' }}>
                  Se emitirá una <strong style={{ color: '#f59e0b' }}>Nota de Crédito B04</strong> oficial DGII
                </p>
              </div>
              <button onClick={() => setCancelModalSale(null)} className="btn btn-secondary btn-sm" style={{ padding: '5px' }}>
                <X size={15} />
              </button>
            </div>

            {/* Sale Summary */}
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '0.8rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Cliente</span>
                  <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{cancelModalSale.customer_name}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>NCF Original</span>
                  <p style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{cancelModalSale.ncf}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Total</span>
                  <p style={{ fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                    RD$ {Number(cancelModalSale.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Motivo */}
            <div style={{ marginBottom: '18px' }}>
              <label className="label-control">Motivo de Anulación *</label>
              <textarea
                rows="3"
                className="input-control"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Describa el motivo de la anulación..."
              />
            </div>

            {/* Acción */}
            <div style={{ marginBottom: '22px' }}>
              <label className="label-control" style={{ marginBottom: '10px', display: 'block' }}>
                Acción sobre el Importe *
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ACTION_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: `1.5px solid ${actionTaken === opt.value ? opt.color : 'var(--border-color)'}`,
                      background: actionTaken === opt.value ? `${opt.color}10` : 'var(--bg-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <input
                      type="radio"
                      name="action_taken"
                      value={opt.value}
                      checked={actionTaken === opt.value}
                      onChange={() => setActionTaken(opt.value)}
                      style={{ marginTop: '3px', accentColor: opt.color }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: actionTaken === opt.value ? opt.color : 'var(--text-primary)', fontSize: '0.88rem' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {opt.description}
                      </div>
                    </div>
                    {actionTaken === opt.value && (
                      <CheckCircle size={16} color={opt.color} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Warning */}
            <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '8px', marginBottom: '18px', fontSize: '0.75rem', color: '#fbbf24' }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Esta acción es <strong>irreversible</strong>. La mercancía se reintegrará al inventario y el NCF B04 quedará registrado en la DGII.</span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setCancelModalSale(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={cancelling}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="btn btn-danger"
                style={{ flex: 1, gap: '6px' }}
                disabled={cancelling || !cancelReason.trim()}
              >
                {cancelling ? (
                  <span>Procesando...</span>
                ) : (
                  <>
                    <Undo2 size={15} />
                    <span>Confirmar Anulación</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT THERMAL RECEIPT */}
      {selectedSale && (
        <ThermalReceipt
          saleData={selectedSale}
          onClose={() => setSelectedSale(null)}
        />
      )}
    </div>
  );
}
