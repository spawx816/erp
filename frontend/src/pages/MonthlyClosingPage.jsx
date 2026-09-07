import React, { useState, useEffect } from 'react';
import {
  Calculator, Calendar, CheckCircle2, TrendingUp,
  ArrowUpRight, ArrowDownRight, DollarSign, Lock,
  FileSpreadsheet, Printer, Layers, AlertCircle, ShieldCheck
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function MonthlyClosingPage() {
  const { addToast } = useToast();
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);

  const [closingData, setClosingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closingOfficial, setClosingOfficial] = useState(false);
  const [notes, setNotes] = useState('');

  const monthsList = [
    { num: 1, name: 'Enero' },
    { num: 2, name: 'Febrero' },
    { num: 3, name: 'Marzo' },
    { num: 4, name: 'Abril' },
    { num: 5, name: 'Mayo' },
    { num: 6, name: 'Junio' },
    { num: 7, name: 'Julio' },
    { num: 8, name: 'Agosto' },
    { num: 9, name: 'Septiembre' },
    { num: 10, name: 'Octubre' },
    { num: 11, name: 'Noviembre' },
    { num: 12, name: 'Diciembre' }
  ];

  useEffect(() => {
    loadClosing();
  }, [selectedYear, selectedMonth]);

  const loadClosing = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/monthly-closing', {
        year: selectedYear,
        month: selectedMonth
      });
      if (res.success) {
        setClosingData(res.data);
      }
    } catch (err) {
      console.error('Failed to load monthly closing:', err);
      addToast('Error cargando cierre mensual.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClosing = async () => {
    if (!window.confirm(`¿Confirmas que deseas cerrar y archivar oficialmente el período ${monthsList.find(m => m.num === selectedMonth)?.name} ${selectedYear}?`)) {
      return;
    }
    setClosingOfficial(true);
    try {
      const res = await api.post('/reports/monthly-closing', {
        year: selectedYear,
        month: selectedMonth,
        notes: notes || 'Cierre oficial auditado'
      });
      if (res.success) {
        addToast(res.message || 'Cierre mensual guardado oficialmente.', 'success');
        loadClosing();
      }
    } catch (err) {
      addToast(err.message || 'Error guardando cierre mensual.', 'error');
    } finally {
      setClosingOfficial(false);
    }
  };

  const pnl = closingData?.current_pnl || {};
  const isAlreadyClosed = closingData?.is_closed;

  // Variations vs prior month
  const salesVariation = pnl.prev_sales > 0
    ? (((pnl.total_sales - pnl.prev_sales) / pnl.prev_sales) * 100).toFixed(1)
    : 0;

  const profitVariation = pnl.prev_net_profit > 0
    ? (((pnl.net_profit - pnl.prev_net_profit) / pnl.prev_net_profit) * 100).toFixed(1)
    : 0;

  // Margin percentages
  const grossMarginPercent = pnl.net_sales > 0
    ? ((pnl.gross_profit / pnl.net_sales) * 100).toFixed(1)
    : 0;

  const netMarginPercent = pnl.net_sales > 0
    ? ((pnl.net_profit / pnl.net_sales) * 100).toFixed(1)
    : 0;

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
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.35)'
          }}>
            <Calculator size={28} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Cierre Mensual & Estado de Resultados (P&L)
              </h2>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                Sección 28
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Consolidación financiera automática: Ventas Netas, Costo de Mercancía (CMV), Ganancia Bruta, Gastos Operativos y Ganancia Neta
            </p>
          </div>
        </div>

        {/* Period Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            className="select-control"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            style={{ width: '140px', height: '40px', fontWeight: 600 }}
          >
            {monthsList.map(m => (
              <option key={m.num} value={m.num}>{m.name}</option>
            ))}
          </select>

          <select
            className="select-control"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            style={{ width: '100px', height: '40px', fontWeight: 600 }}
          >
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>

          <button onClick={() => window.print()} className="btn btn-secondary btn-sm">
            <Printer size={15} />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Closed Status Banner */}
      {isAlreadyClosed && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <ShieldCheck size={22} color="var(--success)" />
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Período Oficialmente Cerrado y Auditado
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Este período contable fue cerrado el {closingData.closing_record?.closed_at || 'recientemente'}. Las cifras están archivadas.
            </p>
          </div>
        </div>
      )}

      {/* P&L CARDS WATERFALL */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top 3 Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {/* Card 1: Ventas Netas */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    1. Ventas Netas (Sin ITBIS)
                  </span>
                  <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '6px' }}>
                    RD$ {Number(pnl.net_sales || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: Number(salesVariation) >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center' }}>
                      {Number(salesVariation) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {salesVariation}% vs mes anterior
                    </span>
                  </div>
                </div>
                <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '12px' }}>
                  <DollarSign size={24} color="var(--accent-primary)" />
                </div>
              </div>
            </div>

            {/* Card 2: Ganancia Bruta */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    2. Ganancia Bruta (Margen: {grossMarginPercent}%)
                  </span>
                  <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8', marginTop: '6px' }}>
                    RD$ {Number(pnl.gross_profit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    CMV Costo Vendido: RD$ {Number(pnl.cogs || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div style={{ padding: '12px', background: 'rgba(56, 189, 248, 0.15)', borderRadius: '12px' }}>
                  <TrendingUp size={24} color="#38bdf8" />
                </div>
              </div>
            </div>

            {/* Card 3: Ganancia Neta */}
            <div className="card" style={{ padding: '20px', background: 'var(--bg-card)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase' }}>
                    3. Ganancia Neta Real (Margen: {netMarginPercent}%)
                  </span>
                  <h3 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--success)', marginTop: '6px' }}>
                    RD$ {Number(pnl.net_profit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: Number(profitVariation) >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center' }}>
                      {Number(profitVariation) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {profitVariation}% vs mes anterior
                    </span>
                  </div>
                </div>
                <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '12px' }}>
                  <ShieldCheck size={26} color="var(--success)" />
                </div>
              </div>
            </div>
          </div>

          {/* DETAILED P&L STATEMENT TABLE */}
          <div className="card" style={{ padding: '24px' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              Desglose Detallado del Estado de Resultados (P&L)
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Row 1: Ventas Brutas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>(+) Facturación Total (Con ITBIS)</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  RD$ {Number(pnl.total_sales || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row 2: Descuentos */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>(-) Descuentos Comerciales Concedidos</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  RD$ {Number(pnl.discounts || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row 3: Ventas Netas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', borderLeft: '4px solid var(--accent-primary)' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>(=) VENTAS NETAS OPERATIVAS</span>
                <span style={{ fontWeight: 900, color: '#60a5fa', fontSize: '1.1rem' }}>
                  RD$ {Number(pnl.net_sales || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row 4: CMV */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                <span style={{ color: '#ef4444' }}>(-) Costo de Mercancía Vendida (CMV Costo Inventario)</span>
                <span style={{ fontWeight: 700, color: '#ef4444' }}>
                  - RD$ {Number(pnl.cogs || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row 5: Ganancia Bruta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '8px', borderLeft: '4px solid #38bdf8' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>(=) UTILIDAD BRUTA</span>
                <span style={{ fontWeight: 900, color: '#38bdf8', fontSize: '1.1rem' }}>
                  RD$ {Number(pnl.gross_profit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row 6: Gastos Operativos */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                <span style={{ color: '#f59e0b' }}>(-) Gastos Operativos & Pagos Fijos del Mes</span>
                <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                  - RD$ {Number(pnl.operating_expenses || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row 7: Comisiones */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                <span style={{ color: '#a78bfa' }}>(-) Comisiones Liquidadas a la Fuerza de Ventas</span>
                <span style={{ fontWeight: 700, color: '#a78bfa' }}>
                  - RD$ {Number(pnl.commissions || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row 8: Ganancia Neta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '10px', borderLeft: '5px solid var(--success)', marginTop: '8px' }}>
                <div>
                  <span style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: '1.1rem', display: 'block' }}>
                    (=) RESULTADO NETO DEL EJERCICIO (GANANCIA NETA)
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Margen neto final sobre ventas: {netMarginPercent}%
                  </span>
                </div>
                <span style={{ fontWeight: 900, color: 'var(--success)', fontSize: '1.4rem' }}>
                  RD$ {Number(pnl.net_profit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Official Close Action Box */}
            {!isAlreadyClosed && (
              <div style={{ marginTop: '24px', padding: '18px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Cierre Oficial del Mes
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Al ejecutar el cierre oficial, se congela el balance contable y se genera el registro de auditoría.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Nota de cierre (opcional)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ width: '260px', height: '38px' }}
                  />
                  <button
                    onClick={handleSaveClosing}
                    disabled={closingOfficial}
                    className="btn btn-primary"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                  >
                    <Lock size={16} />
                    <span>{closingOfficial ? 'Guardando...' : 'Cerrar Mes Oficialmente'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* HISTORICAL CLOSED MONTHS TABLE */}
          {closingData?.saved_closings && closingData.saved_closings.length > 0 && (
            <div className="card" style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>
                Historial de Meses Cerrados y Archivados
              </h4>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Ventas Netas</th>
                      <th>Ganancia Bruta</th>
                      <th>Gastos Operativos</th>
                      <th>Ganancia Neta</th>
                      <th>Fecha de Cierre</th>
                      <th>Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closingData.saved_closings.map(sc => (
                      <tr key={sc.id}>
                        <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {monthsList.find(m => m.num === sc.month)?.name} {sc.year}
                        </td>
                        <td>RD$ {Number(sc.net_sales).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                        <td style={{ color: '#38bdf8', fontWeight: 600 }}>
                          RD$ {Number(sc.gross_profit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ color: '#f59e0b' }}>
                          RD$ {Number(sc.operating_expenses).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ color: 'var(--success)', fontWeight: 800 }}>
                          RD$ {Number(sc.net_profit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td>{new Date(sc.closed_at).toLocaleDateString('es-DO')}</td>
                        <td>{sc.closed_by_name || 'Admin'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
