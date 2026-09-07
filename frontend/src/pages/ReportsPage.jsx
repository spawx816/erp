import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet, Download, Printer, Filter, Calendar,
  DollarSign, TrendingUp, Package, BarChart2
} from 'lucide-react';
import api from '../services/api';

export default function ReportsPage({ activeBranch }) {
  const [reportType, setReportType] = useState('sales'); // 'sales' | 'inventory_valuation'
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadReport();
  }, [reportType, dateRange, activeBranch]);

  const loadReport = async () => {
    setLoading(true);
    try {
      if (reportType === 'sales') {
        const res = await api.get('/reports/sales', {
          branch_id: activeBranch?.id,
          ...dateRange
        });
        if (res.success) setReportData(res);
      } else {
        const res = await api.get('/reports/inventory-valuation');
        if (res.success) setReportData(res);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!reportData || !reportData.data || reportData.data.length === 0) return;

    const rows = reportData.data;
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => headers.map(h => `"${row[h] !== undefined ? row[h] : ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte_${reportType}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = reportData?.summary || {};
  const rows = reportData?.data || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Centro de Reportes & Analítica</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Márgenes brutos, utilidades, valoración y exportación</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleExportCSV} className="btn btn-secondary">
            <Download size={16} />
            <span>Exportar CSV / Excel</span>
          </button>
          <button onClick={() => window.print()} className="btn btn-primary">
            <Printer size={16} />
            <span>Imprimir Reporte</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setReportType('sales')}
            className={`btn btn-sm ${reportType === 'sales' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Reporte de Ventas & Utilidad
          </button>
          <button
            onClick={() => setReportType('inventory_valuation')}
            className={`btn btn-sm ${reportType === 'inventory_valuation' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Valoración Total de Inventario
          </button>
        </div>

        {reportType === 'sales' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} color="var(--text-muted)" />
            <input
              type="date"
              className="input-control"
              style={{ width: '150px', height: '34px', padding: '4px 8px', fontSize: '0.8rem' }}
              value={dateRange.start_date}
              onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
            />
            <span style={{ color: 'var(--text-muted)' }}>al</span>
            <input
              type="date"
              className="input-control"
              style={{ width: '150px', height: '34px', padding: '4px 8px', fontSize: '0.8rem' }}
              value={dateRange.end_date}
              onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Summary KPI Highlights */}
      {reportType === 'sales' && summary.total_sales !== undefined && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ventas Brutas</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
              RD$ {Number(summary.total_sales).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </p>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{summary.transaction_count} facturas</span>
          </div>

          <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>ITBIS Recaudado (18%)</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#60a5fa', marginTop: '4px' }}>
              RD$ {Number(summary.total_tax).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Costo de Mercancía</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning)', marginTop: '4px' }}>
              RD$ {Number(summary.total_cost).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--success)', textTransform: 'uppercase', fontWeight: 700 }}>Margen Bruto Estimado</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', marginTop: '4px' }}>
              RD$ {Number(summary.gross_profit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* REPORT DATA TABLE */}
      <div className="table-container">
        {reportType === 'sales' ? (
          <table className="custom-table">
            <thead>
              <tr>
                <th>No. Factura</th>
                <th>NCF</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Subtotal</th>
                <th>ITBIS</th>
                <th>Total Facturado</th>
                <th>Margen Bruto</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>Generando reporte...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay ventas en este rango de fechas.</td></tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{r.sale_number}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{r.ncf}</td>
                    <td style={{ fontSize: '0.78rem' }}>{new Date(r.created_at).toLocaleDateString('es-DO')}</td>
                    <td>{r.customer_name}</td>
                    <td>{r.seller_name}</td>
                    <td>RD$ {Number(r.subtotal).toFixed(2)}</td>
                    <td>RD$ {Number(r.tax_amount).toFixed(2)}</td>
                    <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>RD$ {Number(r.total).toFixed(2)}</td>
                    <td style={{ fontWeight: 700, color: Number(r.margin) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      RD$ {Number(r.margin).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Almacén</th>
                <th>Existencia</th>
                <th>Costo Unitario</th>
                <th>Precio Unitario</th>
                <th>Valor a Costo</th>
                <th>Valor Venta Estimada</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Calculando valorización...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay existencias para valorizar.</td></tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.sku}</td>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.warehouse_name}</td>
                    <td><span className="badge badge-info">{r.quantity}</span></td>
                    <td>RD$ {Number(r.cost).toFixed(2)}</td>
                    <td>RD$ {Number(r.price).toFixed(2)}</td>
                    <td>RD$ {Number(r.total_cost_value).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontWeight: 800, color: '#38bdf8' }}>
                      RD$ {Number(r.total_price_value).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
