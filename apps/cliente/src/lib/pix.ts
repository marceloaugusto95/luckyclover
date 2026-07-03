/**
 * PIX Service Client
 * Connects to Supabase Edge Functions for PIX operations
 */

// Use environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://demo.luckyclover.local';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key';

export interface PixChargeResponse {
    success: boolean;
    paymentId?: string; // Mercado Pago ID
    status?: string;
    qrCode?: {
        qrcode: string;
        imagemQrcode: string;
        ticketUrl: string;
    };
    error?: string;
}

/**
 * Create a PIX charge for bet payment (Mercado Pago updated)
 * @param amount - Amount in BRL
 * @param betId - Bet ID for reference
 * @param description - Payment description
 * @param payer - Payer information (Required for MP)
 */
export async function createPixCharge(
    amount: number,
    betId: string,
    description: string,
    payer: {
        email: string;
        identification: {
            type: string;
            number: string;
        };
    } = {
            email: 'cliente@luckyclover.app', // Default if not provided
            identification: { type: 'CPF', number: '00000000000' } // Will cause error if not updated by caller
        }
): Promise<PixChargeResponse> {
    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/pix-create-charge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                amount,
                betId,
                description: description || `Aposta LuckyClover - R$ ${amount.toFixed(2)}`,
                payer
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create PIX charge');
        }

        return data;
    } catch (error) {
        console.error('PIX charge error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Copy PIX code to clipboard
 */
export async function copyPixCode(pixCode: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(pixCode);
        return true;
    } catch {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = pixCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
    }
}
