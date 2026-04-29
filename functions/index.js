const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const https = require("https");
const crypto = require("crypto");

// ── Configuração global ───────────────────────────────────────────────────────
setGlobalOptions({ region: "southamerica-east1" });
initializeApp();

const db = getFirestore();
const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");

const VALOR_MENSALIDADE = 9.90;
const CORS_ORIGIN = "https://streamdesk.net.br";

// ── CORS ──────────────────────────────────────────────────────────────────────
function setCors(req, res) {
  res.set("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return true; }
  return false;
}

// ── API Mercado Pago ──────────────────────────────────────────────────────────
function mpRequest(method, path, body, token, idempotencyKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.mercadopago.com",
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey || crypto.randomUUID(),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error("Resposta inválida da API do MP")); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Helpers de data ───────────────────────────────────────────────────────────
function dateStr(d) {
  const dt = d || new Date();
  return dt.getFullYear() + "-" +
    String(dt.getMonth() + 1).padStart(2, "0") + "-" +
    String(dt.getDate()).padStart(2, "0");
}

function vencimento30dias() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return dateStr(d);
}

// ── Renova gerente no Firestore ───────────────────────────────────────────────
async function renovarGerente(uid, novaExpiracao) {
  if (!uid) return;
  const ref  = db.collection("usuarios").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) { console.warn("Gerente não encontrado:", uid); return; }
  await ref.update({
    expiracao:       novaExpiracao,
    ultimoPagamento: dateStr(),
    statusPagamento: "approved",
  });
  console.log(`Gerente renovado: ${uid} → ${novaExpiracao}`);
}

// ── Renova cliente de stream no Firestore ─────────────────────────────────────
async function atualizarCliente(externalRef, novoVencimento, statusPagamento) {
  if (!externalRef || !externalRef.includes("_")) return;
  const [uid, clienteId] = externalRef.split("_");
  const ref  = db.collection("usuarios").doc(uid).collection("clientes").doc(clienteId);
  const snap = await ref.get();
  if (!snap.exists) { console.warn(`Cliente não encontrado: ${uid}/${clienteId}`); return; }
  const dados = { ultimoPagamento: dateStr(), statusPagamento };
  if (statusPagamento === "approved" && novoVencimento) dados.vencimento = novoVencimento;
  await ref.update(dados);
  console.log(`Cliente atualizado: ${uid}/${clienteId}`, dados);
}

// =============================================================================
// ROTA 1 — Webhook do Mercado Pago
// URL: https://webhookmp-vsw4hqxmxq-rj.a.run.app
// Cadastrar no painel MP → Webhooks
// =============================================================================
exports.webhookMP = onRequest(
  { secrets: [MP_ACCESS_TOKEN] },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const token  = MP_ACCESS_TOKEN.value();
    const body   = req.body;
    const tipo   = body.type || body.topic || "";
    const dataId = body.data?.id || body.id || null;

    console.log("Webhook recebido:", JSON.stringify(body));

    try {
      // Pagamento avulso (Pix)
      if (tipo === "payment" && dataId) {
        const { body: payment } = await mpRequest("GET", `/v1/payments/${dataId}`, null, token);
        const status      = payment.status;
        const externalRef = payment.external_reference || "";
        console.log(`Pagamento ${dataId}: status=${status}, ref=${externalRef}`);

        if (status === "approved") {
          if (externalRef.startsWith("gerente:")) {
            await renovarGerente(externalRef.replace("gerente:", ""), vencimento30dias());
          } else {
            await atualizarCliente(externalRef, vencimento30dias(), "approved");
          }
          await db.collection("pagamentos_mp").add({
            paymentId: dataId, externalRef, status,
            valor: payment.transaction_amount,
            metodo: payment.payment_method_id,
            criadoEm: new Date(),
          });
        }
        return res.status(200).send("OK");
      }

      // Assinatura recorrente
      if (["subscription_preapproval", "preapproval", "subscription_authorized_payment"].includes(tipo) && dataId) {
        const { body: sub } = await mpRequest("GET", `/preapproval/${dataId}`, null, token);
        const status      = sub.status;
        const externalRef = sub.external_reference || "";
        console.log(`Assinatura ${dataId}: status=${status}, ref=${externalRef}`);

        if (status === "authorized") {
          const novaExp = sub.next_payment_date ? sub.next_payment_date.split("T")[0] : vencimento30dias();
          if (externalRef.startsWith("gerente:")) {
            await renovarGerente(externalRef.replace("gerente:", ""), novaExp);
          } else {
            await atualizarCliente(externalRef, novaExp, "approved");
          }
        } else if (["paused", "cancelled"].includes(status) && !externalRef.startsWith("gerente:")) {
          await atualizarCliente(externalRef, null, status);
        }
        return res.status(200).send("OK");
      }

      return res.status(200).send("Ignored");
    } catch (err) {
      console.error("Erro no webhook:", err);
      return res.status(500).send("Internal Error");
    }
  }
);

