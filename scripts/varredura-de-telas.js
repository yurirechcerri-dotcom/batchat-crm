/*
 * Varredura de telas do BatChat (T5 do plano V1). Colar no console do navegador LOGADO em app.batchat.com.br
 * (ou rodar via javascript_tool do Chrome). Abre cada rota num popup same-origin, espera o <h1> (até 12 s) e
 * mede: fundo (deve ser rgb(16, 18, 22)), azul legado, rolagem horizontal, 404/erro e corpo vazio.
 * Resultado em window.__varredura (array) e window.__varreduraFim (true). Rotas de módulos desligados dão "404".
 */
(async () => {
  const ROTAS = (window.__rotas ||
    "/app/inbox /app/radar /app/contacts /app/kanban /app/agenda /app/tasks /app/team /app/webhooks /app/ai/agents /app/ai/followups /app/ai/cases /app/settings /app/settings/tags /app/settings/profile /app/connections /app/templates /app/metrics /app/ajuda /app/analise /app/campaigns").split(" ");
  window.__varredura = []; window.__varreduraFim = false;
  const w = window.open("/app", "bcvarredura", "width=1280,height=800");
  const azul = (d) => { let b = 0, n = 0; for (const e of d.querySelectorAll("body *")) { if (++n > 2500) break; const c = w.getComputedStyle(e); for (const v of [c.backgroundColor, c.color]) { const m = v.match(/[\d.]+/g); if (!m || (m[3] !== undefined && +m[3] < .5)) continue; const [r, g, l] = m.map(Number); if (l > r + 50 && l > g + 25) { b++; break; } } } return b; };
  for (const r of ROTAS) {
    w.location.href = r;
    const t0 = Date.now();
    await new Promise((s) => setTimeout(s, 1500));
    while (Date.now() - t0 < 12000 && !(w.document.readyState === "complete" && w.document.querySelector("h1, main"))) await new Promise((s) => setTimeout(s, 500));
    await new Promise((s) => setTimeout(s, 1500));
    const d = w.document;
    const bad = /404|Esta página não está disponível|Algo deu errado|Sem conexão/i.test(d.body.innerText.slice(0, 300));
    window.__varredura.push({ r, p: w.location.pathname, h: (d.querySelector("h1")?.innerText || "").slice(0, 24), bg: w.getComputedStyle(d.body).backgroundColor, blue: azul(d), ovf: d.documentElement.scrollWidth > w.innerWidth + 2, bad, len: d.body.innerText.length });
  }
  w.close(); window.__varreduraFim = true;
})();
