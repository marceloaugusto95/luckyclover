import { useState, useEffect } from 'react';
import { getBetPricing, updateBetPrice, toggleBetPriceStatus, BetPricing } from '../lib/supabase';
import { Save } from 'lucide-react';

export default function PrecosPage() {
    const [pricing, setPricing] = useState<BetPricing[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    useEffect(() => {
        getBetPricing().then(data => {
            setPricing(data);
            setLoading(false);
        });
    }, []);

    const handleEdit = (item: BetPricing) => {
        setEditingId(item.id);
        setEditValue(item.price.toString());
    };

    const handleSave = async (id: string) => {
        const newPrice = parseFloat(editValue);
        if (isNaN(newPrice) || newPrice <= 0) return;

        await updateBetPrice(id, newPrice);
        setPricing(pricing.map(p => p.id === id ? { ...p, price: newPrice } : p));
        setEditingId(null);
    };

    const handleToggleStatus = async (item: BetPricing) => {
        setTogglingId(item.id);
        const newStatus = !item.is_active;
        const success = await toggleBetPriceStatus(item.id, newStatus);
        if (success) {
            setPricing(pricing.map(p => p.id === item.id ? { ...p, is_active: newStatus } : p));
        }
        setTogglingId(null);
    };

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
            <p style={{ color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
                Defina o preço para cada quantidade de números selecionados (10-25)
            </p>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--muted)', textAlign: 'left' }}>
                        <tr>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Qtd. Números</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Preço (R$)</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem', width: '120px' }}>Status</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem', width: '100px' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pricing.map(item => (
                            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1rem', fontWeight: 600 }}>
                                    {item.number_count} números
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    {editingId === item.id ? (
                                        <input
                                            type="number"
                                            className="input"
                                            style={{ width: '150px', padding: '0.5rem' }}
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            autoFocus
                                        />
                                    ) : (
                                        <span>R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    )}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <button
                                        onClick={() => handleToggleStatus(item)}
                                        disabled={togglingId === item.id}
                                        style={{
                                            padding: '0.35rem 0.75rem',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            borderRadius: '6px',
                                            border: 'none',
                                            cursor: togglingId === item.id ? 'wait' : 'pointer',
                                            color: '#fff',
                                            background: item.is_active ? '#16a34a' : '#dc2626',
                                            opacity: togglingId === item.id ? 0.6 : 1,
                                            transition: 'background 0.2s, opacity 0.2s',
                                            minWidth: '90px',
                                        }}
                                    >
                                        {togglingId === item.id
                                            ? '...'
                                            : item.is_active
                                                ? 'Aberto'
                                                : 'Fechado'}
                                    </button>
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    {editingId === item.id ? (
                                        <button
                                            onClick={() => handleSave(item.id)}
                                            className="btn btn-primary"
                                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                                        >
                                            <Save size={14} /> Salvar
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleEdit(item)}
                                            className="btn btn-outline"
                                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                                        >
                                            Editar
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
