import React from 'react';
import { Printer, X } from 'lucide-react';

export default function ThermalReceipt({ saleData, onClose }) {
  if (!saleData) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(saleData.created_at || Date.now()).toLocaleString('es-DO', {
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '420px', padding: '0', background: 'var(--bg-subtle-2)' }}>
        {/* Header Action */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#000' }}>Comprobante de Venta</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              Imprimir (80mm)
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Thermal Ticket Content */}
        <div style={{ padding: '24px', background: 'var(--bg-main)', display: 'flex', justifyContent: 'center' }}>
          <div
            id="printable-receipt"
            style={{
              width: '100%',
              maxWidth: '320px',
              background: '#fff',
              color: '#000',
              fontFamily: "'JetBrains Mono', monospace",
              padding: '16px',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              fontSize: '11px',
              lineHeight: '1.4'
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '10px', marginBottom: '10px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 2px' }}>COMERCIAL CAMBRI SRL</h2>
              <p style={{ margin: '0' }}>RNC: 131-98765-4</p>
              <p style={{ margin: '0' }}>Av. Winston Churchill #105, Piantini</p>
              <p style={{ margin: '0' }}>Tel: 809-555-0199</p>
              <p style={{ margin: '0' }}>Santo Domingo, D.N.</p>
            </div>

            {/* Fiscal info */}
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
              <p style={{ margin: '0', fontWeight: 'bold', fontSize: '12px' }}>
                NCF: {saleData.ncf || 'B0200000000'}
              </p>
              <p style={{ margin: '0' }}>
                Tipo: {saleData.fiscal_type_code === 'B01' ? 'Crédito Fiscal' : (saleData.fiscal_type_code === 'B04' ? 'Nota de Crédito' : 'Consumo')}
              </p>
              <p style={{ margin: '0' }}>Factura No: {saleData.sale_number || saleData.invoice_number}</p>
              <p style={{ margin: '0' }}>Fecha: {formattedDate}</p>
              <p style={{ margin: '0' }}>Cajero: {saleData.seller_name || 'Cajero'}</p>
              <p style={{ margin: '0' }}>Cliente: {saleData.customer_name || 'Cliente Contado'}</p>
              {saleData.customer_tax_id && <p style={{ margin: '0' }}>RNC/Cédula: {saleData.customer_tax_id}</p>}
            </div>

            {/* Items Table */}
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <th style={{ padding: '2px 0' }}>Cant</th>
                    <th style={{ padding: '2px 4px' }}>Descripción</th>
                    <th style={{ padding: '2px 0', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {saleData.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ verticalAlign: 'top', padding: '3px 0' }}>{item.quantity}</td>
                      <td style={{ verticalAlign: 'top', padding: '3px 4px' }}>
                        <div>{item.product_name}</div>
                        <div style={{ fontSize: '9px', color: '#444' }}>RD$ {Number(item.unit_price).toFixed(2)}</div>
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '3px 0', textAlign: 'right' }}>
                        RD$ {Number(item.total).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Breakdown */}
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>RD$ {Number(saleData.subtotal || 0).toFixed(2)}</span>
              </div>
              {Number(saleData.total_discount || saleData.discount_amount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Descuento:</span>
                  <span>- RD$ {Number(saleData.total_discount || saleData.discount_amount).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ITBIS:</span>
                <span>RD$ {Number(saleData.tax_amount || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', marginTop: '4px', borderTop: '1px solid #000', paddingTop: '4px' }}>
                <span>TOTAL:</span>
                <span>RD$ {Number(saleData.total || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Payments & Change */}
            <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
              {saleData.payments?.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ textTransform: 'capitalize' }}>Forma de Pago ({p.payment_method}):</span>
                  <span>RD$ {Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                <span>Cambio:</span>
                <span>RD$ {Number(saleData.change_given || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', fontSize: '10px', paddingTop: '6px' }}>
              <p style={{ margin: '0' }}>¡Gracias por su compra!</p>
              <p style={{ margin: '0' }}>No se aceptan devoluciones sin factura.</p>
              <p style={{ margin: '4px 0 0', fontSize: '8px', color: '#666' }}>Sistema Nexus ERP • nexus.cambri.com.do</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
