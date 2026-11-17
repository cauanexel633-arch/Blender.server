import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assinar, escapar, lerCorpo, SEG, senhaCorreta, verificar } from "../../src/oauth.js";

type Pedido = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  response_type: string;
};

/** Valida os parâmetros do pedido de autorização. Usado no GET e no POST (dados vindos do formulário). */
function validar(p: Record<string, string>): { ok: true; pedido: Pedido } | { ok: false; erro: string } {
  if (p.response_type !== "code") return { ok: false, erro: "response_type deve ser 'code'" };
  if (p.code_challenge_method !== "S256" || !p.code_challenge) return { ok: false, erro: "PKCE S256 é obrigatório" };
  const cliente = verificar<{ redirect_uris: string[] }>(p.client_id ?? "", "cliente");
  if (!cliente) return { ok: false, erro: "client_id inválido ou expirado" };
  if (!cliente.redirect_uris.includes(p.redirect_uri)) return { ok: false, erro: "redirect_uri não registrada" };
  return { ok: true, pedido: p as unknown as Pedido };
}

function pagina(corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autorizar bender-3d-mcp</title>
<style>body{font:16px system-ui,sans-serif;margin:0;background:#f7f7f8;color:#111}main{max-width:420px;margin:48px auto;padding:24px;background:#fff;border-radius:12px;box-shadow:0 1px 4px #0002}
input{width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #ccc;border-radius:8px;margin:8px 0}
button{width:100%;padding:12px;font-size:16px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer}.erro{color:#b00020}.muted{color:#666;font-size:14px}</style>
</head><body><main>${corpo}</main></body></html>`;
}

function formulario(p: Pedido, erro?: string): string {
  const campos = Object.entries(p)
    .map(([k, v]) => `<input type="hidden" name="${escapar(k)}" value="${escapar(String(v ?? ""))}">`)
    .join("");
  return pagina(`<h1>Autorizar acesso</h1>
<p>Um cliente de IA está pedindo acesso às ferramentas 3D do seu servidor.</p>
${erro ? `<p class="erro">${escapar(erro)}</p>` : ""}
<form method="post" action="/oauth/authorize">${campos}
<label>Senha do servidor</label>
<input type="password" name="senha" autocomplete="current-password" required autofocus>
<button type="submit">Autorizar</button></form>
<p class="muted">A senha é a mesma usada como MCP_TOKEN no Vercel.</p>`);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const params = req.method === "POST" ? lerCorpo(req.body) : lerCorpo(req.query);
  const v = validar(params);

  if (req.method === "GET") {
    if (!v.ok) {
      res.status(400).setHeader("content-type", "text/html; charset=utf-8").send(pagina(`<h1>Pedido inválido</h1><p class="erro">${escapar(v.erro)}</p>`));
      return;
    }
    res.status(200).setHeader("content-type", "text/html; charset=utf-8").send(formulario(v.pedido));
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ erro: "method_not_allowed" });
    return;
  }
  if (!v.ok) {
    res.status(400).setHeader("content-type", "text/html; charset=utf-8").send(pagina(`<h1>Pedido inválido</h1><p class="erro">${escapar(v.erro)}</p>`));
    return;
  }
  if (!senhaCorreta(params.senha ?? "")) {
    res.status(401).setHeader("content-type", "text/html; charset=utf-8").send(formulario(v.pedido, "Senha incorreta."));
    return;
  }

  const codigo = assinar(
    { tipo: "codigo", client_id: v.pedido.client_id, redirect_uri: v.pedido.redirect_uri, code_challenge: v.pedido.code_challenge },
    SEG.codigo,
  );
  const destino = new URL(v.pedido.redirect_uri);
  destino.searchParams.set("code", codigo);
  if (v.pedido.state) destino.searchParams.set("state", v.pedido.state);
  res.setHeader("cache-control", "no-store");
  res.redirect(302, destino.toString());
}
