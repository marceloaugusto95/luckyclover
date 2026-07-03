import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Ticket, QrCode, Check, Loader, Download } from 'lucide-react';

import { useCartStore } from '../lib/cartStore';
import { createBatchBets, getResellerByCoupon, getCurrentUser, supabase, getBetPricing } from '../lib/supabase';
import { createPixCharge, copyPixCode } from '../lib/pix';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function CheckoutPage() {
    const navigate = useNavigate();
    const { items, removeItem, total, clearCart } = useCartStore();

    const [cpf, setCpf] = useState('');
    const [phone, setPhone] = useState('');
    const [pixKey, setPixKey] = useState('');
    const [coupon, setCoupon] = useState('');
    const [couponError, setCouponError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Payment State
    const [showPix, setShowPix] = useState(false);
    const [pixData, setPixData] = useState<{ qrcode: string; imagemQrcode: string } | null>(null);
    const [confirmedCartId, setConfirmedCartId] = useState<string | null>(null);
    const [paymentConfirmed, setPaymentConfirmed] = useState(false);

    useEffect(() => {
        const user = getCurrentUser();
        if (user) {
            if (user.cpf) setCpf(user.cpf);
            if (user.phone) setPhone(user.phone);
            if (user.pix_key) setPixKey(user.pix_key);
        }
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

        const cleanCpf = cpf.replace(/\D/g, '');
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanCpf.length !== 11) {
            alert('CPF inválido.');
            return;
        }
        if (cleanPhone.length < 10) {
            alert('Telefone inválido.');
            return;
        }
        if (!pixKey.trim()) {
            alert('A Chave PIX é obrigatória.');
            return;
        }

        setIsSubmitting(true);

        try {
            // 1. Resolve Coupon
            let resellerId = undefined;
            if (coupon && coupon.trim()) {
                const rId = await getResellerByCoupon(coupon.trim());
                if (!rId) {
                    setCouponError('Cupom inválido');
                    setIsSubmitting(false);
                    return;
                }
                resellerId = rId;
                setCouponError('');
            }

            // 2. Create Batch Bets
            const { cartId: newCartId } = await createBatchBets(
                items.map(i => ({ numbers: i.numbers, amount: i.amount, concurso: i.concurso })),
                resellerId,
                cleanPhone,
                cleanCpf,
                pixKey.trim()
            );

            if (!newCartId) {
                throw new Error("Erro ao criar pedido.");
            }

            setConfirmedCartId(newCartId);

            // 3. Generate Pix for Total
            const totalAmount = total();
            const pixResult = await createPixCharge(
                totalAmount,
                newCartId,
                `Aposta Múltipla LuckyClover (${items.length} jogos)`,
                {
                    email: 'cliente@luckyclover.app',
                    identification: { type: 'CPF', number: cleanCpf }
                }
            );

            if (pixResult.success && pixResult.qrCode) {
                setPixData(pixResult.qrCode);
                setShowPix(true);
                clearCart();
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

    // Realtime listener for payment confirmation with Polling Fallback
    useEffect(() => {
        if (!showPix || !confirmedCartId) return;

        console.log("Starting Realtime listener for cart:", confirmedCartId);

        // 1. Realtime Subscription
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
                        setPaymentConfirmed(true);
                    }
                }
            )
            .subscribe((status) => {
                console.log(`Subscription status for ${confirmedCartId}:`, status);
            });

        // 2. Polling Fallback (every 3 seconds)
        const intervalId = setInterval(async () => {
            console.log("Polling for payment status...");
            const { data } = await supabase
                .from('bets')
                .select('payment_status')
                .eq('cart_id', confirmedCartId)
                .eq('payment_status', 'paid')
                .limit(1);

            if (data && data.length > 0) {
                console.log("Payment confirmed via Polling!");
                setPaymentConfirmed(true);
            }
        }, 3000);

        return () => {
            console.log("Cleaning up channel and interval:", confirmedCartId);
            supabase.removeChannel(channel);
            clearInterval(intervalId);
        };
    }, [showPix, confirmedCartId]);

    // Auto-generate receipt when payment is confirmed
    useEffect(() => {
        if (paymentConfirmed && confirmedCartId) {
            handleGenerateReceipt();
        }
    }, [paymentConfirmed, confirmedCartId]);

    const handleGenerateReceipt = async () => {
        if (!confirmedCartId) return;

        try {
            // Fetch updated bets to get ticket numbers
            const { data: bets } = await supabase
                .from('bets')
                .select('*')
                .eq('cart_id', confirmedCartId)
                .eq('payment_status', 'paid');

            if (!bets || bets.length === 0) {
                alert('Erro ao buscar dados da aposta.');
                return;
            }

            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();

            // Header
            doc.setFontSize(18);
            doc.setTextColor(46, 125, 50);
            doc.text('LuckyClover', pageWidth / 2, 20, { align: 'center' });

            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text('Comprovante de Aposta', pageWidth / 2, 30, { align: 'center' });

            doc.setFontSize(10);
            doc.text(`Data: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 38, { align: 'center' });

            if (bets[0].client_name) {
                doc.text(`Cliente: ${bets[0].client_name}`, pageWidth / 2, 44, { align: 'center' });
            }

            // Table
            const tableData = bets.map(b => [
                `#${b.ticket_number || '---'}`,
                b.game || 'Mega Sena',
                `Conc. ${b.concurso}`,
                b.numbers.join(', '),
                `R$ ${b.amount.toFixed(2)}`
            ]);

            autoTable(doc, {
                startY: 50,
                head: [['Bilhete', 'Jogo', 'Concurso', 'Dezenas', 'Valor']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [46, 125, 50] },
                styles: { fontSize: 9 },
                columnStyles: {
                    0: { fontStyle: 'bold' },
                    3: { cellWidth: 50 }
                }
            });

            // Total
            const totalPaid = bets.reduce((acc, b) => acc + b.amount, 0);
            const finalY = (doc as any).lastAutoTable.finalY + 10;

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`Total Pago: R$ ${totalPaid.toFixed(2)}`, pageWidth - 20, finalY, { align: 'right' });

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text('Este comprovante é sua garantia. Boa sorte!', pageWidth / 2, finalY + 20, { align: 'center' });

            doc.save(`comprovante_lucky_${confirmedCartId.slice(0, 8)}.pdf`);

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Erro ao gerar PDF.');
        }
    };

    if (items.length === 0 && !showPix) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2 style={{ marginBottom: '1rem' }}>Seu carrinho está vazio</h2>
                <button onClick={() => navigate('/nova-aposta')} className="btn btn-primary">
                    Voltar para Nova Aposta
                </button>
            </div>
        );
    }

    if (showPix && pixData) {
        return (
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '60px', height: '60px', background: '#e8f5e9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Check size={32} color="var(--primary)" />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Aguardando Pagamento</h3>
                <p style={{ color: 'var(--muted-foreground)', marginBottom: '2rem', textAlign: 'center' }}>
                    Pedido gerado com sucesso! Escaneie o QR Code ou copie o código Pix abaixo.
                </p>

                <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    {pixData.imagemQrcode && (
                        <img
                            src={`data:image/png;base64,${pixData.imagemQrcode}`}
                            alt="Pix QR Code"
                            style={{ width: '200px', height: '200px', border: '1px solid #eee', borderRadius: '8px' }}
                        />
                    )}

                    <button
                        className="btn btn-outline"
                        style={{ gap: '0.5rem' }}
                        onClick={() => {
                            copyPixCode(pixData.qrcode);
                            alert('Código Pix copiado!');
                        }}
                    >
                        <QrCode size={18} />
                        Copiar Código Pix
                    </button>
                </div>

                <div style={{ width: '100%', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: '#999', marginBottom: '2rem', background: '#f5f5f5', padding: '0.5rem', borderRadius: '4px' }}>
                    {pixData.qrcode}
                </div>

                {paymentConfirmed ? (
                    <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                        <div style={{
                            padding: '1rem',
                            background: '#e8f5e9',
                            borderRadius: '8px',
                            color: '#2e7d32',
                            fontWeight: 600,
                            marginBottom: '1rem'
                        }}>
                            Pagamento Identificado!
                        </div>
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', gap: '0.5rem' }}
                            onClick={handleGenerateReceipt}
                        >
                            <Download size={20} />
                            Baixar Comprovante (PDF)
                        </button>
                        <button
                            className="btn btn-outline"
                            style={{ width: '100%', marginTop: '1rem' }}
                            onClick={() => {
                                clearCart();
                                navigate('/minhas-apostas');
                            }}
                        >
                            Ver Minhas Apostas
                        </button>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', color: '#666', fontSize: '0.875rem' }}>
                        <p>Aguardando confirmação automática do banco...</p>
                        <p>A tela atualizará automaticamente assim que o pagamento for identificado.</p>
                        <button
                            className="btn btn-outline"
                            style={{ width: '100%', marginTop: '1.5rem' }}
                            onClick={() => {
                                // Just close the modal/view and return to cart/home, keeping state if they want to pay later?
                                // Actually, navigate to home/my-bets is safer logic for "I'll pay later"
                                navigate('/minhas-apostas');
                            }}
                        >
                            Pagar Depois / Voltar
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ paddingBottom: '2rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '1rem', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <button onClick={() => navigate(-1)} className="btn btn-outline" style={{ padding: '0.5rem' }}>
                    <ArrowLeft size={20} />
                </button>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Finalizar Pedido</h1>
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

                {/* Checkout Fields */}
                <div className="card" style={{ padding: '1.5rem', background: '#fff' }}>
                    <div style={{ marginBottom: '1.5rem', display: 'grid', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                                CPF para Nota / Pix
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={cpf}
                                onChange={(e) => {
                                    let v = e.target.value.replace(/\D/g, '');
                                    if (v.length > 11) v = v.slice(0, 11);
                                    if (v.length > 9) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
                                    else if (v.length > 6) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
                                    else if (v.length > 3) v = `${v.slice(0, 3)}.${v.slice(3)}`;
                                    setCpf(v);
                                }}
                                placeholder="000.000.000-00"
                                maxLength={14}
                                disabled={isSubmitting}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                                Telefone (WhatsApp)
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={phone}
                                onChange={(e) => {
                                    let v = e.target.value.replace(/\D/g, '');
                                    if (v.length > 11) v = v.slice(0, 11);
                                    if (v.length > 10) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
                                    else if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
                                    else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
                                    setPhone(v);
                                }}
                                placeholder="(00) 00000-0000"
                                maxLength={15}
                                disabled={isSubmitting}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                                Chave PIX (Para recebimento de prêmios)
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={pixKey}
                                onChange={(e) => setPixKey(e.target.value)}
                                placeholder="CPF, Email, Telefone ou Chave Aleatória"
                                disabled={isSubmitting}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                            Cupom do Vendedor (Opcional)
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Ticket size={18} style={{ position: 'absolute', left: '10px', top: '12px', color: '#999' }} />
                            <input
                                type="text"
                                className="input"
                                style={{ paddingLeft: '2.5rem', borderColor: couponError ? '#e53935' : undefined }}
                                value={coupon}
                                onChange={(e) => {
                                    setCoupon(e.target.value.toUpperCase());
                                    setCouponError('');
                                }}
                                placeholder="Código do Vendedor"
                                disabled={isSubmitting}
                            />
                        </div>
                        {couponError && <p style={{ color: '#e53935', fontSize: '0.75rem', marginTop: '0.25rem' }}>{couponError}</p>}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Total</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                            R$ {total().toFixed(2)}
                        </span>
                    </div>

                    <button
                        className="btn btn-primary"
                        style={{ width: '100%', gap: '0.5rem', padding: '1rem', fontSize: '1rem' }}
                        onClick={handleCheckout}
                        disabled={isSubmitting || !cpf || !phone || !pixKey || items.length === 0}
                    >
                        {isSubmitting ? <Loader size={20} className="animate-spin" /> : <QrCode size={20} />}
                        {isSubmitting ? 'Processando...' : 'Gerar Pagamento Pix'}
                    </button>
                </div>
            </div>
        </div>
    );
}
