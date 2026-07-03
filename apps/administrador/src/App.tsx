import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ConcursosPage from './pages/ConcursosPage';
import RevendedoresPage from './pages/RevendedoresPage';
import ClientesPage from './pages/ClientesPage';
import PrecosPage from './pages/PrecosPage';
import BetDetailsPage from './pages/BetDetailsPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';
import LoginPage from './pages/LoginPage';
import ClientesCadastradosPage from './pages/ClientesCadastradosPage';
import { isAuthenticated as checkAuth, getCurrentUser } from './lib/supabase';

function App() {
    const [authChecked, setAuthChecked] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);

    useEffect(() => {
        // Check authentication on mount
        const user = getCurrentUser();
        setAuthenticated(checkAuth() && !!user);
        setAuthChecked(true);

        // Listen for storage changes (for logout in other tabs)
        const handleStorageChange = () => {
            setAuthenticated(checkAuth() && !!getCurrentUser());
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    if (!authChecked) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <div className="animate-spin" style={{
                    width: 40, height: 40,
                    border: '3px solid var(--muted)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%'
                }} />
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/login" element={authenticated ? <Navigate to="/" /> : <LoginPage />} />
            <Route element={authenticated ? <Layout /> : <Navigate to="/login" />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/concursos" element={<ConcursosPage />} />
                <Route path="/revendedores" element={<RevendedoresPage />} />
                <Route path="/clientes" element={<ClientesPage />} />
                <Route path="/clientes/cadastrados" element={<ClientesCadastradosPage />} />
                <Route path="/clientes/precos" element={<PrecosPage />} />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                <Route path="/apostas/:id" element={<BetDetailsPage />} />
            </Route>
        </Routes>
    );
}

export default App;
