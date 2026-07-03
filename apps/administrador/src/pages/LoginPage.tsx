import { useState } from 'react';
import { signIn, formatCpf, validateCpf } from '../lib/supabase';

export default function LoginPage() {
    const [cpf, setCpf] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCpfChange = (value: string) => {
        setCpf(formatCpf(value));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!validateCpf(cpf)) {
            setError('CPF inválido. Digite os 11 dígitos.');
            return;
        }

        setLoading(true);

        try {
            const { error } = await signIn(cpf, password);
            if (error) throw error;
            // Use window.location to ensure fresh state after auth
            window.location.href = '/';
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao autenticar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: 'linear-gradient(135deg, #e8f5e9 0%, #fff 100%)'
        }}>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <img src="/clover.svg" alt="LuckyClover" style={{ width: '200px', height: '200px' }} />
                <p style={{ color: '#e53935', fontWeight: 700, marginTop: '0.5rem' }}>
                    ADMINISTRADOR
                </p>
            </div>

            <div className="card" style={{ width: '100%', maxWidth: '360px' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                    Acesso Restrito
                </h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                            CPF
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={cpf}
                            onChange={(e) => handleCpfChange(e.target.value)}
                            placeholder="000.000.000-00"
                            maxLength={14}
                            required
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                            Senha
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <p style={{ color: '#e53935', fontSize: '0.875rem', textAlign: 'center' }}>
                            {error}
                        </p>
                    )}

                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                        {loading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
