import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllBets } from '../lib/supabase';
import { Eye, Search } from 'lucide-react';

interface Bet {
    id: string;
    concurso: number;
    numbers: number[];
    amount: number;
    status: string;
    created_at: string;
    ticket_number?: string;
    client_name?: string;
    client_phone?: string;
    profiles?: { full_name: string; phone?: string; cpf?: string; cidade?: string };
    resellers?: { coupon_code: string };
}

export default function ClientesPage() {
    const [bets, setBets] = useState<Bet[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const data = await getAllBets();
        setBets(data || []);
        setLoading(false);
    };

    const filteredBets = bets.filter(bet => {
        const term = searchTerm.toLowerCase();
        const clientName = bet.client_name?.toLowerCase() || '';
        const profileName = bet.profiles?.full_name?.toLowerCase() || '';
        const ticketNumber = bet.ticket_number?.toLowerCase() || '';
        return clientName.includes(term) || profileName.includes(term) || ticketNumber.includes(term);
    });

    if (loading && bets.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid var(--muted)', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto' }} />
            </div>
        );
    }

    return (
        <div>
            <div style={{ marginBottom: '1rem', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                <input
                    type="text"
                    className="input"
                    placeholder="Buscar por nome ou nº do bilhete..."
                    style={{ paddingLeft: '2.5rem', width: '100%', maxWidth: '400px' }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--muted)', textAlign: 'left' }}>
                        <tr>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Cliente</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Concurso</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Números</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Cupom</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Valor</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Cidade</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Status</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredBets.map(bet => (
                            <tr key={bet.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1rem', fontWeight: 600 }}>
                                    {bet.profiles?.full_name || bet.client_name || 'Cliente'}
                                    {bet.ticket_number && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>
                                            Bilhete: #{bet.ticket_number}
                                        </div>
                                    )}
                                    {(bet.profiles?.phone || bet.client_phone) && (
                                        <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--muted-foreground)' }}>
                                            {bet.profiles?.phone || bet.client_phone}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '1rem' }}>#{bet.concurso}</td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                        {bet.numbers.slice(0, 5).map(n => (
                                            <span key={n} style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 600 }}>
                                                {n.toString().padStart(2, '0')}
                                            </span>
                                        ))}
                                        {bet.numbers.length > 5 && <span style={{ fontSize: '0.75rem' }}>+{bet.numbers.length - 5}</span>}
                                    </div>
                                </td>
                                <td style={{ padding: '1rem', fontFamily: 'monospace', color: bet.resellers?.coupon_code ? 'var(--primary)' : 'var(--muted-foreground)' }}>
                                    {bet.resellers?.coupon_code || '-'}
                                </td>
                                <td style={{ padding: '1rem' }}>R$ {bet.amount.toFixed(2)}</td>
                                <td style={{ padding: '1rem' }}>
                                    {bet.profiles?.cidade || '-'}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <span className="badge badge-success">
                                        Confirmada
                                    </span>
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <Link to={`/apostas/${bet.id}`} className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
                                        <Eye size={14} /> Detalhes
                                    </Link>
                                </td>
                            </tr>
                        ))}
                        {filteredBets.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Nenhuma aposta encontrada.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
