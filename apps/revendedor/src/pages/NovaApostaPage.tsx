import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, ShoppingCart, Gift as GiftIcon } from 'lucide-react';
import { getPriceForCount, checkBettingLock, getBetPricing } from '../lib/supabase';
import { getMegaSenaResult } from '../lib/mega-sena';
import { useCartStore } from '../lib/cartStore';

export default function NovaApostaPage() {
    const navigate = useNavigate();
    const { addItem, items, total } = useCartStore();

    const MIN_NUMBERS = 10;
    const MAX_NUMBERS = 25;
    const TOTAL_NUMBERS = 60;

    const [allowedCounts, setAllowedCounts] = useState<number[]>([]);
    const [currentConcurso, setCurrentConcurso] = useState<number>(0);
    const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
    const [price, setPrice] = useState(0);
    const [lockInfo, setLockInfo] = useState<{ locked: boolean; message?: string }>({ locked: false });
    const [loadingPricing, setLoadingPricing] = useState(true);


    useEffect(() => {
        getMegaSenaResult().then(res => {
            setCurrentConcurso(res.proximoConcurso);
        });
        checkBettingLock().then(setLockInfo);
        getBetPricing().then(data => {
            const active = data.filter(p => p.is_active).map(p => p.number_count);
            setAllowedCounts(active);
            setLoadingPricing(false);
        });
    }, []);

    // Update price when selection changes
    useEffect(() => {
        if (allowedCounts.includes(selectedNumbers.length)) {
            getPriceForCount(selectedNumbers.length).then(setPrice);
        } else {
            setPrice(0);
        }
    }, [selectedNumbers, allowedCounts]);


    const toggleNumber = (num: number) => {
        if (selectedNumbers.includes(num)) {
            setSelectedNumbers(selectedNumbers.filter(n => n !== num));
        } else if (selectedNumbers.length < MAX_NUMBERS) {
            setSelectedNumbers([...selectedNumbers, num].sort((a, b) => a - b));
        }
    };

    const handleAddToCart = () => {
        if (!allowedCounts.includes(selectedNumbers.length)) {
            alert(`Selecione uma quantidade válida: ${allowedCounts.join(', ')}`);
            return;
        }

        addItem({
            game: 'Mega Sena',
            numbers: selectedNumbers,
            amount: price,
            concurso: currentConcurso
        });

        // Reset selection 
        setSelectedNumbers([]);
        setPrice(0);
    };

    return (
        <div style={{ paddingBottom: '10rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <button onClick={() => navigate(-1)} className="btn btn-outline" style={{ padding: '0.5rem' }}>
                    <ArrowLeft size={20} />
                </button>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Nova Aposta</h1>
            </div>

            {/* Surpresinha (Random Pick) */}
            <div className="card" style={{ marginBottom: '1rem', background: '#fff7ed', border: '1px solid #fed7aa' }}>
                {currentConcurso > 0 && (
                    <div style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--primary)',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                    }}>
                        # CONCURSO {currentConcurso}
                    </div>
                )}
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#000000ff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <GiftIcon color='darkorange' size={18} /> Surpresinha
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {loadingPricing ? (
                        <span style={{ color: '#9a3412', fontSize: '0.8rem' }}>Carregando...</span>
                    ) : allowedCounts.length === 0 ? (
                        <span style={{ color: '#dc2626', fontSize: '0.8rem' }}>Nenhuma quantidade disponível no momento.</span>
                    ) : (
                        allowedCounts.map(count => (
                            <button
                                key={count}
                                onClick={() => {
                                    const newNumbers = new Set<number>();
                                    while (newNumbers.size < count) {
                                        newNumbers.add(Math.floor(Math.random() * TOTAL_NUMBERS) + 1);
                                    }
                                    setSelectedNumbers(Array.from(newNumbers).sort((a, b) => a - b));
                                }}
                                className="btn"
                                style={{
                                    flex: '1 1 auto',
                                    fontSize: '0.8rem',
                                    padding: '0.4rem',
                                    background: '#fff',
                                    border: '1px solid #fed7aa',
                                    color: '#ea580c'
                                }}
                            >
                                {count}
                            </button>
                        ))
                    )}
                </div>
                <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#9a3412' }}>
                    Clique em um número para gerar uma aposta aleatória.
                </p>
            </div>

            {lockInfo.locked && (
                <div style={{
                    padding: '1rem',
                    background: '#ffebee',
                    border: '1px solid #ef9a9a',
                    borderRadius: '8px',
                    color: '#c62828',
                    fontWeight: 600,
                    marginBottom: '1.5rem',
                    textAlign: 'center'
                }}>
                    {lockInfo.message}
                </div>
            )}


            {/* Number Selection */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Selecione {MIN_NUMBERS} a {MAX_NUMBERS} números</span>
                    <span style={{ color: !allowedCounts.includes(selectedNumbers.length) ? '#e53935' : 'var(--primary)', fontWeight: 700 }}>
                        {selectedNumbers.length} selecionados
                    </span>
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem' }}>
                    {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map((num) => {
                        const isSelected = selectedNumbers.includes(num);
                        return (
                            <button
                                key={num}
                                onClick={() => toggleNumber(num)}
                                style={{
                                    aspectRatio: '1',
                                    borderRadius: '50%',
                                    border: isSelected ? '2px solid var(--primary)' : '1px solid #ddd',
                                    background: isSelected ? 'var(--primary)' : '#fff',
                                    color: isSelected ? '#fff' : '#333',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontSize: '0.85rem'
                                }}
                            >
                                {num.toString().padStart(2, '0')}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Current Selection Summary (Add to Cart) */}
            <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Aposta Atual
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span>Valor: <strong>R$ {price.toFixed(2)}</strong></span>
                    <span style={{ fontSize: '0.8rem', color: '#666' }}>({selectedNumbers.length} dezenas)</span>
                </div>

                <button
                    className="btn btn-outline"
                    style={{ width: '100%', gap: '0.5rem' }}
                    onClick={handleAddToCart}
                    disabled={!allowedCounts.includes(selectedNumbers.length) || lockInfo.locked}
                >
                    <Plus size={20} />
                    Adicionar ao Carrinho
                </button>

                {!allowedCounts.includes(selectedNumbers.length) && selectedNumbers.length > 0 && (
                    <p style={{ textAlign: 'center', color: '#e53935', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                        Quantidade inválida ({allowedCounts.join(', ')})
                    </p>
                )}
            </div>

            {/* Checkout / Cart Button */}
            {items.length > 0 && (
                <div className="card" style={{ marginTop: '1rem', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ fontWeight: 700 }}>Total do Carrinho</span>
                        <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.2rem' }}>R$ {total().toFixed(2)}</span>
                    </div>
                    <button
                        onClick={() => navigate('/checkout')}
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <ShoppingCart size={20} />
                        <span>Finalizar Pedido ({items.length})</span>
                    </button>
                </div>
            )}
        </div>
    );
}
