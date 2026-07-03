import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, QrCode, Loader, Check, Search, User } from 'lucide-react';
import { useCartStore } from '../lib/cartStore';
import { createBatchBets, supabase, searchClients, registerResellerClient, ResellerClient, getBetPricing } from '../lib/supabase';
import { createPixCharge, copyPixCode } from '../lib/pix';
import { printCartTicket } from '../lib/printer';

export default function CheckoutPage() {
    const navigate = useNavigate();
    const { items, removeItem, total, clearCart } = useCartStore();

    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientCpf, setClientCpf] = useState('');
    const [clientPix, setClientPix] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);

    // Client Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ResellerClient[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Payment State
    const [showPix, setShowPix] = useState(false);
    const [pixData, setPixData] = useState<{ qrcode: string; imagemQrcode: string } | null>(null);
    const [confirmedCartId, setConfirmedCartId] = useState<string | null>(null);
    const [paymentConfirmed, setPaymentConfirmed] = useState(false);

    // Debounced client search
    const handleSearch = useCallback((value: string) => {
        setSearchQuery(value);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        if (value.length < 2) {
            setSearchResults([]);
            setShowResults(false);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        debounceTimer.current = setTimeout(async () => {
            const results = await searchClients(value);
            setSearchResults(results);
            setShowResults(results.length > 0);
            setIsSearching(false);
        }, 350);
    }, []);

    const selectClient = (client: ResellerClient) => {
        setClientName(client.name);
        setClientPhone(client.phone);
        setClientCpf(client.cpf);
        setClientPix(client.pix_key);
        setSearchQuery('');
        setShowResults(false);
        setSearchResults([]);
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const handleCheckout = async () => {
        if (items.length === 0) return;

        // Validate all cart items against active pricing tiers
        const pricing = await getBetPricing();
        const activeCounts = pricing.filter(p => p.is_active).map(p => p.number_count);
        const blockedItems = items.filter(item => !activeCounts.includes(item.numbers.length));
        if (blockedItems.length > 0) {
            const blockedCounts = [...new Set(blockedItems.map(i => i.numbers.length))].join(', ');
            alert(`As seguintes quantidades de números estão fechadas para apostas: ${blockedCounts}. Remova esses itens do carrinho para continuar.`);
            return;
        }

        if (!clientName || !clientPhone || !clientCpf || !clientPix) {
            alert('Todos os campos do cliente são obrigatórios, incluindo a Chave PIX.');
            return;
        }

        setIsSubmitting(true);

        try {
            // 1. Create Batch Bets
            const { cartId: newCartId } = await createBatchBets(
                items.map(i => ({ numbers: i.numbers, amount: i.amount, concurso: i.concurso })),
                clientName,
                clientPhone,
                clientCpf,
                clientPix
            );

            if (!newCartId) {
                throw new Error("Erro ao criar pedido.");
            }

            setConfirmedCartId(newCartId);

            // 2. Register/update client in reseller_clients
            await registerResellerClient(clientName, clientPhone, clientCpf, clientPix);

            // 3. Generate Pix for Total
            const totalAmount = total();
            const pixResult = await createPixCharge(
                totalAmount,
                newCartId,
                `Aposta Revenda (${items.length} jogos) - ${clientName || 'Cliente'}`,
                {
                    email: 'revendedor@luckyclover.app',
                    identification: { type: 'CPF', number: clientCpf || '00000000000' }
                }
            );

            if (pixResult.success && pixResult.qrCode) {
                setPixData(pixResult.qrCode);
                setShowPix(true);
            } else {
                alert(`Erro ao gerar PIX: ${pixResult.error || 'Erro desconhecido'}`);
            }

        } catch (e) {
            console.error("Checkout error", e);
            alert("Erro ao processar pedido.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle Payment Success Logic (no auto-print)
    const handleSuccess = () => {
        if (!confirmedCartId) return;
        setPaymentConfirmed(true);
    };

    const handleManualPrint = async () => {
        if (!confirmedCartId) return;
        console.log("Manual print triggered for cart:", confirmedCartId);
        setIsPrinting(true);
        try {
            console.log("Fetching paid bets for cart...");
            const { data: updatedBets, error: fetchError } = await supabase
                .from('bets')
                .select('*')
                .eq('cart_id', confirmedCartId)
                .eq('payment_status', 'paid');

            if (fetchError) console.error("Error fetching paid bets:", fetchError);

            const betsToPrint = updatedBets && updatedBets.length > 0 ? updatedBets : items;
            console.log(`Printing ${betsToPrint.length} bets...`);

            const printResult = await printCartTicket({
                cartId: confirmedCartId,
                items: betsToPrint.map((i: any) => ({
                    game: i.game || 'Mega Sena',
                    numbers: i.numbers,
                    amount: i.amount,
                    concurso: i.concurso,
                    ticket_number: i.ticket_number
                })),
                clientName,
                clientPhone,
                date: new Date().toISOString(),
                totalAmount: updatedBets && updatedBets.length > 0
                    ? updatedBets.reduce((acc, b) => acc + (b.amount || 0), 0)
                    : total()
            });

            if (printResult.success) {
                console.log("Printing successful!");
                alert("Impressão enviada com sucesso!");
            } else {
                console.error("Printing failed:", printResult.error);
                throw new Error("Falha na comunicação com a impressora.");
            }
        } catch (e) {
            console.error("Printing error exception:", e);
            alert("Erro ao imprimir comprovante.");
        } finally {
            setIsPrinting(false);
        }
    };

    const handleNewSale = () => {
        clearCart();
        setShowPix(false);
        setPaymentConfirmed(false);
        setConfirmedCartId(null);
        setPixData(null);
        navigate('/');
    };

    // Realtime listener for payment confirmation
    useEffect(() => {
        if (!showPix || !confirmedCartId) return;

        console.log("Starting Realtime listener for cart:", confirmedCartId);

        const channel = supabase
            .channel(`payment_confirm_${confirmedCartId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'bets',
                    filter: `cart_id=eq.${confirmedCartId}`
                },
                (payload) => {
                    console.log("Realtime update received:", payload);
                    if (payload.new && payload.new.payment_status === 'paid') {
                        console.log("Payment confirmed via Realtime!");
                        // Just show success state, wait for user action
                        handleSuccess();
                    }
                }
            )
            .subscribe();

        return () => {
            console.log("Cleaning up Realtime listener");
            supabase.removeChannel(channel);
        };
    }, [showPix, confirmedCartId]);

    return (
        <div style={{ paddingBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '1rem', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <button onClick={() => navigate(-1)} className="btn btn-outline" style={{ padding: '0.5rem' }}>
                    <ArrowLeft size={20} />
                </button>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Finalizar Venda</h1>
            </div>

            <div style={{ padding: '0 1rem' }}>
                {/* Items List */}
                <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Itens do Carrinho</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {items.map((item) => (
                            <div key={item.id} className="card" style={{
                                padding: '1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#fff'
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
                                        onClick={() => removeItem(item.id)}
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
                </div>

                {/* Client Search Bar */}
                <div ref={searchRef} style={{ position: 'relative', marginBottom: '1rem' }}>
                    <div className="card" style={{ padding: '1rem', background: '#fff' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Search size={18} />
                            Buscar Cliente
                        </h3>
                        <input
                            type="text"
                            className="input"
                            value={searchQuery}
                            onChange={e => handleSearch(e.target.value)}
                            placeholder="Pesquisar por nome ou telefone..."
                            style={{ width: '100%' }}
                        />
                        {isSearching && (
                            <div style={{ textAlign: 'center', padding: '0.5rem', color: '#999', fontSize: '0.8rem' }}>
                                Buscando...
                            </div>
                        )}
                    </div>

                    {/* Search Results Dropdown */}
                    {showResults && searchResults.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: '#fff',
                            borderRadius: '0 0 8px 8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 20,
                            maxHeight: '240px',
                            overflowY: 'auto'
                        }}>
                            {searchResults.map((client, idx) => (
                                <div
                                    key={`${client.source}-${client.cpf || idx}`}
                                    onClick={() => selectClient(client)}
                                    style={{
                                        padding: '0.75rem 1rem',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f0f0f0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                >
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '50%',
                                        background: client.source === 'app' ? '#e3f2fd' : '#fff3e0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <User size={18} color={client.source === 'app' ? '#1565c0' : '#ef6c00'} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {client.name}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#999' }}>
                                            {client.phone && `Tel: ${client.phone}`}
                                            {client.phone && client.cpf && ' · '}
                                            {client.cpf && `CPF: ${client.cpf}`}
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        background: client.source === 'app' ? '#e3f2fd' : '#fff3e0',
                                        color: client.source === 'app' ? '#1565c0' : '#ef6c00',
                                        padding: '2px 6px',
                                        borderRadius: '4px'
                                    }}>
                                        {client.source === 'app' ? 'CADASTRADO' : 'RECORRENTE'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Client Info Fields */}
                <div className="card" style={{ padding: '1.5rem', background: '#fff', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Dados do Cliente (Obrigatório)</h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Nome</label>
                            <input type="text" className="input" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nome do Cliente" />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Celular</label>
                            <input type="tel" inputMode="numeric" className="input" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(00) 00000-0000" />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>CPF</label>
                            <input type="text" inputMode="numeric" className="input" value={clientCpf} onChange={e => setClientCpf(e.target.value)} placeholder="000.000.000-00" />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Chave PIX (Para pagamento de prêmios)</label>
                            <input type="text" className="input" value={clientPix} onChange={e => setClientPix(e.target.value)} placeholder="Chave PIX do cliente" />
                        </div>
                    </div>
                </div>

                {/* Checkout Summary */}
                <div className="card" style={{ padding: '1.5rem', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Total a Pagar</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                            R$ {total().toFixed(2)}
                        </span>
                    </div>

                    <button
                        className="btn btn-primary"
                        style={{ width: '100%', gap: '0.5rem', padding: '1rem', fontSize: '1rem' }}
                        onClick={handleCheckout}
                        disabled={isSubmitting || items.length === 0 || !clientName || !clientPhone || !clientCpf || !clientPix}
                    >
                        {isSubmitting ? <Loader size={20} className="animate-spin" /> : <QrCode size={20} />}
                        {isSubmitting ? 'Gerando Pagamento...' : 'Gerar Pix e Finalizar'}
                    </button>
                </div>
            </div>


            {/* Pix Modal */}
            {showPix && pixData && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', background: '#fff', padding: '2rem' }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{
                                width: '60px', height: '60px',
                                background: paymentConfirmed ? '#e8f5e9' : '#fff3e0',
                                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem'
                            }}>
                                {paymentConfirmed ? (
                                    <Check size={32} color="#2e7d32" />
                                ) : (
                                    <Loader size={32} color="#ef6c00" className="animate-spin" />
                                )}
                            </div>

                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                {paymentConfirmed ? 'Pagamento Confirmado!' : 'Aguardando Pagamento'}
                            </h3>
                            <p style={{ color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                                Total: R$ {total().toFixed(2)}
                            </p>

                            {!paymentConfirmed && pixData.imagemQrcode && (
                                <>
                                    <img
                                        src={`data:image/png;base64,${pixData.imagemQrcode}`}
                                        alt="Pix QR Code"
                                        style={{ width: '180px', height: '180px', margin: '0 auto 1rem', display: 'block', border: '1px solid #eee' }}
                                    />

                                    <button
                                        className="btn btn-outline"
                                        style={{ width: '100%', gap: '0.5rem', marginBottom: '1.5rem' }}
                                        onClick={() => {
                                            copyPixCode(pixData.qrcode);
                                            alert('Código copiado!');
                                        }}
                                    >
                                        <QrCode size={18} />
                                        Copiar Código
                                    </button>
                                </>
                            )}

                            {paymentConfirmed && (
                                <div style={{
                                    padding: '1rem',
                                    background: '#e8f5e9',
                                    borderRadius: '8px',
                                    color: '#2e7d32',
                                    fontWeight: 600,
                                    marginBottom: '1rem'
                                }}>
                                    {isPrinting ? 'Imprimindo comprovante...' : 'Preparando impressão...'}
                                </div>
                            )}
                        </div>

                        <div style={{ textAlign: 'center', marginTop: '1rem', color: '#666', fontSize: '0.875rem' }}>
                            <p>O comprovante está disponível para impressão.</p>

                            {paymentConfirmed && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%', padding: '1rem' }}
                                        onClick={handleManualPrint}
                                        disabled={isPrinting}
                                    >
                                        {isPrinting ? <Loader size={20} className="animate-spin" /> : <QrCode size={20} />}
                                        {isPrinting ? 'Imprimindo...' : 'Imprimir Comprovante'}
                                    </button>

                                    <button
                                        className="btn btn-outline"
                                        style={{ width: '100%', padding: '1rem' }}
                                        onClick={handleNewSale}
                                        disabled={isPrinting}
                                    >
                                        Nova Venda
                                    </button>
                                </div>
                            )}
                        </div>

                        {!paymentConfirmed && (
                            <button
                                className="btn btn-outline"
                                style={{ width: '100%', marginTop: '0.5rem' }}
                                onClick={() => setShowPix(false)}
                                disabled={isPrinting}
                            >
                                Cancelar
                            </button>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}
