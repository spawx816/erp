import React, { useState, useEffect } from 'react';
import {
  TrendingUp, ShoppingCart, DollarSign, AlertCircle,
  Clock, ArrowUpRight, ArrowDownRight, Package, Users,
  Building2, CheckCircle2, ChevronRight, RefreshCw,
  Wallet, ShieldAlert, Layers, Target, BarChart3,
  Calendar, FileText, Activity
} from 'lucide-react';
import api from '../services/api';

export default function DashboardPage({ activeBranch, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month'); // 'today' | 'week' | 'month' | 'year'

  useEffect(() => {
    loadDashboard();
  }, [activeBranch, period]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/dashboard', {
        branch_id: activeBranch?.id,
        period
      });
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid var(--accent-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};
  const alerts = data?.alerts || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner & Quick Controls */}
      <div style={{
        background: 'var(--bg-banner)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Panel de Control Ejecutivo Nexus ERP
            </h2>
            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              En Tiempo Real
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {activeBranch ? activeBranch.name : 'Todas las Sucursales'} • República Dominicana (RD$) • DGII NCF
          </p>
        </div>

        {/* Period Buttons & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-main)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'week', label: 'Esta Semana' },
              { id: 'month', label: 'Este Mes' },
              { id: 'year', label: 'Este Año' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`btn btn-sm ${period === p.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '8px', fontSize: '0.75rem', padding: '5px 12px' }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button onClick={() => onNavigate('pos')} className="btn btn-primary">
            <ShoppingCart size={16} />
            <span>Facturación POS</span>
          </button>
        </div>
      </div>

      {/* ALERT BANNERS (Clickable) */}
      {alerts && alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {alerts.map(alt => {
            const isCritical = alt.severity === 'critical';
            const isWarning = alt.severity === 'warning';
            const bg = isCritical ? 'rgba(239, 68, 68, 0.12)' : isWarning ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)';
            const border = isCritical ? 'rgba(239, 68, 68, 0.3)' : isWarning ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)';
            const color = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#3b82f6';

            return (
              <div
                key={alt.id}
                onClick={() => {
                  if (alt.link === 'cxc' || alt.link === 'collections') onNavigate('cxc-dashboard');
                  else if (alt.link === 'credit-risk' || alt.link === 'credit_risk' || alt.link === 'customers') onNavigate('credit-risk');
                  else if (alt.link === 'inventory' || alt.link === 'inventory-analysis' || alt.link === 'products') onNavigate('inventory');
                  else if (alt.link === 'fixed_expenses' || alt.link === 'fixed-expenses' || alt.link === 'expenses') onNavigate('fixed-expenses');
                  else if (alt.link) onNavigate(alt.link);
                  else onNavigate('dashboard');
                }}
                style={{
                  background: bg,
                  border: `1px solid ${border}`,
                  borderRadius: '12px',
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(4px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ShieldAlert size={20} color={color} />
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{alt.title}</span>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{alt.description}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color, fontWeight: 700 }}>
                  <span>Resolver</span>
                  <ChevronRight size={15} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 12 EXECUTIVE & OPERATIONAL KPIS */}
      <div>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          Indicadores Clave del Negocio (12 KPIs)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {/* KPI 1: Ventas Hoy */}
          <div className="card" onClick={() => onNavigate('sales')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Ventas Hoy</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                  RD$ {Number(kpis.sales_today || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: '#60a5fa', marginTop: '4px' }}>
                  {kpis.sales_today_count || 0} tickets facturados
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '10px' }}>
                <TrendingUp size={18} color="var(--accent-primary)" />
              </div>
            </div>
          </div>

          {/* KPI 2: Ventas del Mes */}
          <div className="card" onClick={() => onNavigate('sales')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Ventas del Mes</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                  RD$ {Number(kpis.sales_month || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--success)', marginTop: '4px' }}>
                  {kpis.sales_month_count || 0} facturas totales
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '10px' }}>
                <DollarSign size={18} color="var(--success)" />
              </div>
            </div>
          </div>

          {/* KPI 3: Cobros Hoy */}
          <div className="card" onClick={() => onNavigate('collections')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Cobrado Hoy</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--success)', marginTop: '4px' }}>
                  RD$ {Number(kpis.collected_today || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Ingresos en caja & bancos
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '10px' }}>
                <Wallet size={18} color="var(--success)" />
              </div>
            </div>
          </div>

          {/* KPI 4: Cobrado Mes */}
          <div className="card" onClick={() => onNavigate('collections')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Cobrado Mes</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                  RD$ {Number(kpis.collected_month || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Efectividad de cobranza
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(56, 189, 248, 0.15)', borderRadius: '10px' }}>
                <CheckCircle2 size={18} color="#38bdf8" />
              </div>
            </div>
          </div>

          {/* KPI 5: Cartera CxC Total */}
          <div className="card" onClick={() => onNavigate('cxc-dashboard')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Cartera CxC Total</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                  RD$ {Number(kpis.receivables_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {kpis.receivables_count || 0} facturas por cobrar
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '10px' }}>
                <Clock size={18} color="var(--warning)" />
              </div>
            </div>
          </div>

          {/* KPI 6: Facturas Vencidas */}
          <div className="card" onClick={() => onNavigate('cxc-dashboard')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Cartera Vencida</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: Number(kpis.receivables_overdue || 0) > 0 ? '#ef4444' : 'var(--text-primary)', marginTop: '4px' }}>
                  RD$ {Number(kpis.receivables_overdue || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '4px' }}>
                  {kpis.receivables_overdue_count || 0} facturas vencidas
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '10px' }}>
                <AlertCircle size={18} color="var(--danger)" />
              </div>
            </div>
          </div>

          {/* KPI 7: Valoración Inventario */}
          <div className="card" onClick={() => onNavigate('inventory')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Valor Inventario</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                  RD$ {Number(kpis.inventory_valuation || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Costo de reposición
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '10px' }}>
                <Package size={18} color="#a78bfa" />
              </div>
            </div>
          </div>

          {/* KPI 8: Gastos del Mes */}
          <div className="card" onClick={() => onNavigate('expenses')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Gastos Operativos</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                  RD$ {Number(kpis.expenses_month || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Caja chica & fijos
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '10px' }}>
                <Activity size={18} color="#f59e0b" />
              </div>
            </div>
          </div>

          {/* KPI 9: Ganancia Estimada */}
          <div className="card" onClick={() => onNavigate('reports')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Ganancia Neta Est.</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: Number(kpis.estimated_profit_month || 0) >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '4px' }}>
                  RD$ {Number(kpis.estimated_profit_month || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Margen bruto menos gastos
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '10px' }}>
                <ArrowUpRight size={18} color="var(--success)" />
              </div>
            </div>
          </div>

          {/* KPI 10: Facturas Pendientes */}
          <div className="card" onClick={() => onNavigate('sales')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Facturas Abiertas</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {kpis.pending_invoices_count || 0}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Pendientes de cobro
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '10px' }}>
                <FileText size={18} color="#60a5fa" />
              </div>
            </div>
          </div>

          {/* KPI 11: Clientes Activos */}
          <div className="card" onClick={() => onNavigate('customers')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Clientes Activos</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {kpis.active_customers_count || 0}
                </h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Cartera georreferenciada
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '10px' }}>
                <Users size={18} color="#60a5fa" />
              </div>
            </div>
          </div>

          {/* KPI 12: Quiebre de Stock */}
          <div className="card" onClick={() => onNavigate('inventory')} style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Alertas de Stock</span>
                <h4 style={{ fontSize: '1.45rem', fontWeight: 800, color: (kpis.stock_out || 0) > 0 ? 'var(--danger)' : 'var(--text-primary)', marginTop: '4px' }}>
                  {kpis.stock_out || 0} / {kpis.stock_low || 0}
                </h4>
                <p style={{ fontSize: '0.72rem', color: (kpis.stock_out || 0) > 0 ? 'var(--danger)' : 'var(--warning)', marginTop: '4px' }}>
                  Agotados / Stock Bajo
                </p>
              </div>
              <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '10px' }}>
                <AlertCircle size={18} color="var(--danger)" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 9 VISUAL CHARTS & ANALYTICS GRIDS */}
      <div>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          Visualizaciones Analíticas (9 Gráficos)
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
          {/* Chart 1: Ventas por Día del Mes */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>1. Facturación por Día del Mes</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Evolución diaria de ventas en RD$</p>
              </div>
              <BarChart3 size={18} color="#60a5fa" />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', height: '180px', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
              {charts.sales_by_day?.length > 0 ? (
                charts.sales_by_day.map((d, idx) => {
                  const maxVal = Math.max(...charts.sales_by_day.map(x => Number(x.total)), 50000);
                  const h = Math.max(10, (Number(d.total) / maxVal) * 100);
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {Number(d.total) > 0 ? `${(Number(d.total) / 1000).toFixed(0)}k` : ''}
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: `${h}%`,
                          background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                          borderRadius: '4px 4px 0 0'
                        }}
                      />
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>D{d.day}</span>
                    </div>
                  );
                })
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 'auto' }}>Sin transacciones en este período.</p>
              )}
            </div>
          </div>

          {/* Chart 2: Ventas vs Cobros vs Pendiente */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>2. Efectividad: Facturación vs Cobro</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Distribución del flujo de fondos mensual</p>
              </div>
              <Target size={18} color="#10b981" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
              {charts.sales_vs_collections?.map((item, idx) => {
                const totalBase = charts.sales_vs_collections[0]?.value || 1;
                const pct = totalBase > 0 ? Math.min(100, Math.round((item.value / totalBase) * 100)) : 0;

                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontWeight: 800, color: item.color }}>
                        RD$ {Number(item.value).toLocaleString('es-DO', { minimumFractionDigits: 2 })} ({pct}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '10px', background: 'var(--bg-card)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: '6px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 3: Antigüedad de Saldos CxC (Semáforo 0-30, 31-60, 61-90, 91-120, +120) */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>3. Antigüedad de Saldos CxC (Semáforo)</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Clasificación de riesgo de cartera por días vencidos</p>
              </div>
              <Clock size={18} color="#f59e0b" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', textAlign: 'center' }}>
              {[
                { label: '0-30 Días', key: 'bracket_0_30', color: '#10b981', desc: 'Corriente' },
                { label: '31-60 Días', key: 'bracket_31_60', color: '#3b82f6', desc: 'Atención' },
                { label: '61-90 Días', key: 'bracket_61_90', color: '#f59e0b', desc: 'Riesgo' },
                { label: '91-120 Días', key: 'bracket_91_120', color: '#ea580c', desc: 'Crítico' },
                { label: '+120 Días', key: 'bracket_120_plus', color: '#ef4444', desc: 'Legal' }
              ].map(b => {
                const amount = charts.cxc_aging ? Number(charts.cxc_aging[b.key] || 0) : 0;
                return (
                  <div key={b.key} style={{ padding: '12px 6px', background: 'var(--bg-card)', borderRadius: '10px', border: `1px solid ${b.color}40` }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: b.color, margin: '0 auto 6px', boxShadow: `0 0 8px ${b.color}` }} />
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{b.label}</span>
                    <p style={{ fontSize: '0.85rem', fontWeight: 800, color: b.color, marginTop: '4px' }}>
                      RD$ {(amount / 1000).toFixed(0)}k
                    </p>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{b.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 4: Ventas por Vendedor (Ranking) */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>4. Ranking de Fuerza de Ventas</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Desempeño mensual de vendedores</p>
              </div>
              <Users size={18} color="#a78bfa" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {charts.sales_by_salesperson?.map((sp, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--bg-subtle-2)', color: 'var(--text-primary)', fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      #{idx + 1}
                    </span>
                    <div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{sp.salesperson_name}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{sp.invoice_count} facturas</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#60a5fa' }}>
                    RD$ {Number(sp.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 5: Ventas por Categoría */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>5. Ventas por Categoría de Producto</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Líneas cosméticas, tintes y cuidado capilar</p>
              </div>
              <Layers size={18} color="#ec4899" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {charts.sales_by_category?.map((cat, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cat.category_name}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ec4899' }}>
                    RD$ {Number(cat.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 6: Gastos por Categoría */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>6. Gastos Operativos por Rubro</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Distribución de costos fijos y variables</p>
              </div>
              <Activity size={18} color="#f59e0b" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {charts.expenses_by_category?.map((exp, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{exp.name}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f59e0b' }}>
                    RD$ {Number(exp.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 7: Top 6 Productos Más Vendidos */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>7. Top Productos Líderes</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Artículos con mayor facturación</p>
              </div>
              <Package size={18} color="#38bdf8" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {charts.top_products?.map((prod, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>{prod.product_name}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{prod.units_sold} unidades</span>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8' }}>
                    RD$ {Number(prod.total_revenue).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 8: Top 6 Clientes por Compra */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>8. Top Clientes (Mayor Facturación)</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Salones y centros de estética destacados</p>
              </div>
              <Building2 size={18} color="#10b981" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {charts.top_customers?.map((cust, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>{cust.customer_name}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{cust.purchases_count} compras este mes</span>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--success)' }}>
                    RD$ {Number(cust.total_purchased).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
