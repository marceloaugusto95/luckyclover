import { useState, useEffect } from 'react';
import PrivacyPolicyModal from './PrivacyPolicyModal';

const CONSENT_KEY = 'lucky_cookie_consent';

/**
 * Banner de aviso de cookies/LGPD. Aparece até o usuário aceitar.
 * A escolha é guardada no dispositivo (localStorage).
 */
export default function CookieConsentBanner() {
    const [visible, setVisible] = useState(false);
    const [showPolicy, setShowPolicy] = useState(false);

    useEffect(() => {
        try {
            if (localStorage.getItem(CONSENT_KEY) !== '1') setVisible(true);
        } catch {
            setVisible(true);
        }
    }, []);

    const accept = () => {
        try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* ignore */ }
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <>
            <div
                role="dialog"
                aria-label="Aviso de cookies e privacidade"
                style={{
                    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1500,
                    background: '#1a472a', color: '#fff',
                    padding: '1rem', boxShadow: '0 -2px 12px rgba(0,0,0,0.25)'
                }}
            >
                <div style={{
                    maxWidth: '760px', margin: '0 auto',
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                    gap: '0.75rem', justifyContent: 'space-between'
                }}>
                    <p style={{ fontSize: '0.85rem', lineHeight: 1.5, margin: 0, flex: '1 1 260px' }}>
                        Usamos armazenamento local essencial (para manter seu login) e tratamos seus dados
                        conforme a LGPD para realizar apostas, sorteios e pagamentos.{' '}
                        <button
                            onClick={() => setShowPolicy(true)}
                            style={{ background: 'none', border: 'none', color: '#ffe082', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: '0.85rem' }}
                        >
                            Saiba mais
                        </button>.
                    </p>
                    <button
                        onClick={accept}
                        className="btn"
                        style={{ background: '#fff', color: '#1a472a', fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                        Aceitar
                    </button>
                </div>
            </div>

            <PrivacyPolicyModal isOpen={showPolicy} onClose={() => setShowPolicy(false)} />
        </>
    );
}
