import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import NovaApostaPage from './pages/NovaApostaPage';
import MinhasApostasPage from './pages/MinhasApostasPage';
import LoginPage from './pages/LoginPage';
import CheckoutPage from './pages/CheckoutPage';
import CookieConsentBanner from './components/CookieConsentBanner';
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

    // Loading state
    if (!authChecked) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: 'var(--background)'
            }}>
                <div className="animate-spin" style={{
                    width: 40,
                    height: 40,
                    border: '3px solid var(--muted)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%'
                }} />
            </div>
        );
    }

    return (
        <>
            <Routes>
                <Route path="/login" element={
                    authenticated ? <Navigate to="/" /> : <LoginPage />
                } />
                <Route element={
                    authenticated ? <Layout /> : <Navigate to="/login" />
                }>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/nova-aposta" element={<NovaApostaPage />} />
                    <Route path="/checkout" element={<CheckoutPage />} />
                    <Route path="/minhas-apostas" element={<MinhasApostasPage />} />
                </Route>
            </Routes>
            <CookieConsentBanner />
        </>
    );
}

export default App;
