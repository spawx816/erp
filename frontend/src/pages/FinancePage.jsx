import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, Clock, Users, ArrowUpRight, ArrowDownLeft,
  Plus, Calendar, CheckCircle2, AlertCircle, X, Receipt,
  HandCoins, History, CalendarClock, CreditCard, ChevronRight,
  Printer, ArrowRight, Check, AlertTriangle, ShieldAlert,
  Search, Filter, ChevronLeft, ChevronsLeft, ChevronsRight, RotateCcw,
  Download
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function FinancePage({ activeBranch, initialTab = 'cxc' }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab); // 'cxc' | 'aging' | 'cxp' | 'expenses'

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [receivables, setReceivables] = useState([]);
  const [agingData, setAgingData] = useState(null);
  const [payables, setPayables] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // CxC Filters and Pagination
  const [cxcSearch, setCxcSearch] = useState('');
  const [cxcStatusFilter, setCxcStatusFilter] = useState('all'); // 'all' | 'current' | 'overdue' | 'critical'
  const [cxcSalespersonFilter, setCxcSalespersonFilter] = useState('');
  const [cxcPage, setCxcPage] = useState(1);
  const [cxcPageSize, setCxcPageSize] = useState(15);

  // Expenses Filters and Pagination
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('');
  const [expenseDateFrom, setExpenseDateFrom] = useState('');
  const [expenseDateTo, setExpenseDateTo] = useState('');
  const [expensePage, setExpensePage] = useState(1);
  const [expensePageSize, setExpensePageSize] = useState(15);
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('all'); // 'all' | 'active' | 'cancelled'

  // Multi-invoice payment modal (Section #13)
  const [showMultiPayModal, setShowMultiPayModal] = useState(false);
  const [selectedCustomerForPay, setSelectedCustomerForPay] = useState(null);
  const [customerInvoices, setCustomerInvoices] = useState([]);
  const [paymentTotalAmount, setPaymentTotalAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [paymentRef, setPaymentRef] = useState('');
  const [allocations, setAllocations] = useState({}); // { [receivable_id]: amount }
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Drilldown modal for aging table
  const [drilldownCustomer, setDrilldownCustomer] = useState(null);

  // Expense Modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseData, setExpenseData] = useState({
    category_id: '',
    amount: '',
    payment_method: 'cash',
    beneficiary: '',
    voucher_number: '',
    notes: '',
    expense_date: new Date().toISOString().split('T')[0]
  });

  // Receipt Modal
  const [completedPaymentReceipt, setCompletedPaymentReceipt] = useState(null);

  // Pay Supplier Modal (CxP)
  const [showPaySupplierModal, setShowPaySupplierModal] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState(null);
  const [paySupplierAmount, setPaySupplierAmount] = useState('');
  const [paySupplierMethod, setPaySupplierMethod] = useState('transfer');
  const [paySupplierRef, setPaySupplierRef] = useState('');
  const [paySupplierNotes, setPaySupplierNotes] = useState('');
  const [submittingPaySupplier, setSubmittingPaySupplier] = useState(false);

  useEffect(() => {
    loadData();

    const handleExternalUpdate = () => {
      loadData();
    };
    window.addEventListener('sgc:sale-completed', handleExternalUpdate);
    window.addEventListener('sgc:credit-note-created', handleExternalUpdate);

    return () => {
      window.removeEventListener('sgc:sale-completed', handleExternalUpdate);
      window.removeEventListener('sgc:credit-note-created', handleExternalUpdate);
    };
  }, [activeTab, activeBranch]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'cxc') {
        const res = await api.get('/finance/receivables');
        if (res.success) setReceivables(res.data);
      } else if (activeTab === 'aging') {
        const res = await api.get('/finance/receivables/aging-table');
        if (res.success) setAgingData(res.data);
      } else if (activeTab === 'cxp') {
        const res = await api.get('/finance/payables');
        if (res.success) setPayables(res.data);
      } else if (activeTab === 'expenses') {
        await loadExpenses();
        const catRes = await api.get('/finance/expense-categories');
        if (catRes.success) setExpenseCategories(catRes.data);
      }

      const custRes = await api.get('/third-parties/customers');
      if (custRes.success) setCustomers(custRes.data);
    } catch (err) {
      console.error(err);
      addToast('Error al cargar datos financieros.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadExpenses = async () => {
    const params = {
      page: expensePage,
      limit: expensePageSize,
      search: expenseSearch || undefined,
      category_id: expenseCategoryFilter || undefined,
      start_date: expenseDateFrom || undefined,
      end_date: expenseDateTo || undefined,
      status: expenseStatusFilter !== 'all' ? expenseStatusFilter : undefined
    };

    const res = await api.get('/finance/expenses', params);
    if (res.success) {
      setExpenses(res.data);
    }
  };

  const handleOpenMultiPay = async (customer = null) => {
    setSelectedCustomerForPay(customer);
    setPaymentTotalAmount('');
    setAllocations({});
    setCustomerInvoices([]);
    setShowMultiPayModal(true);

    if (customer && customer.id) {
      loadCustomerInvoices(customer.id);
    }
  };

  const loadCustomerInvoices = async (customerId) => {
    try {
      const res = await api.get(`/third-parties/customers/${customerId}/360`);
      if (res.success) {
        const openRecs = res.data.receivables?.filter(r => r.status !== 'paid' && Number(r.balance) > 0) || [];
        setCustomerInvoices(openRecs);
      }
    } catch (err) {
      addToast('Error al cargar facturas pendientes del cliente.', 'error');
    }
  };

  // Automatic FIFO distribution across invoices
  const handleAutoDistributeFIFO = () => {
    const total = parseFloat(paymentTotalAmount || 0);
    if (total <= 0) return;

    let remaining = total;
    const newAlloc = {};

    // Sort invoices oldest first
    const sorted = [...customerInvoices].sort((a, b) => new Date(a.issue_date) - new Date(b.issue_date));

    sorted.forEach(inv => {
      if (remaining <= 0) return;
      const bal = Number(inv.balance);
      const apply = Math.min(remaining, bal);
      newAlloc[inv.id] = apply;
      remaining -= apply;
    });

    setAllocations(newAlloc);
    addToast(`Monto de RD$ ${total.toFixed(2)} distribuido automáticamente en ${Object.keys(newAlloc).length} facturas (FIFO).`, 'info');
  };

  const handleManualAllocationChange = (invId, val) => {
    const amt = parseFloat(val) || 0;
    const updated = { ...allocations, [invId]: amt };
    setAllocations(updated);

    // Update total
    const newTotal = Object.values(updated).reduce((sum, v) => sum + Number(v || 0), 0);
    setPaymentTotalAmount(newTotal > 0 ? String(newTotal) : '');
  };

  const handleSubmitMultiPay = async (e) => {
    e.preventDefault();
    const total = parseFloat(paymentTotalAmount || 0);
    if (!selectedCustomerForPay || total <= 0) {
      addToast('Ingresa un monto de cobro válido.', 'warning');
      return;
    }

    setSubmittingPayment(true);
    try {
      const allocArray = Object.entries(allocations)
        .filter(([_, amt]) => Number(amt) > 0)
        .map(([recId, amt]) => ({
          receivable_id: parseInt(recId, 10),
          amount_applied: Number(amt)
        }));

      const res = await api.post('/finance/receivables/pay', {
        customer_id: selectedCustomerForPay.id,
        total_amount: total,
        payment_method: paymentMethod,
        reference_number: paymentRef,
        allocations: allocArray.length > 0 ? allocArray : undefined
      });

      if (res.success) {
        addToast('Cobro registrado exitosamente.', 'success');
        setCompletedPaymentReceipt({
          receipt_number: `RC-${Date.now().toString().slice(-6)}`,
          customer_name: selectedCustomerForPay.company_name || `${selectedCustomerForPay.first_name} ${selectedCustomerForPay.last_name}`,
          amount: total,
          payment_method: paymentMethod,
          date: new Date().toLocaleDateString('es-DO'),
          applied_count: allocArray.length || customerInvoices.length
        });

        setShowMultiPayModal(false);
        loadData();
        window.dispatchEvent(new CustomEvent('sgc:payment-recorded', { detail: { customerId: selectedCustomerForPay.id, amount: total } }));
      }
    } catch (err) {
      addToast(err.message || 'Error registrando cobro.', 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/finance/expenses', expenseData);
      if (res.success) {
        addToast('Gasto registrado exitosamente.', 'success');
        setShowExpenseModal(false);
        setExpenseData({
          category_id: '',
          amount: '',
          payment_method: 'cash',
          beneficiary: '',
          voucher_number: '',
          notes: ''
        });
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error registrando gasto.', 'error');
    }
  };

  const handleExportExpensesCSV = () => {
    if (!expenses || expenses.length === 0) {
      addToast('No hay gastos para exportar.', 'warning');
      return;
    }
    const headers = ['Fecha', 'Categoría', 'Beneficiario', 'Monto (RD$)', 'Método', 'Comprobante', 'Estado', 'Notas'];
    const rows = expenses.map(e => [
      e.expense_date,
      e.category_name || '',
      e.beneficiary || '',
      Number(e.amount).toFixed(2),
      e.payment_method,
      e.voucher_number || '',
      e.status || 'active',
      e.notes || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `gastos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Gastos exportados a CSV.', 'success');
  };

  const handleOpenPaySupplier = (payable = null) => {
    if (payable) {
      setSelectedPayable(payable);
      setPaySupplierAmount(String(payable.balance || ''));
    } else {
      const firstOpen = payables.find(p => Number(p.balance) > 0) || payables[0];
      setSelectedPayable(firstOpen || null);
      setPaySupplierAmount(firstOpen ? String(firstOpen.balance || '') : '');
    }
    setPaySupplierMethod('transfer');
    setPaySupplierRef('');
    setPaySupplierNotes('');
    setShowPaySupplierModal(true);
  };

  const handleProcessPaySupplier = async (e) => {
    e.preventDefault();
    if (!selectedPayable) {
      addToast('Seleccione la factura de proveedor a pagar.', 'warning');
      return;
    }
    const amt = parseFloat(paySupplierAmount);
    if (isNaN(amt) || amt <= 0) {
      addToast('Ingrese un monto válido mayor a 0.', 'warning');
      return;
    }
    if (amt > Number(selectedPayable.balance) + 0.01) {
      addToast(`El monto excede el saldo pendiente (RD$ ${Number(selectedPayable.balance).toLocaleString('es-DO')}).`, 'warning');
      return;
    }

    setSubmittingPaySupplier(true);
    try {
      const res = await api.post('/finance/payables/pay', {
        payable_id: selectedPayable.id,
        amount: amt,
        payment_method: paySupplierMethod,
        reference_number: paySupplierRef,
        notes: paySupplierNotes
      });
      if (res.success) {
        addToast('Pago a proveedor registrado exitosamente.', 'success');
        setShowPaySupplierModal(false);
        loadData();
      } else {
        addToast(res.message || 'Error registrando pago.', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error registrando pago a proveedor.', 'error');
    } finally {
      setSubmittingPaySupplier(false);
    }
  };

  const formatFinanceDate = (d) => {
    if (!d) return '-';
    try {
      const val = typeof d === 'string' ? d.split('T')[0] : d;
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        const [y, m, day] = val.split('-');
        return `${day}/${m}/${y}`;
      }
      return new Date(d).toLocaleDateString('es-DO');
    } catch {
      return String(d);
    }
  };

  // CxC Filtering & Pagination
  useEffect(() => {
    setCxcPage(1);
  }, [cxcSearch, cxcStatusFilter, cxcSalespersonFilter]);

  const uniqueSalespeople = useMemo(() => {
    const list = new Set();
    receivables.forEach(r => {
      if (r.salesperson_name) list.add(r.salesperson_name);
    });
    return Array.from(list);
  }, [receivables]);

  const filteredReceivables = useMemo(() => {
    return receivables.filter(r => {
      const isOverdue = Number(r.days_overdue) > 0;
      const days = Number(r.days_overdue) || 0;

      // Status filter
      if (cxcStatusFilter === 'current' && isOverdue) return false;
      if (cxcStatusFilter === 'overdue' && !isOverdue) return false;
      if (cxcStatusFilter === 'critical' && days <= 60) return false;

      // Salesperson filter
      if (cxcSalespersonFilter && r.salesperson_name !== cxcSalespersonFilter) return false;

      // Search filter
      if (cxcSearch.trim()) {
        const q = cxcSearch.toLowerCase().trim();
        const invoiceNum = (r.invoice_number || `FAC-${r.sale_id}` || '').toLowerCase();
        const ncf = (r.ncf || '').toLowerCase();
        const customer = (r.customer_name || '').toLowerCase();
        if (!invoiceNum.includes(q) && !ncf.includes(q) && !customer.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [receivables, cxcStatusFilter, cxcSalespersonFilter, cxcSearch]);

  const cxcTotals = useMemo(() => {
    let totalBal = 0;
    let overdueBal = 0;
    let currentBal = 0;
    let overdueCount = 0;
    let currentCount = 0;

    receivables.forEach(r => {
      const b = Number(r.balance) || 0;
      const isOver = Number(r.days_overdue) > 0;
      totalBal += b;
      if (isOver) {
        overdueBal += b;
        overdueCount++;
      } else {
        currentBal += b;
        currentCount++;
      }
    });

    return { totalBal, overdueBal, currentBal, overdueCount, currentCount, totalCount: receivables.length };
  }, [receivables]);

  const totalCxcPages = Math.max(1, Math.ceil(filteredReceivables.length / cxcPageSize));

  useEffect(() => {
    if (cxcPage > totalCxcPages) {
      setCxcPage(1);
    }
  }, [totalCxcPages, cxcPage]);

  const paginatedReceivables = useMemo(() => {
    const start = (cxcPage - 1) * cxcPageSize;
    return filteredReceivables.slice(start, start + cxcPageSize);
  }, [filteredReceivables, cxcPage, cxcPageSize]);

  const cxcPageNumbers = useMemo(() => {
    const pages = [];
    const maxButtons = 5;
    let start = Math.max(1, cxcPage - 2);
    let end = Math.min(totalCxcPages, start + maxButtons - 1);

    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [cxcPage, totalCxcPages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'var(--bg-banner)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #10b981, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)'
          }}>
            <DollarSign size={28} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Cobros & Finanzas Corporativas
              </h2>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                Sección 13 & 14
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Distribución de pagos multi-factura, tabla de antigüedad (0-30 a +120 días), cuentas por pagar y control de egresos
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {activeTab === 'cxp' ? (
            <button
              onClick={() => handleOpenPaySupplier(null)}
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', gap: '6px' }}
            >
              <HandCoins size={16} />
              <span>Registrar Pago a Proveedor</span>
            </button>
          ) : activeTab === 'expenses' ? (
            <button
              onClick={() => setShowExpenseModal(true)}
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', gap: '6px' }}
            >
              <Plus size={16} />
              <span>Registrar Gasto Operativo</span>
            </button>
          ) : (
            <button
              onClick={() => handleOpenMultiPay(null)}
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', gap: '6px' }}
            >
              <HandCoins size={16} />
              <span>Registrar Cobro Multi-Factura</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('cxc')}
          className={`btn btn-sm ${activeTab === 'cxc' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Clock size={15} />
          <span>Cuentas por Cobrar (Facturas)</span>
        </button>
        <button
          onClick={() => setActiveTab('aging')}
          className={`btn btn-sm ${activeTab === 'aging' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <AlertCircle size={15} />
          <span>Antigüedad de Saldos (Semáforo 0-120+)</span>
        </button>
        <button
          onClick={() => setActiveTab('cxp')}
          className={`btn btn-sm ${activeTab === 'cxp' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <CreditCard size={15} />
          <span>Cuentas por Pagar (CxP Proveedores)</span>
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`btn btn-sm ${activeTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Receipt size={15} />
          <span>Control de Gastos Operativos</span>
        </button>
      </div>

      {/* TAB 1: CXC FACTURAS */}
      {activeTab === 'cxc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div
              className="card"
              onClick={() => setCxcStatusFilter('all')}
              style={{
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderColor: cxcStatusFilter === 'all' ? '#3b82f6' : 'var(--border-color)',
                background: cxcStatusFilter === 'all' ? 'rgba(59, 130, 246, 0.08)' : undefined,
                boxShadow: cxcStatusFilter === 'all' ? '0 0 0 1px #3b82f6' : 'none'
              }}
              title="Click para ver todas las facturas"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Cartera Total CxC</span>
                  <h4 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
                    RD$ {cxcTotals.totalBal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </h4>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {cxcTotals.totalCount} facturas pendientes
                  </span>
                </div>
                <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '10px' }}>
                  <Clock size={18} color="#3b82f6" />
                </div>
              </div>
            </div>

            <div
              className="card"
              onClick={() => setCxcStatusFilter(cxcStatusFilter === 'overdue' ? 'all' : 'overdue')}
              style={{
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderColor: cxcStatusFilter === 'overdue' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)',
                background: cxcStatusFilter === 'overdue' ? 'rgba(239, 68, 68, 0.12)' : undefined,
                boxShadow: cxcStatusFilter === 'overdue' ? '0 0 0 1px #ef4444' : 'none'
              }}
              title="Click para filtrar solo facturas vencidas en mora"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#ef4444', textTransform: 'uppercase', fontWeight: 600 }}>Cartera en Mora</span>
                  <h4 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                    RD$ {cxcTotals.overdueBal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </h4>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {cxcTotals.overdueCount} facturas vencidas {cxcStatusFilter === 'overdue' ? '● Filtro activo' : ''}
                  </span>
                </div>
                <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '10px' }}>
                  <AlertTriangle size={18} color="#ef4444" />
                </div>
              </div>
            </div>

            <div
              className="card"
              onClick={() => setCxcStatusFilter(cxcStatusFilter === 'current' ? 'all' : 'current')}
              style={{
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderColor: cxcStatusFilter === 'current' ? '#10b981' : 'rgba(16, 185, 129, 0.3)',
                background: cxcStatusFilter === 'current' ? 'rgba(16, 185, 129, 0.12)' : undefined,
                boxShadow: cxcStatusFilter === 'current' ? '0 0 0 1px #10b981' : 'none'
              }}
              title="Click para filtrar solo facturas al día"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#10b981', textTransform: 'uppercase', fontWeight: 600 }}>Cartera al Día</span>
                  <h4 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                    RD$ {cxcTotals.currentBal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </h4>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {cxcTotals.currentCount} facturas vigentes {cxcStatusFilter === 'current' ? '● Filtro activo' : ''}
                  </span>
                </div>
                <div style={{ padding: '8px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '10px' }}>
                  <CheckCircle2 size={18} color="#10b981" />
                </div>
              </div>
            </div>
          </div>

          {/* Controls & Filter Toolbar */}
          <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
              {/* Search Box */}
              <div style={{ position: 'relative', minWidth: '260px', flex: 1 }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="input-control"
                  placeholder="Buscar por Factura, NCF o Cliente..."
                  value={cxcSearch}
                  onChange={(e) => setCxcSearch(e.target.value)}
                  style={{ paddingLeft: '32px', height: '36px', fontSize: '0.8rem', width: '100%' }}
                />
              </div>

              {/* Salesperson Filter */}
              {uniqueSalespeople.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Vendedor:</span>
                  <select
                    className="select-control"
                    value={cxcSalespersonFilter}
                    onChange={(e) => setCxcSalespersonFilter(e.target.value)}
                    style={{ height: '36px', fontSize: '0.8rem', minWidth: '160px', padding: '0 8px' }}
                  >
                    <option value="">Todos los Vendedores</option>
                    {uniqueSalespeople.map(sp => (
                      <option key={sp} value={sp}>{sp}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quick Status Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginRight: '2px' }}>Estado:</span>
              <button
                onClick={() => setCxcStatusFilter('all')}
                className={`btn btn-sm ${cxcStatusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '20px' }}
              >
                Todas ({receivables.length})
              </button>
              <button
                onClick={() => setCxcStatusFilter('current')}
                className={`btn btn-sm ${cxcStatusFilter === 'current' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderRadius: '20px',
                  borderColor: cxcStatusFilter === 'current' ? '#10b981' : undefined,
                  background: cxcStatusFilter === 'current' ? '#10b981' : undefined,
                  color: cxcStatusFilter === 'current' ? '#fff' : '#10b981'
                }}
              >
                Al Día ({cxcTotals.currentCount})
              </button>
              <button
                onClick={() => setCxcStatusFilter('overdue')}
                className={`btn btn-sm ${cxcStatusFilter === 'overdue' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderRadius: '20px',
                  borderColor: cxcStatusFilter === 'overdue' ? '#ef4444' : undefined,
                  background: cxcStatusFilter === 'overdue' ? '#ef4444' : undefined,
                  color: cxcStatusFilter === 'overdue' ? '#fff' : '#ef4444'
                }}
              >
                En Mora ({cxcTotals.overdueCount})
              </button>
              <button
                onClick={() => setCxcStatusFilter('critical')}
                className={`btn btn-sm ${cxcStatusFilter === 'critical' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderRadius: '20px',
                  borderColor: cxcStatusFilter === 'critical' ? '#f59e0b' : undefined,
                  background: cxcStatusFilter === 'critical' ? '#f59e0b' : undefined,
                  color: cxcStatusFilter === 'critical' ? '#fff' : '#f59e0b'
                }}
              >
                +60d ({receivables.filter(r => (Number(r.days_overdue) || 0) > 60).length})
              </button>

              {(cxcSearch || cxcStatusFilter !== 'all' || cxcSalespersonFilter) && (
                <button
                  onClick={() => {
                    setCxcSearch('');
                    setCxcStatusFilter('all');
                    setCxcSalespersonFilter('');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '20px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  title="Restablecer filtros"
                >
                  <RotateCcw size={12} style={{ marginRight: '4px' }} />
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Receivables Table */}
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Factura / NCF</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Fecha Emisión</th>
                  <th>Vencimiento</th>
                  <th>Monto Total</th>
                  <th>Balance Deudor</th>
                  <th>Días Atraso</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>Cargando cuentas por cobrar...</td></tr>
                ) : paginatedReceivables.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No se encontraron facturas con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  paginatedReceivables.map(r => {
                    const isOverdue = Number(r.days_overdue) > 0;
                    return (
                      <tr key={r.id} style={{ background: isOverdue ? 'rgba(239, 68, 68, 0.04)' : 'transparent' }}>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{r.invoice_number || `FAC-${r.sale_id}`}</span>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.ncf}</span>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.customer_name}</td>
                        <td style={{ color: '#60a5fa', fontSize: '0.8rem' }}>{r.salesperson_name || 'Carlos Mendoza'}</td>
                        <td>{formatFinanceDate(r.issue_date)}</td>
                        <td style={{ color: isOverdue ? 'var(--danger)' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>{formatFinanceDate(r.due_date)}</td>
                        <td>RD$ {Number(r.amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                        <td style={{ fontWeight: 800, color: '#38bdf8' }}>
                          RD$ {Number(r.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span className={`badge ${isOverdue ? 'badge-danger' : 'badge-success'}`}>
                            {isOverdue ? `${r.days_overdue} días mora` : 'Al día'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => {
                              const foundCust = customers.find(c => c.id === r.customer_id);
                              if (foundCust) handleOpenMultiPay(foundCust);
                            }}
                            className="btn btn-primary btn-sm"
                          >
                            <HandCoins size={14} />
                            <span>Cobrar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredReceivables.length > 0 && (
            <div
              className="card"
              style={{
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: '4px'
              }}
            >
              {/* Rows Per Page */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mostrar</span>
                <select
                  className="select-control"
                  value={cxcPageSize}
                  onChange={(e) => {
                    setCxcPageSize(Number(e.target.value));
                    setCxcPage(1);
                  }}
                  style={{ width: '80px', height: '32px', fontSize: '0.8rem', padding: '0 8px' }}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>por página</span>
              </div>

              {/* Counter */}
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Mostrando <strong style={{ color: 'var(--text-primary)' }}>{(cxcPage - 1) * cxcPageSize + 1}</strong> - <strong style={{ color: 'var(--text-primary)' }}>{Math.min(cxcPage * cxcPageSize, filteredReceivables.length)}</strong> de <strong style={{ color: 'var(--text-primary)' }}>{filteredReceivables.length}</strong> facturas por cobrar
                {(cxcSearch || cxcStatusFilter !== 'all' || cxcSalespersonFilter) && (
                  <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>(filtradas)</span>
                )}
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => setCxcPage(1)}
                  disabled={cxcPage <= 1}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Primera página"
                >
                  <ChevronsLeft size={14} />
                </button>

                <button
                  onClick={() => setCxcPage(p => Math.max(1, p - 1))}
                  disabled={cxcPage <= 1}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Página anterior"
                >
                  <ChevronLeft size={14} />
                </button>

                {cxcPageNumbers.map(p => (
                  <button
                    key={p}
                    onClick={() => setCxcPage(p)}
                    style={{
                      minWidth: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: p === cxcPage ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                      background: p === cxcPage ? '#3b82f6' : 'var(--bg-subtle)',
                      color: p === cxcPage ? '#ffffff' : 'var(--text-primary)',
                      fontWeight: p === cxcPage ? 700 : 500,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {p}
                  </button>
                ))}

                <button
                  onClick={() => setCxcPage(p => Math.min(totalCxcPages, p + 1))}
                  disabled={cxcPage >= totalCxcPages}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Página siguiente"
                >
                  <ChevronRight size={14} />
                </button>

                <button
                  onClick={() => setCxcPage(totalCxcPages)}
                  disabled={cxcPage >= totalCxcPages}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Última página"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ANTIGÜEDAD DE SALDOS AGRUPADA (SECTION #14) */}
      {activeTab === 'aging' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Semaphores Totals Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
            <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Cartera</span>
              <p style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.grand_total || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>0-30 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_0_30 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(59, 130, 246, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6' }}>31-60 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#3b82f6', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_31_60 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b' }}>61-90 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_61_90 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(234, 88, 12, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ea580c', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ea580c' }}>91-120 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ea580c', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_91_120 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444' }}>+120 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_over_120 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
          </div>

          {/* Grouped Table */}
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>0-30 Días</th>
                  <th>31-60 Días</th>
                  <th>61-90 Días</th>
                  <th>91-120 Días</th>
                  <th>+120 Días</th>
                  <th>Total Deuda</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                      Cargando matriz de antigüedad de saldos...
                    </td>
                  </tr>
                ) : (!agingData?.customers?.length && !agingData?.rows?.length) ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No hay clientes con saldos o cuentas por cobrar pendientes.
                    </td>
                  </tr>
                ) : (
                  (agingData?.customers || agingData?.rows || []).map(c => (
                    <tr key={c.customer_id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.customer_name}</div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{c.code}</span>
                      </td>
                      <td style={{ color: '#60a5fa', fontSize: '0.8rem' }}>{c.salesperson_name}</td>
                      <td style={{ color: c.days_0_30 > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: c.days_0_30 > 0 ? 600 : 400 }}>
                        RD$ {Number(c.days_0_30).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: c.days_31_60 > 0 ? '#3b82f6' : 'var(--text-muted)', fontWeight: c.days_31_60 > 0 ? 600 : 400 }}>
                        RD$ {Number(c.days_31_60).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: c.days_61_90 > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: c.days_61_90 > 0 ? 600 : 400 }}>
                        RD$ {Number(c.days_61_90).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: c.days_91_120 > 0 ? '#ea580c' : 'var(--text-muted)', fontWeight: c.days_91_120 > 0 ? 600 : 400 }}>
                        RD$ {Number(c.days_91_120).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: c.days_over_120 > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: c.days_over_120 > 0 ? 800 : 400 }}>
                        RD$ {Number(c.days_over_120).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontWeight: 900, color: '#38bdf8' }}>
                        RD$ {Number(c.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <button
                          onClick={() => setDrilldownCustomer(c)}
                          className="btn btn-secondary btn-sm"
                        >
                          Ver {c.invoices?.length || 0} Facturas
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CXP PROVEEDORES */}
      {activeTab === 'cxp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Deuda a Proveedores</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
                RD$ {payables.reduce((acc, p) => acc + Number(p.balance || 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{payables.filter(p => Number(p.balance) > 0).length} factura(s) exigibles</span>
            </div>

            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #dc2626' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Deuda Vencida (En Mora)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                RD$ {payables.filter(p => p.status === 'overdue' || Number(p.days_overdue || 0) > 0).reduce((acc, p) => acc + Number(p.balance || 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Requiere pago inmediato</span>
            </div>

            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Al Día / Por Vencer</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                RD$ {payables.filter(p => p.status !== 'overdue' && Number(p.days_overdue || 0) <= 0).reduce((acc, p) => acc + Number(p.balance || 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Dentro del plazo de crédito acordado</span>
            </div>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>No. Factura Proveedor</th>
                  <th>Proveedor</th>
                  <th>Fecha Emisión</th>
                  <th>Vencimiento</th>
                  <th style={{ textAlign: 'right' }}>Total Facturado</th>
                  <th style={{ textAlign: 'right' }}>Saldo Pendiente</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Cargando cuentas por pagar...</td></tr>
                ) : payables.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay facturas de compras pendientes.</td></tr>
                ) : (
                  payables.map(p => {
                    const isOverdue = p.status === 'overdue' || Number(p.days_overdue || 0) > 0;
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                          <div>{p.document_number || p.invoice_number || `COMP-${p.purchase_id}`}</div>
                          {p.purchase_order_number && (
                            <span className="badge" style={{ fontSize: '0.68rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '1px 6px', marginTop: '3px', display: 'inline-block', fontWeight: 600 }}>
                              OC: {p.purchase_order_number}
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.supplier_name}</div>
                          {p.supplier_tax_id && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>RNC: {p.supplier_tax_id}</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{formatFinanceDate(p.issue_date)}</td>
                        <td style={{ fontSize: '0.8rem' }}>{formatFinanceDate(p.due_date)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          RD$ {Number(p.amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
                          RD$ {Number(p.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          {isOverdue ? (
                            <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              Vencida {Number(p.days_overdue) > 0 ? `(${p.days_overdue} d)` : ''}
                            </span>
                          ) : (
                            <span className="badge badge-warning">Al Día</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenPaySupplier(p)}
                            className="btn btn-primary btn-sm"
                            style={{ padding: '0 10px', height: '28px', fontSize: '0.78rem', gap: '4px' }}
                          >
                            <HandCoins size={13} />
                            <span>Pagar / Abonar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: GASTOS */}
      {activeTab === 'expenses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters & Actions Toolbar */}
          <div className="card" style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="input-control"
                  placeholder="Buscar por beneficiario, notas..."
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  style={{ paddingLeft: '36px', height: '38px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Categoría:</span>
                <select
                  className="select-control"
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  style={{ width: '200px', height: '38px' }}
                >
                  <option value="">Todas</option>
                  {expenseCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Estado:</span>
                <select
                  className="select-control"
                  value={expenseStatusFilter}
                  onChange={(e) => setExpenseStatusFilter(e.target.value)}
                  style={{ width: '160px', height: '38px' }}
                >
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="cancelled">Anulados</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Desde:</span>
                <input
                  type="date"
                  className="input-control"
                  value={expenseDateFrom}
                  onChange={(e) => setExpenseDateFrom(e.target.value)}
                  style={{ width: '160px', height: '38px', fontSize: '0.8rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Hasta:</span>
                <input
                  type="date"
                  className="input-control"
                  value={expenseDateTo}
                  onChange={(e) => setExpenseDateTo(e.target.value)}
                  style={{ width: '160px', height: '38px', fontSize: '0.8rem' }}
                />
              </div>
              <button
                onClick={() => {
                  setExpenseSearch('');
                  setExpenseCategoryFilter('');
                  setExpenseDateFrom('');
                  setExpenseDateTo('');
                  setExpenseStatusFilter('all');
                  setExpensePage(1);
                  loadExpenses();
                }}
                className="btn btn-secondary btn-sm"
                style={{ height: '38px' }}
              >
                <X size={14} />
                <span>Limpiar</span>
              </button>
              <button
                onClick={handleExportExpensesCSV}
                className="btn btn-secondary"
                style={{ height: '38px', gap: '6px' }}
              >
                <Download size={16} />
                <span>Exportar CSV</span>
              </button>
              <button
                onClick={() => setShowExpenseModal(true)}
                className="btn btn-primary"
                style={{ height: '38px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}
              >
                <Plus size={16} />
                <span>Registrar Gasto</span>
              </button>
            </div>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Beneficiario</th>
                  <th>Monto</th>
                  <th>Método</th>
                  <th>Comprobante</th>
                  <th>Estado</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Cargando gastos...</td></tr>
                ) : expenses.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay gastos registrados.</td></tr>
                ) : (
                  expenses.map(e => (
                    <tr key={e.id}>
                      <td>{e.expense_date}</td>
                      <td>
                        <span className="badge" style={{ background: 'var(--bg-subtle-2)', color: '#94a3b8' }}>
                          {e.category_name}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.beneficiary || '-'}</td>
                      <td style={{ fontWeight: 800, color: '#f59e0b' }}>RD$ {Number(e.amount).toFixed(2)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{e.payment_method}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{e.voucher_number || '-'}</td>
                      <td>
                        <span className={`badge ${e.status === 'cancelled' ? 'badge-danger' : 'badge-success'}`}>
                          {e.status === 'cancelled' ? 'Anulado' : 'Activo'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{e.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {expenses.length > 0 && (
            <div className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mostrar</span>
                <select
                  className="select-control"
                  value={expensePageSize}
                  onChange={(e) => {
                    setExpensePageSize(Number(e.target.value));
                    setExpensePage(1);
                    loadExpenses();
                  }}
                  style={{ width: '80px', height: '32px', fontSize: '0.8rem', padding: '0 8px' }}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>por página</span>
              </div>

              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Mostrando <strong style={{ color: 'var(--text-primary)' }}>{(expensePage - 1) * expensePageSize + 1}</strong> - <strong style={{ color: 'var(--text-primary)' }}>{Math.min(expensePage * expensePageSize, expenses.length)}</strong> de <strong style={{ color: 'var(--text-primary)' }}>{expenses.length}</strong> gastos
                {(expenseSearch || expenseCategoryFilter || expenseStatusFilter !== 'all' || expenseDateFrom || expenseDateTo) && (
                  <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>(filtrados)</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => setExpensePage(1)}
                  disabled={expensePage <= 1}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Primera página"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  onClick={() => setExpensePage(p => Math.max(1, p - 1))}
                  disabled={expensePage <= 1}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Página anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setExpensePage(p => Math.min(Math.ceil(expenses.length / expensePageSize), p + 1))}
                  disabled={expensePage >= Math.ceil(expenses.length / expensePageSize)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Página siguiente"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setExpensePage(Math.ceil(expenses.length / expensePageSize))}
                  disabled={expensePage >= Math.ceil(expenses.length / expensePageSize)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Última página"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MULTI-INVOICE PAYMENT MODAL (SECTION #13) */}
      {showMultiPayModal && (
        <div className="modal-overlay" onClick={() => setShowMultiPayModal(false)}>
          <div className="modal-content modal-content-xl" style={{ padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Cobro & Distribución Multi-Factura
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {selectedCustomerForPay ? (
                    <>Cliente seleccionado: <strong style={{ color: '#10b981' }}>{selectedCustomerForPay.company_name || `${selectedCustomerForPay.first_name} ${selectedCustomerForPay.last_name}`}</strong></>
                  ) : (
                    'Selecciona un cliente para cargar y distribuir pagos entre sus facturas pendientes.'
                  )}
                </p>
              </div>
              <button onClick={() => setShowMultiPayModal(false)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitMultiPay} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Customer Selector */}
              <div style={{ background: 'var(--bg-subtle-2)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <label className="label-control" style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Seleccionar Cliente a Cobrar *</span>
                  {selectedCustomerForPay && (
                    <span style={{ color: '#38bdf8' }}>
                      Balance Pendiente: RD$ {Number(selectedCustomerForPay.current_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </label>
                <select
                  className="select-control"
                  value={selectedCustomerForPay ? selectedCustomerForPay.id : ''}
                  onChange={(e) => {
                    const custId = e.target.value;
                    const cust = customers.find(c => String(c.id) === String(custId));
                    setSelectedCustomerForPay(cust || null);
                    setAllocations({});
                    if (cust) {
                      loadCustomerInvoices(cust.id);
                    } else {
                      setCustomerInvoices([]);
                    }
                  }}
                  style={{ height: '42px', fontWeight: 600 }}
                  required
                >
                  <option value="">-- Selecciona un Cliente con Deuda --</option>
                  {customers.map(c => {
                    const name = c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.identification_number;
                    const bal = Number(c.current_balance || 0);
                    return (
                      <option key={c.id} value={c.id}>
                        {name} ({c.identification_number || 'S/N'}) {bal > 0 ? `— Deuda: RD$ ${bal.toFixed(2)}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Payment Info Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'var(--bg-subtle)', padding: '16px', borderRadius: '12px' }}>
                <div>
                  <label className="label-control">Monto Total a Cobrar (RD$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="input-control"
                    placeholder="0.00"
                    value={paymentTotalAmount}
                    onChange={(e) => setPaymentTotalAmount(e.target.value)}
                    style={{ fontSize: '1.2rem', fontWeight: 800 }}
                  />
                </div>

                <div>
                  <label className="label-control">Método de Pago</label>
                  <select
                    className="select-control"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ height: '42px' }}
                  >
                    <option value="transfer">Transferencia Bancaria</option>
                    <option value="cash">Efectivo (Caja)</option>
                    <option value="check">Cheque</option>
                    <option value="card">Tarjeta de Crédito</option>
                  </select>
                </div>

                <div>
                  <label className="label-control">No. Referencia / Comprobante</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ej: TRANS-19283"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    style={{ height: '42px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={!selectedCustomerForPay || customerInvoices.length === 0}
                    onClick={handleAutoDistributeFIFO}
                    className="btn btn-secondary"
                    style={{ height: '42px', width: '100%', justifyContent: 'center' }}
                  >
                    <ArrowRight size={14} />
                    <span>Distribuir FIFO Automático</span>
                  </button>
                </div>
              </div>

              {/* Invoices List to Allocate */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Facturas Pendientes de Cobro ({customerInvoices.length})
                </h4>
                <div className="table-container" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Factura</th>
                        <th>Emisión</th>
                        <th>Vencimiento</th>
                        <th>Total</th>
                        <th>Saldo Pendiente</th>
                        <th style={{ width: '180px' }}>Monto a Aplicar (RD$)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedCustomerForPay ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Selecciona un cliente arriba para ver sus facturas pendientes.</td></tr>
                      ) : customerInvoices.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>El cliente no tiene facturas pendientes de cobro.</td></tr>
                      ) : (
                        customerInvoices.map(inv => (
                          <tr key={inv.id}>
                            <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number || inv.sale_number}</td>
                            <td>{inv.issue_date}</td>
                            <td>{inv.due_date}</td>
                            <td>RD$ {Number(inv.amount).toFixed(2)}</td>
                            <td style={{ fontWeight: 800, color: '#38bdf8' }}>RD$ {Number(inv.balance).toFixed(2)}</td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                max={inv.balance}
                                placeholder="0.00"
                                className="input-control"
                                value={allocations[inv.id] || ''}
                                onChange={(e) => handleManualAllocationChange(inv.id, e.target.value)}
                                style={{ height: '32px', textAlign: 'right', fontWeight: 700 }}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <button type="button" onClick={() => setShowMultiPayModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment || !selectedCustomerForPay || customerInvoices.length === 0}
                  className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '8px 24px' }}
                >
                  {submittingPayment ? 'Procesando...' : 'Confirmar Cobro & Generar Recibo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRILLDOWN MODAL FOR AGING TABLE */}
      {drilldownCustomer && (
        <div className="modal-overlay" onClick={() => setDrilldownCustomer(null)}>
          <div className="modal-content modal-content-xl" style={{ padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Detalle de Facturas: {drilldownCustomer.customer_name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Vendedor: {drilldownCustomer.salesperson_name} • Balance Total: RD$ {Number(drilldownCustomer.total).toFixed(2)}
                </p>
              </div>
              <button onClick={() => setDrilldownCustomer(null)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>NCF</th>
                    <th>Emisión</th>
                    <th>Vencimiento</th>
                    <th>Monto Total</th>
                    <th>Balance Pendiente</th>
                    <th>Días Atraso</th>
                    <th>Tramo de Antigüedad</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownCustomer.invoices?.map(inv => (
                    <tr key={inv.receivable_id}>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{inv.ncf}</td>
                      <td>{inv.issue_date}</td>
                      <td>{inv.due_date}</td>
                      <td>RD$ {Number(inv.amount).toFixed(2)}</td>
                      <td style={{ fontWeight: 800, color: '#38bdf8' }}>RD$ {Number(inv.balance).toFixed(2)}</td>
                      <td>{inv.days_overdue} días</td>
                      <td>
                        <span className="badge badge-warning">{inv.bracket} Días</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setDrilldownCustomer(null)} className="btn btn-secondary">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT RECEIPT MODAL */}
      {completedPaymentReceipt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px', padding: '24px' }}>
            <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <CheckCircle2 size={26} color="var(--success)" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Recibo Oficial de Cobro</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                No. <strong style={{ color: 'var(--text-primary)' }}>{completedPaymentReceipt.receipt_number}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Cliente:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{completedPaymentReceipt.customer_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fecha:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{completedPaymentReceipt.date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Método:</span>
                <span style={{ textTransform: 'capitalize', color: '#60a5fa' }}>{completedPaymentReceipt.payment_method}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Total Cobrado:</span>
                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--success)' }}>
                  RD$ {Number(completedPaymentReceipt.amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => window.print()} className="btn btn-secondary" style={{ flex: 1 }}>
                <Printer size={16} />
                <span>Imprimir</span>
              </button>
              <button onClick={() => setCompletedPaymentReceipt(null)} className="btn btn-primary" style={{ flex: 1 }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Registrar Gasto</h3>
            <form onSubmit={handleCreateExpense} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="label-control">Categoría de Gasto *</label>
                <select
                  required
                  className="select-control"
                  value={expenseData.category_id}
                  onChange={(e) => setExpenseData({ ...expenseData, category_id: e.target.value })}
                >
                  <option value="">Seleccionar Categoría...</option>
                  {expenseCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-control">Monto (RD$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-control"
                  placeholder="0.00"
                  value={expenseData.amount}
                  onChange={(e) => setExpenseData({ ...expenseData, amount: e.target.value })}
                />
              </div>

              <div>
                <label className="label-control">Fecha del Gasto *</label>
                <input
                  type="date"
                  required
                  className="input-control"
                  value={expenseData.expense_date}
                  onChange={(e) => setExpenseData({ ...expenseData, expense_date: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Método de Pago</label>
                  <select
                    className="select-control"
                    value={expenseData.payment_method}
                    onChange={(e) => setExpenseData({ ...expenseData, payment_method: e.target.value })}
                  >
                    <option value="cash">Efectivo (Caja Chica)</option>
                    <option value="transfer">Transferencia</option>
                    <option value="card">Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="label-control">Beneficiario</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Proveedor / Empleado"
                    value={expenseData.beneficiary}
                    onChange={(e) => setExpenseData({ ...expenseData, beneficiary: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label-control">No. Comprobante / Factura</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="B11-..."
                  value={expenseData.voucher_number}
                  onChange={(e) => setExpenseData({ ...expenseData, voucher_number: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowExpenseModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAY SUPPLIER MODAL (CXP) */}
      {showPaySupplierModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '92%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(2, 132, 199, 0.15)', color: '#0284c7', padding: '8px', borderRadius: '10px' }}>
                  <HandCoins size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Registrar Pago a Proveedor
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Abono o liquidación de factura de compra a crédito
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowPaySupplierModal(false)} className="btn btn-ghost btn-sm" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProcessPaySupplier} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Invoice Selector */}
              <div>
                <label className="label-control">Factura de Compra / Proveedor *</label>
                <select
                  required
                  className="select-control"
                  value={selectedPayable?.id || ''}
                  onChange={(e) => {
                    const payId = Number(e.target.value);
                    const found = payables.find(p => p.id === payId);
                    if (found) {
                      setSelectedPayable(found);
                      setPaySupplierAmount(String(found.balance || ''));
                    }
                  }}
                >
                  <option value="">Seleccione factura...</option>
                  {payables.filter(p => Number(p.balance) > 0).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.document_number || p.invoice_number} — {p.supplier_name} (Pendiente: RD$ {Number(p.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Invoice Details Pill */}
              {selectedPayable && (
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Proveedor:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{selectedPayable.supplier_name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Fecha de Vencimiento:</span>
                    <span style={{ color: selectedPayable.status === 'overdue' ? '#ef4444' : 'var(--text-primary)', fontWeight: 600 }}>
                      {formatFinanceDate(selectedPayable.due_date)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Saldo Pendiente:</span>
                    <span style={{ color: '#f59e0b', fontWeight: 900, fontSize: '0.95rem' }}>
                      RD$ {Number(selectedPayable.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* Amount to Pay */}
              <div>
                <label className="label-control">Monto a Pagar (RD$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedPayable ? Number(selectedPayable.balance) : undefined}
                  required
                  className="input-control"
                  placeholder="0.00"
                  value={paySupplierAmount}
                  onChange={(e) => setPaySupplierAmount(e.target.value)}
                  style={{ fontWeight: 800, fontSize: '1.05rem', color: '#10b981' }}
                />
              </div>

              {/* Method and Reference */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Forma de Pago</label>
                  <select
                    className="select-control"
                    value={paySupplierMethod}
                    onChange={(e) => setPaySupplierMethod(e.target.value)}
                  >
                    <option value="transfer">Transferencia Bancaria</option>
                    <option value="cash">Efectivo</option>
                    <option value="check">Cheque Comercial</option>
                  </select>
                </div>
                <div>
                  <label className="label-control">No. Referencia / Comprobante</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ej: TRANSF-0912"
                    value={paySupplierRef}
                    onChange={(e) => setPaySupplierRef(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label-control">Notas / Observaciones</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Detalle o justificación del pago al proveedor"
                  value={paySupplierNotes}
                  onChange={(e) => setPaySupplierNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowPaySupplierModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingPaySupplier || !selectedPayable}
                  className="btn btn-primary"
                  style={{ flex: 1, background: 'linear-gradient(135deg, #0284c7, #0369a1)', fontWeight: 700 }}
                >
                  {submittingPaySupplier ? 'Aplicando Pago...' : 'Aplicar Pago a Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
