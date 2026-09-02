/**
 * Mercado Pago PIX Integration
 * Supabase Edge Function for secure server-side PIX operations
 *
 * Documentation: https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/integration-configuration/integrate-pix
 */

import { createClient } from "@supabase/supabase-js";

// Types corresponding to the client request
interface PixChargeRequest {
  amount: number;
  description?: string;
  betId?: string;
  payer: {
    email: string;
    firstName?: string;
    identification: {
      type: string; // 'CPF' or 'CNPJ'
      number: string;
    };
  };
}

// Mercado Pago API Config
const MP_API_URL = "https://api.mercadopago.com/v1/payments";

Deno.serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json() as PixChargeRequest;
    const { amount, description, betId, payer } = payload;

    // Basic validation
    if (!amount || amount <= 0) {
      throw new Error("Invalid amount");
    }
    if (!payer || !payer.email || !payer.identification) {
      throw new Error("Missing payer information (Email and CPF are required)");
    }

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- SECURITY: SERVER_SIDE VALIDATION ---

    if (!betId) {
      throw new Error("betId is required for security validation");
    }

    // 1. Fetch Bet Data - Try cart_id first (batch bets), then single bet id
    let bets: {
      numbers: number[];
      client_cpf: string | null;
      amount: number;
    }[] = [];
    let isCartPayment = false;

    // First, try to find bets by cart_id (for batch payments)
    const { data: cartBets, error: cartError } = await supabase
      .from("bets")
      .select("id, numbers, client_cpf, amount")
      .eq("cart_id", betId);

    if (!cartError && cartBets && cartBets.length > 0) {
      bets = cartBets;
      isCartPayment = true;
      console.log(`Found ${bets.length} bets in cart ${betId}`);
    } else {
      // Fallback: try single bet id
      const { data: singleBet, error: betError } = await supabase
        .from("bets")
        .select("id, numbers, client_cpf, amount")
        .eq("id", betId)
        .single();

      if (betError || !singleBet) {
        console.error("Bet lookup failed:", { cartError, betError, betId });
        throw new Error("Bet not found or invalid");
      }
      bets = [singleBet];
    }

    // Use first bet for CPF validation
    const firstBet = bets[0];

    // 2. Validate CPF (if provided in payload)
    // Ensure the person paying matches the bet owner (Anti-money laundering / Consistency)
    const payloadCpf = payer.identification.number.replace(/\D/g, "");
    const betCpf = firstBet.client_cpf
      ? firstBet.client_cpf.replace(/\D/g, "")
      : "";

    // Política: por padrão o pagador PODE ser diferente do titular -- é comum
    // alguém pagar a aposta de outra pessoa --, mas a divergência é sempre
    // registrada para conciliação. Onde a regra de negócio exigir coincidência
    // (prevenção à lavagem), basta definir a env PIX_REQUIRE_MATCHING_CPF=true
    // na Edge Function, sem alterar código.
    if (betCpf && payloadCpf !== betCpf) {
      console.warn(`CPF Mismatch: Payload ${payloadCpf} vs Bet ${betCpf}`);
      if (Deno.env.get("PIX_REQUIRE_MATCHING_CPF") === "true") {
        throw new Error("CPF do pagador difere do titular da aposta");
      }
    }

    // 3. Calculate Correct Price (Server-Side)
    // For cart payments, sum all bet prices validated against bet_pricing table
    let validatedAmount = 0;

    for (const bet of bets) {
      const numberCount = bet.numbers.length;

      // Fetch official pricing from DB
      const { data: pricing, error: priceError } = await supabase
        .from("bet_pricing")
        .select("price")
        .eq("number_count", numberCount)
        .single();

      if (priceError || !pricing) {
        console.error("Pricing not found for count:", numberCount);
        throw new Error(`Invalid number count: ${numberCount}`);
      }

      validatedAmount += Number(pricing.price);
    }

    console.log(
      `Security: Validated total amount for ${bets.length} bets is R$ ${validatedAmount}`,
    );

    // Generate Idempotency Key
    const idempotencyKey = `bet_${betId}`;

    // Construct Mercado Pago Request Body using VALIDATED AMOUNT
    const mpPayload = {
      transaction_amount: Number(validatedAmount.toFixed(2)),
      description: description ||
        `Aposta LuckyClover (${bets.length} jogos)`,
      payment_method_id: "pix",
      payer: {
        email: payer.email,
        first_name: payer.firstName || "Cliente",
        identification: {
          type: payer.identification.type,
          number: payloadCpf,
        },
      },
      notification_url: `${
        Deno.env.get("SUPABASE_URL")
      }/functions/v1/pix-webhook`, // Callback URL
      external_reference: betId, // Link to our internal ID
      date_of_expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiration
    };

    console.log(
      "Sending request to Mercado Pago:",
      JSON.stringify(mpPayload, null, 2),
    );

    // Get Access Token from Secret
    const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!accessToken) {
      throw new Error("MP_ACCESS_TOKEN not configured in Supabase");
    }

    const response = await fetch(MP_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(mpPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Mercado Pago Error:", data);

      // Handle specific MP errors for better feedback
      const errorMessage = data.message ||
        "Failed to create payment at Mercado Pago";
      const errorDetails = data.cause?.map((c: { description?: string }) =>
        c.description
      ).join(", ") || "";

      throw new Error(`${errorMessage}: ${errorDetails}`);
    }

    // --- PERSIST TO DATABASE ---
    if (betId) {
      try {
        // Update all bets with the payment_id - use cart_id or single bet id
        const updateData = {
          payment_id: String(data.id),
          client_cpf: payer.identification.number.replace(/\D/g, ""),
          client_email: payer.email,
          updated_at: new Date().toISOString(),
        };

        let dbError;
        if (isCartPayment) {
          // Update all bets in the cart
          const { error } = await supabase
            .from("bets")
            .update(updateData)
            .eq("cart_id", betId);
          dbError = error;
        } else {
          // Update single bet
          const { error } = await supabase
            .from("bets")
            .update(updateData)
            .eq("id", betId);
          dbError = error;
        }

        if (dbError) {
          console.warn(
            "Recoverable Error: Failed to update bet(s) in database with payment_id:",
            dbError,
          );
          // We don't throw here because the payment WAS created in MP, we want to return the ID to the user
        } else {
          console.log(
            `Successfully updated ${
              isCartPayment ? "cart" : "bet"
            } with payment_id:`,
            data.id,
          );
        }
      } catch (dbErr) {
        console.error("Database update error (ignored):", dbErr);
      }
    }

    // Successful response - Map to our frontend expected format
    // We return the raw MP data structure plus our simplified view
    return new Response(
      JSON.stringify({
        success: true,
        paymentId: data.id,
        status: data.status,
        // These fields are needed for the Status Screen Brick or manual display
        qrCode: {
          qrcode: data.point_of_interaction?.transaction_data?.qr_code,
          imagemQrcode: data.point_of_interaction?.transaction_data
            ?.qr_code_base64,
          ticketUrl: data.point_of_interaction?.transaction_data?.ticket_url,
        },
        original: data, // Return full data for debugging/bricks
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("PIX Function Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
