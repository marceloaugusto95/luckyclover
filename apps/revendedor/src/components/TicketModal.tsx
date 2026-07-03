import { X, User, Hash, Printer, Check, Loader2 } from 'lucide-react';
import { Sale } from '../lib/supabase';
import { printBetTicket } from '../lib/printer';
import { useState, useEffect } from 'react';
import { PrintEmulator } from './PrintEmulator';

interface TicketModalProps {
    sale: Sale | null;
    onClose: () => void;
    autoPrint?: boolean;
}

export function TicketModal({ sale, onClose, autoPrint = false }: TicketModalProps) {
    const [isPrinting, setIsPrinting] = useState(false);
    const [virtualTicket, setVirtualTicket] = useState<string | null>(null);
    const [hasAutoPrinted, setHasAutoPrinted] = useState(false);

    const handlePrint = async () => {
        if (!sale) return;
        setIsPrinting(true);
        try {
            const result = await printBetTicket({
                id: sale.id,
                concurso: sale.concurso,
                numbers: sale.numbers || [],
                amount: sale.amount || 0,
                clientName: sale.client_name || 'Cliente',
                clientPhone: sale.client_phone || 'Nao informado',
                createdAt: sale.created_at || new Date().toISOString(),
                resellerName: 'LuckyClover',
                ticketNumber: sale.ticket_number
            });

            if (!result.success && result.virtualTicket) {
                setVirtualTicket(result.virtualTicket);
            }
        } catch (error) {
            console.error("Print error:", error);
            alert("Erro ao preparar impressao.");
        } finally {
            setIsPrinting(false);
        }
    };

    // Auto-print effect
    useEffect(() => {
        if (!sale) return;
        if (autoPrint && !hasAutoPrinted) {
            setHasAutoPrinted(true);
            setTimeout(() => {
                handlePrint();
            }, 500); // Small delay to ensure render
        }
    }, [autoPrint, sale?.id, hasAutoPrinted]);

    if (!sale) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem'
        }} onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', position: 'relative' }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#666'
                    }}
                >
                    <X size={24} />
                </button>

                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Detalhes da Aposta</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    {sale.status === 'confirmed' ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            background: '#e6f4ea',
                            color: '#1e7e34',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            fontWeight: 700
                        }}>
                            <Check size={16} strokeWidth={3} /> V Confirmada
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            background: '#fff3cd',
                            color: '#856404',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            fontWeight: 600
                        }}>
                            <Loader2 size={14} className="animate-spin" /> Aguardando
                        </div>
                    )}
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>
                        {sale.created_at ? new Date(sale.created_at).toLocaleDateString() : 'N/A'}
                    </span>
                    {sale.ticket_number && (
                        <span style={{ fontSize: '0.85rem', color: '#2e7d32', fontWeight: 600, marginLeft: 'auto' }}>
                            #{sale.ticket_number}
                        </span>
                    )}
                </div>

                {/* Contest Info */}
                <div style={{ marginBottom: '1.5rem', background: '#f8f9fa', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: '#666', fontSize: '0.9rem' }}>Concurso</span>
                        <span style={{ fontWeight: 600 }}>#{sale.concurso}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#666', fontSize: '0.9rem' }}>Valor da Aposta</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                            R$ {(sale.amount || 0).toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Client Info */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={16} /> Cliente
                    </h3>
                    <div style={{ paddingLeft: '0.5rem', borderLeft: '2px solid #ddd' }}>
                        <p style={{ fontWeight: 600 }}>{sale.client_name}</p>
                        {sale.client_phone && (
                            <p style={{ fontSize: '0.85rem', color: '#666' }}>{sale.client_phone}</p>
                        )}
                    </div>
                </div>

                {/* Numbers */}
                <div>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Hash size={16} /> Números Escolhidos ({(sale.numbers || []).length})
                    </h3>
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                    }}>
                        {(Array.isArray(sale.numbers) ? [...sale.numbers] : []).sort((a, b) => a - b).map(num => (
                            <span key={num} style={{
                                width: '32px',
                                height: '32px',
                                background: 'var(--primary)',
                                color: 'white',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.9rem'
                            }}>
                                {num.toString().padStart(2, '0')}
                            </span>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: '2rem' }}>
                    <button
                        className="btn btn-primary"
                        style={{
                            width: '100%',
                            gap: '0.5rem',
                            opacity: (sale.status === 'confirmed' || sale.payment_status === 'paid') ? 1 : 0.5,
                            cursor: (sale.status === 'confirmed' || sale.payment_status === 'paid') ? 'pointer' : 'not-allowed'
                        }}
                        onClick={() => {
                            if (sale.status === 'confirmed' || sale.payment_status === 'paid') {
                                handlePrint();
                            } else {
                                alert("A impressao so e permitida apos a confirmacao do pagamento.");
                            }
                        }}
                        disabled={isPrinting}
                    >
                        <Printer size={20} />
                        {isPrinting ? 'Imprimindo...' : 'Imprimir Comprovante'}
                    </button>
                    <p style={{ fontSize: '0.7rem', textAlign: 'center', marginTop: '0.5rem', color: '#888' }}>
                        Certifique-se que a impressora está ligada.
                    </p>
                </div>
            </div>

            {virtualTicket && (
                <PrintEmulator
                    content={virtualTicket}
                    onClose={() => setVirtualTicket(null)}
                />
            )}
        </div>
    );
}
