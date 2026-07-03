import { useState, useEffect } from 'react';
import { getRecentTransactions, Transaction } from '../lib/supabase';

export default function PagamentosPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getRecentTransactions().then(data => {
            setTransactions(data);
            setLoading(false);
        });
    }, []);

    const totalPaid = transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.amount, 0);
    const totalPending = transactions.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.amount, 0);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="animate-spin" style={{
                    width: 32, height: 32,
                    border: '3px solid var(--muted)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    margin: '0 auto'
                }} />
            </div>
        );
    }

    return (
        <div>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Total Recebido</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2e7d32' }}>
                        R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
                <div className="card">
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Pendente</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F57C00' }}>
                        R$ {totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--muted)', textAlign: 'left' }}>
                        <tr>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Descrição</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Data</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Valor</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Info MP</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(t => (
                            <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1rem' }}>{t.description}</td>
                                <td style={{ padding: '1rem', color: 'var(--muted-foreground)' }}>{t.date}</td>
                                <td style={{ padding: '1rem', fontWeight: 600 }}>R$ {t.amount.toFixed(2)}</td>
                                <td style={{ padding: '1rem', fontSize: '0.75rem' }}>
                                    {t.payment_id ? (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 'bold' }}>ID: {t.payment_id}</span>
                                            {t.mp_status && (
                                                <span style={{ color: 'var(--muted-foreground)' }}>Status: {t.mp_status}</span>
                                            )}
                                        </div>
                                    ) : '-'}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <span className={`badge badge-${t.status === 'completed' ? 'success' : 'warning'}`}>
                                        {t.status === 'completed' ? 'Pago' : 'Pendente'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
