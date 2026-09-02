// deno-lint-ignore-file
import "jsr:@supabase/functions-js@^2/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  create,
  getNumericDate,
  verify,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// PBKDF2 Password Hashing (Matching existing implementation)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const combined = new Uint8Array(salt.length + hash.byteLength);
  combined.set(salt, 0);
  combined.set(new Uint8Array(hash), salt.length);
  return btoa(String.fromCharCode(...combined));
}

async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const originalHash = combined.slice(16);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const hash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256,
    );

    const newHashArr = new Uint8Array(hash);
    if (originalHash.length !== newHashArr.length) return false;

    // Constant time comparison
    let result = 0;
    for (let i = 0; i < originalHash.length; i++) {
      result |= originalHash[i] ^ newHashArr[i];
    }
    return result === 0;
  } catch (e) {
    console.error("Password verification error", e);
    return false;
  }
}

// Assina os tokens com o JWT SECRET DO PROJETO SUPABASE (HS256), para que o
// PostgREST reconheça o usuário (auth.uid()/is_admin() passam a funcionar).
// O secret DEVE estar configurado como variável JWT_SECRET da Edge Function.
async function getJwtKey() {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) {
    throw new Error("JWT_SECRET not configured");
  }
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// Monta um JWT compatível com o Supabase: role=authenticated (papel do Postgres),
// sub=id do usuário (vira auth.uid()), e user_role como claim de aplicação.
async function signSupabaseJwt(
  user: { id: string; role: string; cpf: string },
  expSeconds: number,
): Promise<string> {
  const key = await getJwtKey();
  return await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: user.id,
      role: "authenticated",
      aud: "authenticated",
      iss: "supabase",
      user_role: user.role,
      cpf: user.cpf,
      iat: getNumericDate(0),
      exp: getNumericDate(expSeconds),
    },
    key,
  );
}

// Remove o hash da senha antes de devolver o perfil ao cliente.
// O login precisa do hash para conferir a senha, mas ele jamais deve sair do
// servidor: os apps guardam a resposta inteira em localStorage, o que deixava
// o PBKDF2 de cada usuário exposto a quebra offline.
function sanitizeUser<T extends Record<string, unknown>>(user: T) {
  const { password_hash: _omit, ...safe } = user;
  return safe;
}

// Verify Admin Middleware
async function verifyAdmin(req: Request, supabase: any): Promise<boolean> {
  const token = req.headers.get("x-admin-token");
  if (!token) return false;
  try {
    const key = await getJwtKey();
    const payload = await verify(token, key);
    if (payload.user_role !== "admin") return false;

    // Marco de revogação: um token emitido ANTES de profiles.tokens_valid_from
    // não vale mais. É o que permite deslogar sessões sem rotacionar o
    // JWT_SECRET do projeto -- que também assina a anon key e a service_role
    // key, e cuja troca derrubaria os três apps e as Edge Functions.
    // O PostgREST já aplica a mesma regra via is_admin(); aqui fechamos o
    // caminho do x-admin-token, que não passa pelo banco.
    const { data: perfil } = await supabase
      .from("profiles")
      .select("tokens_valid_from")
      .eq("id", payload.sub)
      .single();

    if (perfil?.tokens_valid_from) {
      const iatMs = Number(payload.iat ?? 0) * 1000;
      if (iatMs < new Date(perfil.tokens_valid_from).getTime()) {
        console.warn("Admin token revogado (anterior a tokens_valid_from)");
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error("Token verification failed:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const { action } = body;

    // --- LOGIN ---
    if (action === "login") {
      const { cpf, password } = body;
      const cleanCpf = cpf.replace(/\D/g, "");

      const { data: user, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("cpf", cleanCpf)
        .single();

      if (error || !user) {
        return new Response(
          JSON.stringify({ error: "Usuário não encontrado" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!user.password_hash) {
        return new Response(
          JSON.stringify({ error: "Usuário sem senha definida." }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return new Response(
          JSON.stringify({ error: "Senha incorreta" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Admin tokens last 10 years; other roles keep 7 days
      const expSeconds = user.role === "admin"
        ? 60 * 60 * 24 * 365 * 10
        : 60 * 60 * 24 * 7;
      const jwt = await signSupabaseJwt(user, expSeconds);

      return new Response(
        JSON.stringify({ success: true, token: jwt, user: sanitizeUser(user) }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- REGISTER ---
    if (action === "register") {
      const {
        cpf,
        password,
        full_name,
        phone,
        pix_key,
        cidade,
        role,
        _coupon_code,
      } = body;
      const requestedRole = role || "client";

      // Security Check: Only admins can register users with non-client roles
      if (requestedRole !== "client") {
        if (!await verifyAdmin(req, supabase)) {
          return new Response(
            JSON.stringify({
              error: "Unauthorized to create admin/reseller accounts",
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      const cleanCpf = cpf.replace(/\D/g, "");

      // Check existing
      const { data: existing } = await supabase.from("profiles").select("id")
        .eq("cpf", cleanCpf).single();
      if (existing) {
        return new Response(
          JSON.stringify({ error: "CPF já cadastrado" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const hash = await hashPassword(password);

      const { data: newUser, error: createError } = await supabase
        .from("profiles")
        .insert({
          cpf: cleanCpf,
          password_hash: hash,
          full_name,
          phone,
          pix_key,
          cidade,
          role: requestedRole,
        })
        .select()
        .single();

      if (createError) {
        return new Response(
          JSON.stringify({ error: createError.message }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // If registering a user, we generally don't login immediately in this flow unless requested,
      // but for compatibility with existing app:

      // Admin tokens last 10 years; other roles keep 7 days
      const regExpSeconds = newUser.role === "admin"
        ? 60 * 60 * 24 * 365 * 10
        : 60 * 60 * 24 * 7;
      const jwt = await signSupabaseJwt(newUser, regExpSeconds);

      return new Response(
        JSON.stringify({ success: true, token: jwt, user: sanitizeUser(newUser) }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- DELETE USER (Admin Only) ---
    if (action === "delete_user") {
      if (!await verifyAdmin(req, supabase)) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { target_id } = body;
      if (!target_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_id" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 1. Delete bets
      await supabase.from("bets").delete().eq("user_id", target_id);

      // 2. Delete resellers
      await supabase.from("resellers").delete().eq("user_id", target_id);

      // 3. Delete profile
      const { error } = await supabase.from("profiles").delete().eq(
        "id",
        target_id,
      );

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- RESET PASSWORD (Admin Only) ---
    if (action === "reset_password") {
      if (!await verifyAdmin(req, supabase)) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { target_id, new_password } = body;
      if (!target_id || !new_password) {
        return new Response(
          JSON.stringify({ error: "Missing parameters" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const hash = await hashPassword(new_password);
      const { error } = await supabase
        .from("profiles")
        .update({ password_hash: hash })
        .eq("id", target_id);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- UPDATE SYSTEM SETTINGS (Admin Only) ---
    if (action === "update_settings") {
      if (!await verifyAdmin(req, supabase)) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { key, value } = body;
      if (!key || value === undefined) {
        return new Response(
          JSON.stringify({ error: "Missing parameters" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ error: "Action not supported" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
