import { useState } from 'react';
import { ShoppingCart, Trash2, ChevronUp, ChevronDown, QrCode, Loader, Ticket } from 'lucide-react';
import { useCartStore } from '../lib/cartStore';

interface CartSummaryProps {
    onCheckout: (cpf: string, coupon: string) => void;
    isSubmitting: boolean;
    initialCpf?: string;
}

export function CartSummary({ onCheckout, isSubmitting, initialCpf = '' }: CartSummaryProps) {
    const { items, removeItem, total, isOpen, toggleCart } = useCartStore();
    const [cpf, setCpf] = useState(initialCpf);
    const [coupon, setCoupon] = useState('');

    const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 9) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
        else if (v.length > 6) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
        else if (v.length > 3) v = `${v.slice(0, 3)}.${v.slice(3)}`;
        setCpf(v);
    };

    if (items.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#fff',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            zIndex: 50,
            transition: 'transform 0.3s ease-in-out',
            transform: isOpen ? 'translateY(0)' : 'translateY(calc(100% - 80px))' // Show only header when closed
        }}>
            {/* Header (Always Visible) */}
            <div
                onClick={toggleCart}
                style={{
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: 'var(--primary)',
                    color: '#fff',
                    borderTopLeftRadius: '16px',
                    borderTopRightRadius: '16px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ position: 'relative' }}>
                        <ShoppingCart size={24} />
                        <span style={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            background: '#e53935',
                            color: '#fff',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            minWidth: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {items.length}
                        </span>
                    </div>
                    <span style={{ fontWeight: 600 }}>Meu Carrinho</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                        R$ {total().toFixed(2)}
                    </span>
                    {isOpen ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                </div>
            </div>

            {/* Content (Scrollable) */}
            <div style={{
                maxHeight: '70vh',
                overflowY: 'auto',
                padding: '1.5rem',
                opacity: isOpen ? 1 : 0,
                pointerEvents: isOpen ? 'all' : 'none',
                transition: 'opacity 0.2s'
            }}>
                {/* Items List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                    {items.map((item) => (
                        <div key={item.id} className="card" style={{
                            padding: '1rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8f9fa'
                        }}>
                            <div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        background: '#e3f2fd',
                                        color: '#1565c0',
                                        padding: '2px 6px',
                                        borderRadius: '4px'
                                    }}>
                                        {item.game}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#666' }}>
                                        Conc. {item.concurso}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                    {item.numbers.map(n => (
                                        <span key={n} style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                            {n.toString().padStart(2, '0')}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ fontWeight: 700 }}>
                                    R$ {item.amount.toFixed(2)}
                                </span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                                    className="btn btn-ghost"
                                    style={{ padding: '0.5rem', color: '#e53935' }}
                                    disabled={isSubmitting}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Checkout Form */}
                <div style={{ borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                            CPF para Nota / Pix
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={cpf}
                            onChange={handleCpfChange}
                            placeholder="000.000.000-00"
                            maxLength={14}
                            disabled={isSubmitting}
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                            Cupom do Vendedor (Opcional)
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Ticket size={18} style={{ position: 'absolute', left: '10px', top: '12px', color: '#999' }} />
                            <input
                                type="text"
                                className="input"
                                style={{ paddingLeft: '2.5rem' }}
                                value={coupon}
                                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                                placeholder="Código do Vendedor"
                                disabled={isSubmitting}
                            />
                        </div>
                    </div>

                    <button
                        className="btn btn-primary"
                        style={{ width: '100%', gap: '0.5rem', padding: '1rem' }}
                        onClick={() => onCheckout(cpf, coupon)}
                        disabled={isSubmitting || !cpf || items.length === 0}
                    >
                        {isSubmitting ? <Loader size={20} className="animate-spin" /> : <QrCode size={20} />}
                        {isSubmitting ? 'Processando...' : `Pagar R$ ${total().toFixed(2)} com Pix`}
                    </button>
                </div>
            </div>
        </div>
    );
}
