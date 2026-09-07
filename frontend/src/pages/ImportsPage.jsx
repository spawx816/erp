import React, { useState } from 'react';
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, ArrowRight, Layers } from 'lucide-react';
import api from '../services/api';

export default function ImportsPage() {
  const [entityType, setEntityType] = useState('products');
  const [csvText, setCsvText] = useState(`name,sku,barcode,cost,price,stock_min
Tenis Puma Nitro,PUMA-NITRO-01,7453008899001,3500,6200,8
Short Deportivo Dry,SHORT-DRY-01,7453008899002,450,1100,15`);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const parseCsvToJson = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] !== undefined ? values[i] : '';
      });
      return obj;
    });
  };

  const handleValidate = async () => {
    const rows = parseCsvToJson(csvText);
    if (rows.length === 0) {
      alert('El formato CSV no contiene registros válidos.');
      return;
    }

    setLoading(true);
    setImportResult(null);
    try {
      const res = await api.post('/imports/preview', { entity_type: entityType, rows });
      if (res.success) {
        setPreviewData(res);
      }
    } catch (err) {
      alert(err.message || 'Error validando datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    const rows = parseCsvToJson(csvText);
    setLoading(true);
    try {
      const res = await api.post('/imports/execute', { entity_type: entityType, rows });
      if (res.success) {
        setImportResult(res.message);
        setPreviewData(null);
      }
    } catch (err) {
      alert(err.message || 'Error importando registros.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Asistente de Importación Masiva (CSV / Excel)</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Carga inicial de inventario, catálogo de productos y cartera de clientes con validación previa
        </p>
      </div>

      <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label className="label-control" style={{ margin: 0 }}>Entidad a Importar:</label>
          <select
            className="select-control"
            style={{ width: '240px' }}
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPreviewData(null);
              setImportResult(null);
              if (e.target.value === 'products') {
                setCsvText(`name,sku,barcode,cost,price,stock_min
Tenis Puma Nitro,PUMA-NITRO-01,7453008899001,3500,6200,8
Short Deportivo Dry,SHORT-DRY-01,7453008899002,450,1100,15`);
              } else {
                setCsvText(`company_name,first_name,last_name,tax_id,phone,email
Constructora Caribe SAS,,,101-77889-1,809-555-8811,contacto@caribe.do
,Juan,Díaz,001-9988776-5,809-555-9922,juan.diaz@gmail.com`);
              }
            }}
          >
            <option value="products">Productos & Inventario</option>
            <option value="customers">Cartera de Clientes</option>
          </select>
        </div>

        <div>
          <label className="label-control">Datos CSV (Encabezados separados por coma):</label>
          <textarea
            rows="6"
            className="input-control"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleValidate} disabled={loading} className="btn btn-secondary">
            <CheckCircle2 size={16} />
            <span>Validar y Vista Previa</span>
          </button>
        </div>
      </div>

      {/* Validation Preview Card */}
      {previewData && (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Resultado de Validación</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="badge badge-success">{previewData.summary.valid_count} filas válidas</span>
              {previewData.summary.error_count > 0 && (
                <span className="badge badge-danger">{previewData.summary.error_count} errores detectados</span>
              )}
            </div>
          </div>

          {/* Table Preview */}
          <div className="table-container" style={{ maxHeight: '250px' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  {previewData.valid_rows.length > 0 && Object.keys(previewData.valid_rows[0]).map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.valid_rows.map((row, idx) => (
                  <tr key={idx}>
                    {Object.values(row).map((val, i) => (
                      <td key={i}>{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleExecute} disabled={loading} className="btn btn-primary">
              <Upload size={16} />
              <span>Confirmar & Importar a Base de Datos</span>
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div style={{ padding: '16px', background: 'var(--success-bg)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', color: 'var(--success)', fontWeight: 600 }}>
          {importResult}
        </div>
      )}
    </div>
  );
}