// =============================================================================
// ROTA 2 — Criar Pix
// Chamada pelo app: POST /criarPix
// Body: { uid, valor?, descricao? }
// =============================================================================
exports.criarPix = onRequest(
  { secrets: [MP_ACCESS_TOKEN] },
  async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const token = MP_ACCESS_TOKEN.value();
    const { uid, valor, descricao } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid obrigatório" });

    // Busca email do gerente
    let email = "";
    try {
      const snap = await db.collection("usuarios").doc(uid).get();
      if (snap.exists) email = snap.data().email || "";
    } catch (e) {}

    const body = {
      transaction_amount: valor || VALOR_MENSALIDADE,
      description:        descricao || "StreamDesk — Assinatura Mensal",
      payment_method_id:  "pix",
      external_reference: `gerente:${uid}`,
      payer: { email: email || `${uid}@streamdesk.app` },
    };

    try {
      const { status, body: payment } = await mpRequest("POST", "/v1/payments", body, token, `pix-${uid}-${Date.now()}`);

      if (status !== 201 && status !== 200) {
        console.error("Erro MP criarPix:", payment);
        return res.status(400).json({ error: payment.message || "Erro ao criar Pix" });
      }

      return res.status(200).json({
        payment_id:      payment.id,
        qr_code:         payment.point_of_interaction?.transaction_data?.qr_code || "",
        qr_code_base64:  payment.point_of_interaction?.transaction_data?.qr_code_base64 || "",
        status:          payment.status,
      });
    } catch (err) {
      console.error("Erro ao criar Pix:", err);
      return res.status(500).json({ error: "Erro interno ao criar Pix" });
    }
  }
);

// =============================================================================
// ROTA 3 — Criar Assinatura com Cartão
// Chamada pelo app: POST /criarAssinatura
// Body: { uid, token, email, valor? }
// =============================================================================
exports.criarAssinatura = onRequest(
  { secrets: [MP_ACCESS_TOKEN] },
  async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const mpToken = MP_ACCESS_TOKEN.value();
    const { uid, token, email, valor } = req.body || {};
    if (!uid)   return res.status(400).json({ error: "uid obrigatório" });
    if (!token) return res.status(400).json({ error: "token do cartão obrigatório" });

    const dataInicio = new Date().toISOString().split(".")[0] + "-03:00";

    const body = {
      reason:             "StreamDesk — Assinatura Mensal",
      external_reference: `gerente:${uid}`,
      payer_email:        email || `${uid}@streamdesk.app`,
      card_token_id:      token,
      auto_recurring: {
        frequency:          1,
        frequency_type:     "months",
        transaction_amount: valor || VALOR_MENSALIDADE,
        currency_id:        "BRL",
        start_date:         dataInicio,
        end_date:           null,
      },
      back_url: "https://streamdesk.net.br/config.html",
      status:   "authorized",
    };

    try {
      const { status, body: sub } = await mpRequest("POST", "/preapproval", body, mpToken, `sub-${uid}-${Date.now()}`);

      if (status !== 201 && status !== 200) {
        console.error("Erro MP criarAssinatura:", sub);
        return res.status(400).json({ error: sub.message || "Erro ao criar assinatura" });
      }

      // Renova imediatamente no Firestore
      const novaExpiracao = vencimento30dias();
      await renovarGerente(uid, novaExpiracao);

      return res.status(200).json({
        subscription_id: sub.id,
        status:          sub.status,
        expiracao:       novaExpiracao,
      });
    } catch (err) {
      console.error("Erro ao criar assinatura:", err);
      return res.status(500).json({ error: "Erro interno ao criar assinatura" });
    }
  }
);
