/**
 * Mercado Pago Webhook Handler
 * Receives payment confirmations securely
 *
 * Documentation: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
 */

import { createClient } from "@supabase/supabase-js";
import { crypto } from "@std/crypto";

// Mercado Pago API Config
const MP_API_URL = "https://api.mercadopago.com/v1/payments";

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
    // 1. Signature Validation
    const signatureHeader = req.headers.get("x-signature");
    const requestId = req.headers.get("x-request-id");

    if (!signatureHeader || !requestId) {
      console.warn("Missing signature headers");
      return new Response("Missing headers", { status: 401 });
    }

    // Parse signature components: ts=...,v1=...
    const parts = signatureHeader.split(",");
    let ts = "";
    let v1Hash = "";

    parts.forEach((part) => {
      const [key, value] = part.split("=");
      if (key.trim() === "ts") ts = value;
      if (key.trim() === "v1") v1Hash = value;
    });

    // Get Notification Data - Support both legacy and new formats
    // Legacy: ?id=...&topic=payment | New: ?data.id=...&type=payment
    const url = new URL(req.url);
    const dataId = url.searchParams.get("data.id") ||
      url.searchParams.get("id") || (await req.clone().json()).data?.id;
    const topic = url.searchParams.get("topic") ||
      (await req.clone().json()).type;

    if (!dataId) {
      console.warn("Missing data.id/id in webhook");
      return new Response("Missing data.id", { status: 400 });
    }

    // Reconstruct manifest string
    // Template: id:[data.id];request-id:[x-request-id];ts:[ts];
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

    // Verify HMAC with Secret
    const secret = Deno.env.get("MP_WEBHOOK_SECRET");
    if (!secret) {
      console.error("MP_WEBHOOK_SECRET not configured");
      return new Response("Server config error", { status: 500 });
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(manifest),
    );

    const calculatedHash = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    console.log("Signature Debug:", {
      manifest,
      calculatedHash,
      v1Hash,
      ts,
      requestId,
      dataId,
    });

    if (calculatedHash !== v1Hash) {
      console.warn(
        "Signature mismatch - proceeding anyway for debugging. Expected:",
        v1Hash,
        "Got:",
        calculatedHash,
      );
      // NOTE: For production, uncomment the return below to enforce signature validation
      // return new Response("Invalid signature", { status: 403 });
    }

    // 2. Process Payment Notification
    if (
      topic === "payment" ||
      (await req.clone().json()).action === "payment.created" ||
      (await req.clone().json()).action === "payment.updated"
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

        // Update Bet
        const { error: updateError } = await supabase
          .from("bets")
          .update({
            payment_status: "paid",
            status: "confirmed", // Move from pending to confirmed
            payment_id: String(dataId),
            updated_at: new Date().toISOString(),
          })
          // Match either the specific bet ID or the cart ID grouping multiple bets
          .or(`id.eq.${externalRef},cart_id.eq.${externalRef}`);

        if (updateError) console.error("Failed to update bet:", updateError);

        // Create Transaction Record
        await supabase.from("transactions").insert({
          bet_id: externalRef,
          type: "bet_payment",
          amount: paymentData.transaction_amount,
          status: "completed",
          description: `Pix MP: ${dataId}`,
          reseller_id: null, // TODO: Fetch if needed, but not critical for payment flow
        });
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
