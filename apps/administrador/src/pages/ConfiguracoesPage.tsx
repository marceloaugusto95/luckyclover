import { useState, useEffect } from 'react';
import { supabase, updateSystemSettings } from '../lib/supabase';
import { Lock, Unlock, Loader2, PieChart, Save, Phone } from 'lucide-react';

export default function ConfiguracoesPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Betting Lock State
    const [manualLock, setManualLock] = useState(false);
    const [lockMessage, setLockMessage] = useState('');

    // Prize Distribution State
    const [prizeSettings, setPrizeSettings] = useState({ sena: 0.70, quina: 0.30 });
    const [prizeMessage, setPrizeMessage] = useState('');

    // Support Phone State
    const [supportPhone, setSupportPhone] = useState('');
    const [phoneMessage, setPhoneMessage] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        const { data: lockData } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'betting_lock')
            .single();

        if (lockData) {
            setManualLock(lockData.value.manual_lock || false);
        }

        const { data: prizeData } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'prize_distribution')
            .single();

        if (prizeData) {
            setPrizeSettings({
                sena: prizeData.value.sena || 0.70,
                quina: prizeData.value.quina || 0.30
            });
        }

        const { data: phoneData } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'support_phone')
            .single();

        if (phoneData && phoneData.value.number) {
            setSupportPhone(phoneData.value.number);
        }

        setLoading(false);
    };

    const handleLockToggle = async () => {
        setSaving(true);
        setLockMessage('');
        const newValue = !manualLock;

        const result = await updateSystemSettings('betting_lock', { manual_lock: newValue });

        if (!result.success) {
            setLockMessage('Erro ao salvar: ' + result.error);
        } else {
            setManualLock(newValue);
            setLockMessage(newValue ? 'Apostas bloqueadas com sucesso.' : 'Apostas liberadas com sucesso.');
        }
        setSaving(false);
    };

    const handlePrizeSave = async () => {
        setSaving(true);
        setPrizeMessage('');

        // Validate
        if (Math.abs((prizeSettings.sena + prizeSettings.quina) - 1.0) > 0.01) {
            setPrizeMessage('A soma das porcentagens deve ser 100% (1.0)');
            setSaving(false);
            return;
        }

        const result = await updateSystemSettings('prize_distribution', prizeSettings);

        if (!result.success) {
            setPrizeMessage('Erro ao salvar: ' + result.error);
        } else {
            setPrizeMessage('Configuração de prêmios salva com sucesso!');
        }
        setSaving(false);
    };

    const handlePhoneSave = async () => {
        setSaving(true);
        setPhoneMessage('');

        const cleanPhone = supportPhone.replace(/\D/g, '');
        if (cleanPhone.length < 10) {
            setPhoneMessage('Número de telefone inválido.');
            setSaving(false);
            return;
        }

        const result = await updateSystemSettings('support_phone', { number: cleanPhone });

        if (!result.success) {
            setPhoneMessage('Erro ao salvar: ' + result.error);
        } else {
            setPhoneMessage('Telefone de suporte salvo com sucesso!');
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    return (
        <div>
            {/* Betting Lock Section */}
            <div className="card" style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Lock size={18} /> Controle de Apostas
                </h2>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    background: manualLock ? '#ffebee' : '#f1f8e9',
                    border: `1px solid ${manualLock ? '#ef9a9a' : '#c5e1a5'}`,
                    borderRadius: '8px'
                }}>
                    <div>
                        <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '0.25rem' }}>
                            {manualLock ? 'Apostas Suspensas' : 'Apostas Liberadas'}
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                            {manualLock
                                ? 'Nenhum cliente pode realizar novas apostas no momento.'
                                : 'O sistema está aceitando apostas normalmente (respeitando o horário das 20h nos dias de sorteio).'}
                        </p>
                    </div>

                    <button
                        onClick={handleLockToggle}
                        disabled={saving}
                        className={`btn ${manualLock ? 'btn-primary' : 'btn-outline'}`}
                        style={{
                            background: manualLock ? '#e53935' : 'white',
                            borderColor: manualLock ? '#e53935' : 'var(--primary)',
                            color: manualLock ? 'white' : 'var(--primary)',
                            width: '140px'
                        }}
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : (
                            manualLock ? <><Unlock size={16} /> Liberar</> : <><Lock size={16} /> Bloquear</>
                        )}
                    </button>
                </div>

                {lockMessage && (
                    <p style={{
                        marginTop: '1rem',
                        fontSize: '0.9rem',
                        color: manualLock ? '#d32f2f' : '#388e3c',
                        textAlign: 'center',
                        fontWeight: 600
                    }}>
                        {lockMessage}
                    </p>
                )}
            </div>

            {/* Prize Distribution Section */}
            <div className="card">
                <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <PieChart size={18} /> Distribuição de Prêmios
                </h2>

                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
                    Defina a porcentagem do prêmio líquido (70% das vendas) destinada a cada faixa.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Sena (%)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            className="input"
                            style={{ width: '100%' }}
                            value={prizeSettings.sena}
                            onChange={(e) => setPrizeSettings(prev => ({ ...prev, sena: parseFloat(e.target.value) }))}
                        />
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                            {(prizeSettings.sena * 100).toFixed(0)}% do prêmio
                        </p>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Quina (%)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            className="input"
                            style={{ width: '100%' }}
                            value={prizeSettings.quina}
                            onChange={(e) => setPrizeSettings(prev => ({ ...prev, quina: parseFloat(e.target.value) }))}
                        />
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                            {(prizeSettings.quina * 100).toFixed(0)}% do prêmio
                        </p>
                    </div>
                </div>

                {prizeMessage && (
                    <p style={{
                        marginBottom: '1rem',
                        fontSize: '0.9rem',
                        color: prizeMessage.includes('sucesso') ? '#388e3c' : '#d32f2f',
                        textAlign: 'center',
                        fontWeight: 600
                    }}>
                        {prizeMessage}
                    </p>
                )}

                <button
                    onClick={handlePrizeSave}
                    disabled={saving}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : (
                        <><Save size={16} /> Salvar Alterações</>
                    )}
                </button>
            </div>

            {/* Support Phone Section */}
            <div className="card" style={{ marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Phone size={18} /> Contato de Suporte
                </h2>

                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
                    Defina o número de WhatsApp que os clientes e revendedores usarão para contato (ex: Esqueci a Senha).
                </p>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Número do WhatsApp</label>
                    <input
                        type="text"
                        className="input"
                        style={{ width: '100%', maxWidth: '300px' }}
                        value={supportPhone}
                        onChange={(e) => setSupportPhone(e.target.value)}
                        placeholder="Ex: 5581900000000"
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                        Insira apenas números (incluindo DDI e DDD, ex: 55 para o Brasil).
                    </p>
                </div>

                {phoneMessage && (
                    <p style={{
                        marginBottom: '1rem',
                        fontSize: '0.9rem',
                        color: phoneMessage.includes('sucesso') ? '#388e3c' : '#d32f2f',
                        textAlign: 'left',
                        fontWeight: 600
                    }}>
                        {phoneMessage}
                    </p>
                )}

                <button
                    onClick={handlePhoneSave}
                    disabled={saving}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : (
                        <><Save size={16} /> Salvar Telefone</>
                    )}
                </button>
            </div>
        </div>
    );
}
