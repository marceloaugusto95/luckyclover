/**
 * Sync Concursos Edge Function
 * Fetches data from official Mega-Sena API and syncs with database
 *
 * API: https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena
 *
 * This function:
 * 1. Fetches the latest Mega-Sena contest from Caixa API
 * 2. Creates/updates the contest in our database
 * 3. Closes old contests and opens new ones
 * 4. Determines winners when results are available
 */

import { createClient } from "@supabase/supabase-js";

const MEGASENA_API =
  "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena";

interface MegaSenaResponse {
  numero: number;
  dataApuracao: string;
  listaDezenas: string[];
  valorAcumuladoProximoConcurso: number;
  valorEstimadoProximoConcurso: number;
  acumulado: boolean;
  listaRateioPremio?: {
    descricaoFaixa: string;
    faixa: number;
    numeroDeGanhadores: number;
    valorPremio: number;
  }[];
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
    console.log("Starting concursos sync...");

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch latest Mega-Sena data from Caixa API
    const response = await fetch(MEGASENA_API, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "LuckyCloverDaSorte/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Mega-Sena API: ${response.status}`);
    }

    const data: MegaSenaResponse = await response.json();
    console.log(`Fetched concurso ${data.numero} from Mega-Sena API`);

    // Parse drawn numbers
    const drawnNumbers = data.listaDezenas.map((n) => parseInt(n, 10));

    // Parse draw date (format: DD/MM/YYYY)
    const [day, month, year] = data.dataApuracao.split("/");
    const drawDate = `${year}-${month}-${day}`;

    // Get prize values from API response
    const senarPrize = data.listaRateioPremio?.find((p) =>
      p.faixa === 1
    )?.valorPremio || 0;
    const quinaPrize = data.listaRateioPremio?.find((p) =>
      p.faixa === 2
    )?.valorPremio || 0;

    // Check if this contest already exists
    const { data: existingConcurso } = await supabase
      .from("concursos")
      .select("id, status, drawn_numbers")
      .eq("concurso_number", data.numero)
      .single();

    if (existingConcurso) {
      // Update existing contest with results if not already closed
      if (existingConcurso.status !== "closed" && drawnNumbers.length === 6) {
        console.log(`Closing concurso ${data.numero} with results`);

        const { error: updateError } = await supabase
          .from("concursos")
          .update({
            status: "closed",
            drawn_numbers: drawnNumbers,
            prize_pool_sena: senarPrize,
            prize_pool_quina: quinaPrize,
            accumulated_sena: data.acumulado
              ? data.valorAcumuladoProximoConcurso
              : 0,
            updated_at: new Date().toISOString(),
          })
          .eq("concurso_number", data.numero);

        if (updateError) {
          console.error("Error updating concurso:", updateError);
        }

        // Process winners
        await processWinners(supabase, data.numero, drawnNumbers);
      }
    } else {
      // Create new contest entry (usually from previous draw data)
      console.log(`Creating concurso ${data.numero}`);

      const { error: insertError } = await supabase
        .from("concursos")
        .insert({
          concurso_number: data.numero,
          draw_date: drawDate,
          status: drawnNumbers.length === 6 ? "closed" : "open",
          drawn_numbers: drawnNumbers.length === 6 ? drawnNumbers : null,
          prize_pool_sena: senarPrize,
          prize_pool_quina: quinaPrize,
          accumulated_sena: data.acumulado
            ? data.valorAcumuladoProximoConcurso
            : 0,
        });

      if (insertError) {
        console.error("Error inserting concurso:", insertError);
      }
    }

    // Create next contest if this one is closed
    const nextConcursoNumber = data.numero + 1;

    const { data: nextExists } = await supabase
      .from("concursos")
      .select("id")
      .eq("concurso_number", nextConcursoNumber)
      .single();

    if (!nextExists) {
      console.log(`Creating next concurso ${nextConcursoNumber} as open`);

      // Mega-Sena draws happen on Wed/Sat, calculate next draw date
      const today = new Date();
      const dayOfWeek = today.getDay();
      let daysUntilNext = 0;

      // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
      if (dayOfWeek <= 2) daysUntilNext = 3 - dayOfWeek; // Next Wed
      else if (dayOfWeek <= 5) daysUntilNext = 6 - dayOfWeek; // Next Sat
      else daysUntilNext = 4; // Next Wed

      const nextDrawDate = new Date(
        today.getTime() + daysUntilNext * 24 * 60 * 60 * 1000,
      );
      const nextDrawDateStr = nextDrawDate.toISOString().split("T")[0];

      const { error: nextError } = await supabase
        .from("concursos")
        .insert({
          concurso_number: nextConcursoNumber,
          draw_date: nextDrawDateStr,
          status: "open",
          accumulated_sena: data.acumulado
            ? data.valorAcumuladoProximoConcurso
            : data.valorEstimadoProximoConcurso,
        });

      if (nextError && !nextError.message?.includes("duplicate")) {
        console.error("Error creating next concurso:", nextError);
      }
    }

    // Close all older open contests
    const { error: closeError } = await supabase
      .from("concursos")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("status", "open")
      .lt("concurso_number", data.numero);

    if (closeError) {
      console.error("Error closing old concursos:", closeError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        concurso: data.numero,
        nextConcurso: nextConcursoNumber,
        drawnNumbers,
        status: drawnNumbers.length === 6 ? "closed" : "synced",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Sync Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

/**
 * Process winners for a closed contest using the DB's cascading prize logic.
 * Delegates to the process_draw RPC function which handles:
 * - Calculating hits for all bets
 * - Finding the highest tier with winners
 * - Distributing the entire prize pool to that tier
 * - No accumulation between contests
 */
// deno-lint-ignore no-explicit-any
async function processWinners(
  supabase: any,
  concursoNumber: number,
  _drawnNumbers: number[],
) {
  console.log(
    `Processing winners for concurso ${concursoNumber} (cascading prize logic)`,
  );

  const { data, error } = await supabase
    .rpc("process_draw", { p_concurso_number: concursoNumber });

  if (error) {
    console.error("Error calling process_draw:", error);
    return;
  }

  if (data && data.length > 0) {
    const result = data[0];
    console.log(`process_draw result for concurso ${concursoNumber}:`);
    console.log(`  Bets processed: ${result.bets_processed}`);
    console.log(`  Sena (6 hits): ${result.winners_sena}`);
    console.log(`  Quina (5 hits): ${result.winners_quina}`);
    console.log(`  Quadra (4 hits): ${result.winners_quadra}`);
    console.log(`  Winning tier (max hits): ${result.winning_tier}`);
    console.log(`  Winners in tier: ${result.winners_count}`);
  } else {
    console.log(
      `No data returned from process_draw for concurso ${concursoNumber}`,
    );
  }
}
