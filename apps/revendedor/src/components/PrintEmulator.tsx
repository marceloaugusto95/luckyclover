/**
 * Component to emulate a physical thermal ticket in the browser.
 */

interface PrintEmulatorProps {
    content: string;
    onClose: () => void;
}

export function PrintEmulator({ content, onClose }: PrintEmulatorProps) {
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: '2rem',
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                background: '#fff',
                width: '300px', // Emulates 58mm paper width
                padding: '2rem 1rem 4rem',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: '1.2',
                color: '#1a1a1a',
                whiteSpace: 'pre-wrap',
                position: 'relative',
                transform: 'rotate(-0.5deg)', // Subtle "paper" effect
            }}>
                {/* Paper slots/texture effects */}
                <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: 0,
                    right: 0,
                    height: '20px',
                    background: 'repeating-linear-gradient(90deg, #fff, #fff 10px, #eee 10px, #eee 12px)',
                    boxShadow: 'inset 0 -5px 5px rgba(0,0,0,0.05)'
                }} />

                <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#999', display: 'block', marginBottom: '1rem' }}>
                        --- SIMULAÇÃO DE IMPRESSÃO ---
                    </span>
                    {content}
                </div>

                {/* Bottom serrated edge effect */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '10px',
                    background: 'linear-gradient(-45deg, transparent 5px, white 5px), linear-gradient(45deg, transparent 5px, white 5px)',
                    backgroundSize: '10px 10px'
                }} />
            </div>

            <button
                onClick={onClose}
                className="btn"
                style={{
                    marginTop: '2rem',
                    background: '#fff',
                    color: '#333',
                    padding: '0.75rem 2rem'
                }}
            >
                Fechar Visualização
            </button>
            <p style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '1rem' }}>
                Este bilhete física será impresso automaticamente na Stone T6900.
            </p>
        </div>
    );
}
