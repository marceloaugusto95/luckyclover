import { getContestStats, supabase } from "./supabase";

export interface MegaSenaResult {
    concurso: number;
    data: string;
    dezenas: string[];
    acumulou: boolean;
    proximoConcurso: number;
    dataProximoConcurso: string;
}

// Helper to format date string (YYYY-MM-DD) to DD/MM/YYYY without timezone shifts
export function formatDrawDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "A definir";
    // Handle YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [_, year, month, day] = match;
        return `${day}/${month}/${year}`;
    }
    return dateStr;
}

// Helper to find the next Tue (2), Thu (4), or Sat (6)
export function getNextDrawDate(startFrom?: Date): Date {
    const today = startFrom || new Date();

    // Simple iteration
    const checkDate = new Date(today);

    for (let i = 0; i <= 7; i++) {
        if (i > 0) checkDate.setDate(checkDate.getDate() + 1);
        if ([2, 4, 6].includes(checkDate.getDay())) {
            return checkDate;
        }
    }
    return checkDate;
}

export async function getMegaSenaResult(): Promise<MegaSenaResult> {
    // Strategy: Try Internal DB first, then External API, then fallback

    // 1. Try Internal Database (Supabase)
    try {
        // Get the next OPEN contest
        const { data: nextOpenList } = await supabase
            .from("concursos")
            .select("*")
            .eq("status", "open")
            .order("concurso_number", { ascending: true })
            .limit(1);

        const nextOpen = nextOpenList?.[0];

        // Get the latest CLOSED contest
        const { data: latestClosedList } = await supabase
            .from("concursos")
            .select("*")
            .eq("status", "closed")
            .order("concurso_number", { ascending: false })
            .limit(1);

        const latestClosed = latestClosedList?.[0];

        if (latestClosed || nextOpen) {
            let proximoConcurso = 0;
            let dataProximoConcurso = "A definir";

            if (nextOpen) {
                proximoConcurso = nextOpen.concurso_number;
                dataProximoConcurso = formatDrawDate(nextOpen.draw_date);
            } else if (latestClosed) {
                proximoConcurso = latestClosed.concurso_number + 1;
                const nextDraw = getNextDrawDate();
                dataProximoConcurso = nextDraw.toLocaleDateString("pt-BR");
            }

            if (latestClosed) {
                return {
                    concurso: latestClosed.concurso_number,
                    data: formatDrawDate(latestClosed.draw_date),
                    dezenas: latestClosed.drawn_numbers.map((n: number) =>
                        n.toString().padStart(2, "0")
                    ),
                    acumulou: false,
                    proximoConcurso,
                    dataProximoConcurso,
                };
            }

            if (nextOpen && !latestClosed) {
                return {
                    concurso: 0,
                    data: "",
                    dezenas: [],
                    acumulou: false,
                    proximoConcurso,
                    dataProximoConcurso,
                };
            }
        }
    } catch (dbError) {
        console.log("Internal DB unavailable, trying external API...", dbError);
    }

    // 2. Try External API (fallback)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
            "https://loteriascaixa-api.herokuapp.com/api/megasena/latest",
            {
                signal: controller.signal,
            },
        );
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error("API unavailable");
        const data = await response.json();
        return {
            concurso: data.concurso,
            data: data.data,
            dezenas: data.dezenas,
            acumulou: data.acumulou,
            proximoConcurso: data.concurso + 1,
            dataProximoConcurso: data.dataProximoConcurso || "A definir",
        };
    } catch (err) {
        console.warn(
            "Mega Sena API failed, falling back to database stats",
            err,
        );

        let latestConcurso = 2670;
        let lastDateString = "Data Indisponível";

        try {
            const stats = await getContestStats();
            if (stats && stats.length > 0) {
                const sorted = stats.sort((a, b) => b.concurso - a.concurso);
                latestConcurso = sorted[0].concurso;
            }
        } catch (dbErr) {
            console.error("Database fallback failed", dbErr);
        }

        const nextDraw = getNextDrawDate();
        const dateStr = nextDraw.toLocaleDateString("pt-BR");

        return {
            concurso: latestConcurso,
            data: lastDateString,
            dezenas: [],
            acumulou: false,
            proximoConcurso: latestConcurso + 1,
            dataProximoConcurso: dateStr,
        };
    }
}
