import React, { useState, useEffect } from 'react';
import {
  Tag, Layers, Ruler, Plus, Edit2, Trash2, X, Check, AlertCircle
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

// ─── Generic small list manager ─────────────────────────────────────────────
function ListManager({ title, icon: Icon, items, onAdd, onEdit, onDelete, fields, canManage }) {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});

  const defaultForm = fields.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {});

  const openCreate = () => {
    setEditingItem(null);
    setFormData(defaultForm);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormData(fields.reduce((acc, f) => ({ ...acc, [f.key]: item[f.key] || '' }), {}));
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingItem) {
      await onEdit(editingItem.id, formData);
    } else {
      await onAdd(formData);
    }
    setShowForm(false);
    setFormData(defaultForm);
    setEditingItem(null);
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', background: 'rgba(99,102,241,0.15)', borderRadius: '8px' }}>
            <Icon size={18} color="var(--accent-primary)" />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{items.length} registros</p>
          </div>
        </div>
        {canManage && (
          <button onClick={openCreate} className="btn btn-primary btn-sm">
            <Plus size={14} />
            <span>Agregar</span>
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: 'rgba(99,102,241,0.07)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '10px',
          padding: '14px',
          marginBottom: '14px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
          flexWrap: 'wrap'
        }}>
          {fields.map(f => (
            <div key={f.key} style={{ flex: f.flex || 1, minWidth: '140px' }}>
              <label className="label-control" style={{ marginBottom: '4px' }}>{f.label}{f.required ? ' *' : ''}</label>
              <input
                type="text"
                className="input-control"
                required={f.required}
                placeholder={f.placeholder || f.label}
                value={formData[f.key] || ''}
                onChange={e => setFormData(d => ({ ...d, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="submit" className="btn btn-primary btn-sm">
              <Check size={14} />
              <span>{editingItem ? 'Guardar' : 'Crear'}</span>
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary btn-sm">
              <X size={14} />
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <AlertCircle size={28} style={{ marginBottom: '8px', opacity: 0.4, display: 'block', margin: '0 auto 8px' }} />
          <p>No hay registros aun. Agrega el primero.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 12px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{item.name}</span>
                {item.code && (
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                    [{item.code}]
                  </span>
                )}
                {item.description && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.description}</p>
                )}
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => openEdit(item)} className="btn btn-secondary btn-sm" style={{ padding: '5px 7px' }} title="Editar">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => onDelete(item.id, item.name)} className="btn btn-danger btn-sm" style={{ padding: '5px 7px' }} title="Eliminar">
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function CatalogSettingsPage({ user }) {
  const { addToast } = useToast();
  const [categories, setCategories] = useState([]);
  const [brands, setBrands]         = useState([]);
  const [units, setUnits]           = useState([]);
  const [loading, setLoading]       = useState(true);

  const isAdmin = ['admin', 'gerente'].includes(user?.role_slug);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cRes, bRes, uRes] = await Promise.all([
        api.get('/catalog/categories'),
        api.get('/catalog/brands'),
        api.get('/catalog/units')
      ]);
      if (cRes.success) setCategories(cRes.data);
      if (bRes.success) setBrands(bRes.data);
      if (uRes.success) setUnits(uRes.data);
    } catch (err) {
      addToast('Error cargando datos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Categories CRUD
  const handleAddCategory = async ({ name, description }) => {
    try {
      const res = await api.post('/catalog/categories', { name, description });
      if (res.success) {
        addToast(`Categoria "${name}" creada.`, 'success');
        setCategories(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleEditCategory = async (id, { name, description }) => {
    try {
      const res = await api.put(`/catalog/categories/${id}`, { name, description });
      if (res.success) {
        addToast('Categoria actualizada.', 'success');
        setCategories(prev => prev.map(c => c.id === id ? { ...c, name, description } : c));
      }
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDeleteCategory = async (id, name) => {
    if (!window.confirm(`Eliminar la categoria "${name}"? Los productos asociados quedaran sin categoria.`)) return;
    try {
      const res = await api.delete(`/catalog/categories/${id}`);
      if (res.success) {
        addToast('Categoria eliminada.', 'success');
        setCategories(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) { addToast(err.message || 'Error eliminando.', 'error'); }
  };

  // Brands CRUD
  const handleAddBrand = async ({ name }) => {
    try {
      const res = await api.post('/catalog/brands', { name });
      if (res.success) {
        addToast(`Marca "${name}" creada.`, 'success');
        setBrands(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleEditBrand = async (id, { name }) => {
    try {
      const res = await api.put(`/catalog/brands/${id}`, { name });
      if (res.success) {
        addToast('Marca actualizada.', 'success');
        setBrands(prev => prev.map(b => b.id === id ? { ...b, name } : b));
      }
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDeleteBrand = async (id, name) => {
    if (!window.confirm(`Eliminar la marca "${name}"?`)) return;
    try {
      const res = await api.delete(`/catalog/brands/${id}`);
      if (res.success) {
        addToast('Marca eliminada.', 'success');
        setBrands(prev => prev.filter(b => b.id !== id));
      }
    } catch (err) { addToast(err.message || 'Error eliminando.', 'error'); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '12px' }}>
        <div style={{ width: '24px', height: '24px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: 'var(--text-muted)' }}>Cargando configuracion...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          Configuracion de Catalogo
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Administra las categorias, marcas y unidades de medida de tus productos
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', alignItems: 'start' }}>
        <ListManager
          title="Categorias"
          icon={Layers}
          items={categories}
          onAdd={handleAddCategory}
          onEdit={handleEditCategory}
          onDelete={handleDeleteCategory}
          canManage={isAdmin}
          fields={[
            { key: 'name', label: 'Nombre', required: true, flex: 2, placeholder: 'Ej. Ferreteria' },
            { key: 'description', label: 'Descripcion', flex: 2, placeholder: 'Opcional' }
          ]}
        />

        <ListManager
          title="Marcas"
          icon={Tag}
          items={brands}
          onAdd={handleAddBrand}
          onEdit={handleEditBrand}
          onDelete={handleDeleteBrand}
          canManage={isAdmin}
          fields={[
            { key: 'name', label: 'Nombre', required: true, flex: 2, placeholder: 'Ej. Bosch' }
          ]}
        />

        <ListManager
          title="Unidades de Medida"
          icon={Ruler}
          items={units}
          onAdd={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          canManage={false}
          fields={[
            { key: 'name', label: 'Nombre', required: true },
            { key: 'code', label: 'Codigo' }
          ]}
        />
      </div>

      {!isAdmin && (
        <div style={{ padding: '12px 16px', background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Solo administradores y gerentes pueden crear, editar o eliminar registros.
        </div>
      )}
    </div>
  );
}
