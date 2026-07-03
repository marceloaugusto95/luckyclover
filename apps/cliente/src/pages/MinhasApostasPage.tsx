import { useState, useEffect } from 'react';
import { getUserBets, Bet } from '../lib/supabase';

export default function MinhasApostasPage() {
    const [bets, setBets] = useState<Bet[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getUserBets().then(data => {
            setBets(data);
            setLoading(false);
        });
    }, []);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
            case 'confirmed':
                return <span className="badge badge-success">Aguardando Sorteio</span>;
            case 'won':
                return <span className="badge badge-success">Premiado! 🎉</span>;
            case 'lost':
                return <span className="badge badge-neutral">Não Premiado</span>;
            default:
                return <span className="badge badge-neutral">{status}</span>;
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="animate-spin" style={{
                    width: 32,
                    height: 32,
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
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Minhas Apostas</h1>

            {bets.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                    <p style={{ color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                        Você ainda não fez nenhuma aposta confirmada.
                    </p>
                    <a href="/nova-aposta" className="btn btn-primary">
                        Fazer Primeira Aposta
                    </a>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {bets.map((bet, idx) => (
                        <div key={bet.id || `bet-${idx}`} style={{
                            padding: '1.25rem',
                            borderBottom: idx < bets.length - 1 ? '1px solid #eee' : 'none'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>
                                        MEGA SENA
                                    </span>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                                        Conc. {bet.concurso}
                                    </span>
                                    {bet.ticket_number && (
                                        <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                                            • Bilhete #{bet.ticket_number}
                                        </span>
                                    )}
                                </div>
                                {getStatusBadge(bet.status)}
                            </div>

                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                {bet.numbers.map((n, i) => (
                                    <span key={`${bet.id}-${n}-${i}`} style={{
                                        width: '30px',
                                        height: '30px',
                                        borderRadius: '50%',
                                        background: 'var(--muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        color: '#555'
                                    }}>
                                        {n.toString().padStart(2, '0')}
                                    </span>
                                ))}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                                <span>
                                    {(bet.created_at ? new Date(bet.created_at) : new Date()).toLocaleDateString('pt-BR')}
                                </span>
                                <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                                    R$ {(bet.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>

                            {bet.hits > 0 && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: bet.hits >= 5 ? '#e8f5e9' : '#fff3e0', borderRadius: '4px', textAlign: 'center' }}>
                                    <span style={{ color: bet.hits >= 5 ? 'var(--primary)' : '#f57c00', fontWeight: 600 }}>
                                        {bet.hits} acerto(s) {bet.hits >= 5 ? '- PREMIADO! 🎉' : ''}
                                    </span>
                                </div>
                            )}

                            {/* Win condition info */}
                            <div style={{
                                marginTop: '0.75rem',
                                padding: '0.5rem',
                                background: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
                                borderRadius: '6px',
                                border: '1px dashed #ccc'
                            }}>
                                <p style={{ fontSize: '0.75rem', color: '#666', textAlign: 'center', margin: 0 }}>
                                    <strong>Mínimo 5 acertos</strong> para ganhar prêmio
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
