import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginModal from './components/LoginModal';

// Pages
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import ProductsPage from './pages/ProductsPage';
import DyeMatrixPage from './pages/DyeMatrixPage';
import InventoryPage from './pages/InventoryPage';
import PurchasesPage from './pages/PurchasesPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import CreditNotesPage from './pages/CreditNotesPage';
import CashRegisterPage from './pages/CashRegisterPage';
import FinancePage from './pages/FinancePage';
import ThirdPartiesPage from './pages/ThirdPartiesPage';
import SalespeoplePage from './pages/SalespeoplePage';
import RecurringExpensesPage from './pages/RecurringExpensesPage';
import MonthlyClosingPage from './pages/MonthlyClosingPage';
import FiscalPage from './pages/FiscalPage';
import ReportsPage from './pages/ReportsPage';
import SecurityPage from './pages/SecurityPage';
import ImportsPage from './pages/ImportsPage';
import SettingsPage from './pages/SettingsPage';
import { ToastProvider } from './context/ToastContext';

import api from './services/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [activeBranch, setActiveBranch] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('sgc_token');
    if (!token) {
      setLoadingInitial(false);
      return;
    }

    try {
      const res = await api.get('/auth/me');
      if (res.success) {
        setUser(res.user);
        const branches = res.user.accessible_branches || [];
        const savedBranchId = localStorage.getItem('sgc_branch_id');
        let branch = branches.find(b => b.id === parseInt(savedBranchId, 10)) || branches[0];
        if (!branch) {
          branch = { id: 1, name: 'Sucursal Principal Santo Domingo', code: 'SUC-01', is_main: 1 };
        }
        setActiveBranch(branch);
        setActiveSession(res.user.active_cash_session);
      }
    } catch (err) {
      console.error('Auth verification failed:', err);
      localStorage.removeItem('sgc_token');
      localStorage.removeItem('sgc_user');
    } finally {
      setLoadingInitial(false);
    }
  };

  const handleLoginSuccess = (loggedUser) => {
    setUser(loggedUser);
    const branches = loggedUser.accessible_branches || [];
    let branch = branches.find(b => b.id === loggedUser.active_branch_id) || branches[0];
    if (!branch) {
      branch = { id: 1, name: 'Sucursal Principal Santo Domingo', code: 'SUC-01', is_main: 1 };
    }
    setActiveBranch(branch);
    setActiveSession(loggedUser.active_cash_session);
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {}
    localStorage.removeItem('sgc_token');
    localStorage.removeItem('sgc_user');
    localStorage.removeItem('sgc_branch_id');
    setUser(null);
    setActiveBranch(null);
    setActiveSession(null);
  };

  const handleBranchChange = (branchId) => {
    const branch = user?.accessible_branches?.find(b => b.id === branchId);
    if (branch) {
      setActiveBranch(branch);
      localStorage.setItem('sgc_branch_id', String(branchId));
      checkAuth();
    }
  };

  const handleSelectGlobalItem = (item) => {
    if (item.type === 'product') setCurrentTab('products');
    else if (item.type === 'customer') setCurrentTab('customers');
    else if (item.type === 'sale') setCurrentTab('sales');
    else if (item.type === 'supplier') setCurrentTab('suppliers');
    else if (item.type === 'salesperson') setCurrentTab('salespeople');
  };

  if (loadingInitial) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid var(--accent-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      </div>
    );
  }

  if (!user) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <ToastProvider>
      <div className="app-container">
        {/* Left Sidebar */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          user={user}
          onLogout={handleLogout}
        />

        {/* Main Container */}
        <div className="main-content">
          {/* Top Header Navbar */}
          <Header
            user={user}
            activeBranch={activeBranch}
            onBranchChange={handleBranchChange}
            activeSession={activeSession}
            onOpenCashModal={() => setCurrentTab('cash-register')}
            onSelectGlobalItem={handleSelectGlobalItem}
            onNavigate={(tab) => setCurrentTab(tab)}
          />

          {/* Dynamic Content Body */}
          <main className="content-body">
            {/* Dashboard */}
            {currentTab === 'dashboard' && (
              <DashboardPage
                user={user}
                activeBranch={activeBranch}
                onNavigate={(tab) => setCurrentTab(tab)}
              />
            )}

            {/* Ventas & POS */}
            {currentTab === 'pos' && (
              <POSPage
                user={user}
                activeBranch={activeBranch}
                activeSession={activeSession}
                onOpenCashModal={() => setCurrentTab('cash-register')}
                onNavigate={setCurrentTab}
              />
            )}

            {currentTab === 'sales' && (
              <SalesHistoryPage user={user} activeBranch={activeBranch} />
            )}
            {currentTab === 'credit-notes' && (
              <CreditNotesPage user={user} activeBranch={activeBranch} />
            )}

            {/* Clientes & Proveedores (Terceros) */}
            {currentTab === 'customers' && <ThirdPartiesPage user={user} initialMode="customers" onNavigate={setCurrentTab} />}
            {currentTab === 'customer-statement' && <ThirdPartiesPage user={user} initialMode="customer-statement" onNavigate={setCurrentTab} />}
            {currentTab === 'credit-risk' && <ThirdPartiesPage user={user} initialMode="credit-risk" onNavigate={setCurrentTab} />}
            {currentTab === 'suppliers' && <ThirdPartiesPage user={user} initialMode="suppliers" onNavigate={setCurrentTab} />}
            {currentTab === 'third-parties' && <ThirdPartiesPage user={user} initialMode="customers" onNavigate={setCurrentTab} />}

            {/* Cobros & Finanzas */}
            {currentTab === 'collections' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxc" />}
            {currentTab === 'aging' && <FinancePage user={user} activeBranch={activeBranch} initialTab="aging" />}
            {currentTab === 'collection-history' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxc" />}
            {currentTab === 'collection-promises' && <ThirdPartiesPage user={user} initialMode="customers" />}
            {currentTab === 'cxc-dashboard' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxc" />}
            {currentTab === 'cxp-dashboard' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxp" />}
            {currentTab === 'expenses' && <FinancePage user={user} activeBranch={activeBranch} initialTab="expenses" />}
            {currentTab === 'finance' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxc" />}

            {/* Inventario & Tintes */}
            {currentTab === 'products' && <ProductsPage user={user} />}
            {currentTab === 'dye-matrix' && <DyeMatrixPage user={user} onNavigateToPos={() => setCurrentTab('pos')} />}
            {currentTab === 'inventory' && <InventoryPage user={user} initialTab="stock" />}
            {currentTab === 'inventory-lots' && <InventoryPage user={user} initialTab="lots" />}
            {currentTab === 'inventory-analysis' && <InventoryPage user={user} initialTab="analysis" />}

            {/* Compras */}
            {currentTab === 'purchases' && <PurchasesPage user={user} activeBranch={activeBranch} />}

            {/* Gastos & Caja Chica & Pagos Fijos */}
            {currentTab === 'cash-register' && (
              <CashRegisterPage
                user={user}
                activeBranch={activeBranch}
                activeSession={activeSession}
                onRefreshUser={checkAuth}
              />
            )}
            {currentTab === 'fixed-expenses' && <RecurringExpensesPage user={user} />}

            {/* Vendedores & Comisiones */}
            {currentTab === 'salespeople' && <SalespeoplePage user={user} initialTab="salespeople" />}
            {currentTab === 'commissions' && <SalespeoplePage user={user} initialTab="commissions" />}

            {/* Reportes & Cierre Mensual */}
            {currentTab === 'reports' && <ReportsPage activeBranch={activeBranch} />}
            {currentTab === 'monthly-closing' && <MonthlyClosingPage />}

            {/* Fiscal & Administración */}
            {currentTab === 'fiscal' && <FiscalPage activeBranch={activeBranch} />}
            {currentTab === 'users' && <SecurityPage activeBranch={activeBranch} initialTab="users" />}
            {currentTab === 'authorizations' && <SecurityPage activeBranch={activeBranch} initialTab="roles" />}
            {currentTab === 'roles' && <SecurityPage activeBranch={activeBranch} initialTab="roles" />}
            {(currentTab === 'audit-logs' || currentTab === 'audit-log' || currentTab === 'audit') && <SecurityPage activeBranch={activeBranch} initialTab="audit" />}
            {currentTab === 'security' && <SecurityPage activeBranch={activeBranch} initialTab="users" />}
            {currentTab === 'imports' && <ImportsPage />}
            {currentTab === 'settings' && <SettingsPage />}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
