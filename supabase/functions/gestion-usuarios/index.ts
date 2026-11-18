// CAMPAÑA CONTROL 3.0 · Edge Function «gestion-usuarios» (Supabase, plan Free).
// Crea cuentas privadas (usuario + contraseña, sin correo), restablece contraseñas, bloquea cuentas y cambia la
// contraseña propia. La clave secreta solo existe aquí, en el servidor (variables del entorno de Supabase).
//
// Seguridad:
//  · Supabase comprueba el JWT de quien llama antes de ejecutar esto (verify_jwt activado).
//  · Los PERMISOS se deciden en la base de datos con la sesión de quien llama (preparar_alta, preparar_restablecer,
//    preparar_bloqueo: RLS y funciones security definer). Esta función solo hace después lo que la base autorizó.
//  · Las contraseñas temporales se generan aquí, se devuelven UNA vez a quien crea o restablece y no se guardan.
//    Supabase Auth guarda solo su huella. La cuenta queda sin acceso hasta que la persona pone la suya.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const claveDe = (nuevo: string, antiguo: string) => {
  try { const k = JSON.parse(Deno.env.get(nuevo) ?? "{}").default; if (k) return k as string; } catch (_) { /* formato antiguo */ }
  return Deno.env.get(antiguo)!;
};
const PUBLICA = claveDe("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SECRETA = claveDe("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(URL_, SECRETA, opciones);

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const respuesta = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json" } });

// 12 caracteres sin los que se confunden (0/O, 1/l/I), con mayúsculas, minúsculas y números
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function claveTemporal(): string {
  for (;;) {
    const b = crypto.getRandomValues(new Uint8Array(32)); let s = "";
    for (const x of b) { if (x < 216) s += ALFABETO[x % 54]; if (s.length === 12) break; }
    if (s.length === 12 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s)) return s;
  }
}
// Errores de la base de datos → mensaje para la persona (sin detalles internos)
function error(e: { message?: string; code?: string } | null, estado = 400) {
  const m = String(e?.message || "Error");
  if (/^(PERMISO|USUARIO|ALTA): /.test(m)) return respuesta({ error: m.replace(/^[A-Z]+: /, ""), codigo: m.split(":")[0] }, /^PERMISO/.test(m) ? 403 : 400);
  console.error(m);
  return respuesta({ error: "No se ha podido completar la operación." }, estado);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta({ error: "Método no permitido" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return respuesta({ error: "Inicia sesión" }, 401);
  // Cliente con la sesión de quien llama: todo lo que decide permisos pasa por aquí (RLS)
  const yo = createClient(URL_, PUBLICA, { ...opciones, global: { headers: { Authorization: auth } } });
  const { data: u, error: eu } = await yo.auth.getUser(auth.slice(7));
  if (eu || !u?.user) return respuesta({ error: "Sesión no válida" }, 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch (_) { return respuesta({ error: "Petición no válida" }, 400); }

  switch (b.accion) {
    case "crear": {
      const usuario = String(b.usuario ?? "").trim().toLowerCase();
      const { data: email, error: e1 } = await yo.rpc("preparar_alta", { p_usuario: usuario, p_nombre: b.nombre ?? "", p_tipo: b.tipo ?? "miembro",
        p_campana: b.campana ?? null, p_rol: b.rol ?? null, p_trabajador: b.trabajador ?? null, p_dueno: b.dueno ?? null, p_editor: !!b.editor });
      if (e1) return error(e1);
      const clave = claveTemporal();
      const { data: c, error: e2 } = await admin.auth.admin.createUser({ email: email as string, password: clave, email_confirm: true, user_metadata: { nombre: b.nombre } });
      if (e2) { await admin.rpc("descartar_alta_servidor", { p_usuario: usuario }); return error(e2, 500); }
      return respuesta({ usuario, id: c.user?.id, clave_temporal: clave });
    }
    case "restablecer": {
      const { data: id, error: e1 } = await yo.rpc("preparar_restablecer", { p_usuario: b.usuario ?? "" });
      if (e1) return error(e1);
      const clave = claveTemporal();
      const { error: e2 } = await admin.auth.admin.updateUserById(id as string, { password: clave });
      if (e2) return error(e2, 500);
      return respuesta({ usuario: String(b.usuario).toLowerCase(), clave_temporal: clave });
    }
    case "bloquear": {
      const bloquear = !!b.bloquear;
      const { data: id, error: e1 } = await yo.rpc("preparar_bloqueo", { p_usuario: b.usuario ?? "", p_bloquear: bloquear });
      if (e1) return error(e1);
      // Además del bloqueo en la base (sin acceso a datos), Supabase Auth deja de aceptar sus inicios de sesión
      const { error: e2 } = await admin.auth.admin.updateUserById(id as string, { ban_duration: bloquear ? "876000h" : "none" });
      if (e2) return error(e2, 500);
      return respuesta({ usuario: String(b.usuario).toLowerCase(), bloqueado: bloquear });
    }
    case "cambiar_clave": {
      const actual = String(b.actual ?? ""), nueva = String(b.nueva ?? "");
      if (nueva.length < 8) return respuesta({ error: "La contraseña nueva debe tener al menos 8 caracteres" }, 400);
      if (nueva === actual) return respuesta({ error: "La contraseña nueva debe ser distinta de la anterior" }, 400);
      const { data: bloqueada, error: eb } = await admin.rpc("cuenta_bloqueada_servidor", { p_user: u.user.id });
      if (eb) return error(eb, 500);
      if (bloqueada !== false) return respuesta({ error: "Cuenta bloqueada" }, 403);
      // Comprueba la contraseña actual (la temporal, la primera vez) con Supabase Auth
      const prueba = createClient(URL_, PUBLICA, opciones);
      const { error: e0 } = await prueba.auth.signInWithPassword({ email: u.user.email!, password: actual });
      if (e0) return respuesta({ error: "La contraseña actual no es correcta" }, 403);
      await prueba.auth.signOut({ scope: "local" });
      const { error: e1 } = await admin.auth.admin.updateUserById(u.user.id, { password: nueva });
      if (e1) return error(e1, 500);
      const { data: activo, error: e2 } = await admin.rpc("clave_cambiada_servidor", { p_user: u.user.id });
      if (e2) return error(e2, 500);
      return respuesta({ ok: true, activo });
    }
    default:
      return respuesta({ error: "Acción no válida" }, 400);
  }
});
