/**
 * Mercado Pago Webhook Handler
 * Receives payment confirmations securely
 *
 * Documentation: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Usa o crypto global do Deno (Web Crypto): dispensa import map no deploy.

// Mercado Pago API Config
const MP_API_URL = "https://api.mercadopago.com/v1/payments";

// Tolerância de centavos na comparação do valor pago.
const AMOUNT_EPSILON = 0.01;

/** Comparação de hashes em tempo constante (evita ataque de temporização). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacHex(secret: string, manifest: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Corpo lido UMA vez (o Request só pode ser consumido uma vez).
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // 1. Signature Validation
    const signatureHeader = req.headers.get("x-signature");
    const requestId = req.headers.get("x-request-id");

    if (!signatureHeader || !requestId) {
      console.warn("Missing signature headers");
      return new Response("Missing headers", { status: 401 });
    }

    // Parse signature components: ts=...,v1=...
    // Usa o primeiro "=" como separador: o valor pode conter "=".
    let ts = "";
    let v1Hash = "";
    for (const part of signatureHeader.split(",")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key === "ts") ts = value;
      if (key === "v1") v1Hash = value;
    }

    if (!ts || !v1Hash) {
      console.warn("Malformed x-signature header");
      return new Response("Invalid signature", { status: 403 });
    }

    // Get Notification Data - Support both legacy and new formats
    // Legacy: ?id=...&topic=payment | New: ?data.id=...&type=payment
    const url = new URL(req.url);
    const bodyData = body.data as { id?: string | number } | undefined;
    const dataId = url.searchParams.get("data.id") ||
      url.searchParams.get("id") ||
      (bodyData?.id !== undefined ? String(bodyData.id) : null);
    const topic = url.searchParams.get("topic") || (body.type as string);
    const action = body.action as string | undefined;

    if (!dataId) {
      console.warn("Missing data.id/id in webhook");
      return new Response("Missing data.id", { status: 400 });
    }

    // Verify HMAC with Secret
    const secret = Deno.env.get("MP_WEBHOOK_SECRET");
    if (!secret) {
      console.error("MP_WEBHOOK_SECRET not configured");
      return new Response("Server config error", { status: 500 });
    }

    // Template do manifesto: id:[data.id];request-id:[x-request-id];ts:[ts];
    // O Mercado Pago exige o id em minúsculas quando ele é alfanumérico, então
    // aceitamos as duas formas antes de rejeitar.
    const candidates = [dataId, dataId.toLowerCase()];
    let signatureOk = false;
    for (const id of candidates) {
      const manifest = `id:${id};request-id:${requestId};ts:${ts};`;
      const calculated = await hmacHex(secret, manifest);
      if (timingSafeEqual(calculated, v1Hash.toLowerCase())) {
        signatureOk = true;
        break;
      }
    }

    // SEGURANÇA: assinatura inválida encerra o processamento.
    // (Antes isto apenas registrava um aviso e seguia adiante.)
    if (!signatureOk) {
      console.warn("Invalid webhook signature", { requestId, dataId });
      return new Response("Invalid signature", { status: 403 });
    }

    // 2. Process Payment Notification
    if (
      topic === "payment" ||
      action === "payment.created" ||
      action === "payment.updated"
    ) {
      console.log(`Processing payment ID: ${dataId}`);

      // Fetch latest status from Mercado Pago to be sure
      const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
      const paymentRes = await fetch(`${MP_API_URL}/${dataId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });

      if (!paymentRes.ok) {
        throw new Error("Failed to fetch payment details from MP");
      }

      const paymentData = await paymentRes.json();
      const externalRef = paymentData.external_reference; // This is our betId
      const status = paymentData.status;
      const paidAmount = Number(paymentData.transaction_amount);

      if (!externalRef) {
        console.log("No external reference (betId) found. Skipping.");
        return new Response("OK", { status: 200 });
      }

      // Initialize Supabase
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      if (status === "approved") {
        console.log(`Payment approved for bet ${externalRef}`);

        // --- Seleção das apostas cobertas por este pagamento ---
        // Preferimos o payment_id, gravado nas apostas no momento da cobrança:
        // esse conjunto é imutável depois de emitido o PIX. O cart_id, por ser
        // gerado no cliente, permitia inserir apostas novas no mesmo carrinho
        // depois da cobrança e recebê-las confirmadas de graça.
        let bets: {
          id: string;
          numbers: number[];
          payment_status: string | null;
        }[] = [];

        const { data: byPaymentId } = await supabase
          .from("bets")
          .select("id, numbers, payment_status")
          .eq("payment_id", String(dataId));

        if (byPaymentId && byPaymentId.length > 0) {
          bets = byPaymentId;
        } else {
          // Fallback: a gravação do payment_id na cobrança é best-effort e pode
          // ter falhado. A conferência de valor abaixo continua protegendo.
          const { data: byRef } = await supabase
            .from("bets")
            .select("id, numbers, payment_status")
            .or(`id.eq.${externalRef},cart_id.eq.${externalRef}`);
          bets = byRef ?? [];
        }

        if (bets.length === 0) {
          console.error("No bets matched for payment", { dataId, externalRef });
          return new Response("OK", { status: 200 });
        }

        // --- Conferência do valor pago contra o preço oficial ---
        const { data: pricingRows, error: pricingError } = await supabase
          .from("bet_pricing")
          .select("number_count, price, is_active");

        if (pricingError || !pricingRows) {
          console.error("Failed to load bet_pricing:", pricingError);
          throw new Error("Pricing table unavailable");
        }

        const priceByCount = new Map<number, number>();
        for (const row of pricingRows) {
          // Havendo duplicidade por number_count, a linha ativa prevalece.
          if (!priceByCount.has(row.number_count) || row.is_active) {
            priceByCount.set(row.number_count, Number(row.price));
          }
        }

        let expectedAmount = 0;
        for (const bet of bets) {
          const price = priceByCount.get(bet.numbers.length);
          if (price === undefined) {
            console.error("No price for number_count", bet.numbers.length);
            throw new Error("Pricing missing for bet");
          }
          expectedAmount += price;
        }

        if (Math.abs(expectedAmount - paidAmount) > AMOUNT_EPSILON) {
          // Divergência = tentativa de confirmar mais apostas do que foi pago.
          console.error("Payment amount mismatch - NOT confirming bets", {
            dataId,
            externalRef,
            paidAmount,
            expectedAmount,
            betCount: bets.length,
          });
          return new Response(
            JSON.stringify({ success: false, reason: "amount_mismatch" }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // Confirma apenas os ids conferidos, e só os que ainda não estão pagos
        // (torna o reprocessamento da notificação idempotente).
        const toConfirm = bets
          .filter((b) => b.payment_status !== "paid")
          .map((b) => b.id);

        if (toConfirm.length === 0) {
          console.log("Bets already confirmed, nothing to do.", { dataId });
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: updateError } = await supabase
          .from("bets")
          .update({
            payment_status: "paid",
            status: "confirmed", // Move from pending to confirmed
            payment_id: String(dataId),
            updated_at: new Date().toISOString(),
          })
          .in("id", toConfirm);

        if (updateError) {
          console.error("Failed to update bet:", updateError);
        } else {
          console.log(`Confirmed ${toConfirm.length} bet(s) for ${dataId}`);

          // Create Transaction Record (só quando houve confirmação de fato)
          await supabase.from("transactions").insert({
            bet_id: externalRef,
            type: "bet_payment",
            amount: paidAmount,
            status: "completed",
            description: `Pix MP: ${dataId}`,
            reseller_id: null, // TODO: Fetch if needed, but not critical for payment flow
          });
        }
      } else if (status === "cancelled" || status === "rejected") {
        console.log(`Payment cancelled/rejected for bet ${externalRef}`);
        // Optionally mark bet as lost/cancelled
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
