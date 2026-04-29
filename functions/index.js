const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const https = require("https");

// ── Configuração global ───────────────────────────────────────────────────────
setGlobalOptions({ region: "southamerica-east1" }); // São Paulo
initializeApp();

const db = getFirestore();

// ── Secret: MP_ACCESS_TOKEN (lido do GitHub Secrets via Firebase Secret Manager)
const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Busca detalhes de um pagamento na API do Mercado Pago */
function fetchPayment(paymentId, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.mercadopago.com",
      path: `/v1/payments/${paymentId}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Resposta inválida da API do MP"));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/** Busca detalhes de uma assinatura (preapproval) na API do Mercado Pago */
function fetchSubscription(subscriptionId, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.mercadopago.com",
      path: `/preapproval/${subscriptionId}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Resposta inválida da API do MP (subscription)"));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Dado um external_reference (ex: "uid_clienteId") e um novo vencimento,
 * atualiza o documento do cliente no Firestore.
 *
 * external_reference deve ser gerado pelo app no formato: "{uid}_{clienteId}"
 */
async function atualizarCliente(externalRef, novoVencimento, statusPagamento) {
  if (!externalRef || !externalRef.includes("_")) {
    console.warn("external_reference inválido:", externalRef);
    return;
  }

  const [uid, clienteId] = externalRef.split("_");
  const clienteRef = db
    .collection("usuarios")
    .doc(uid)
    .collection("clientes")
    .doc(clienteId);

  const snap = await clienteRef.get();
  if (!snap.exists) {
    console.warn(`Cliente não encontrado: usuarios/${uid}/clientes/${clienteId}`);
    return;
  }

  const dados = {
    ultimoPagamento: new Date().toISOString().split("T")[0], // YYYY-MM-DD
    statusPagamento: statusPagamento, // 'approved' | 'pending' | 'cancelled'
  };

  // Só atualiza vencimento se o pagamento foi aprovado
  if (statusPagamento === "approved" && novoVencimento) {
    dados.vencimento = novoVencimento;
  }

  await clienteRef.update(dados);
  console.log(`Cliente atualizado: ${uid}/${clienteId}`, dados);
}

/**
 * Calcula novo vencimento: hoje + 30 dias (ou usa next_payment_date do MP)
 */
function calcularVencimento(nextPaymentDate) {
  if (nextPaymentDate) {
    // next_payment_date vem como "2025-06-01T00:00:00.000-03:00"
    return nextPaymentDate.split("T")[0];
  }
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

// ── Webhook principal ─────────────────────────────────────────────────────────

exports.webhookMP = onRequest(
  { secrets: [MP_ACCESS_TOKEN] },
  async (req, res) => {
    // Só aceita POST
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const token = MP_ACCESS_TOKEN.value();
    const body = req.body;

    console.log("Webhook recebido:", JSON.stringify(body));

    // O MP envia o tipo do evento em body.type ou body.action
    const tipo = body.type || body.topic || "";
    const dataId = body.data?.id || body.id || null;

    try {
      // ── Evento: Pagamento (Pix ou Cartão avulso) ─────────────────────────
      if (tipo === "payment" && dataId) {
        const payment = await fetchPayment(dataId, token);

        const status = payment.status; // 'approved', 'pending', 'rejected'...
        const externalRef = payment.external_reference;
        const novoVencimento = calcularVencimento(payment.date_approved);

        console.log(`Pagamento ${dataId}: status=${status}, ref=${externalRef}`);

        if (status === "approved") {
          await atualizarCliente(externalRef, novoVencimento, "approved");

          // Registra também no histórico de pagamentos do StreamDesk
          await db.collection("pagamentos_mp").add({
            paymentId: dataId,
            externalRef,
            status,
            valor: payment.transaction_amount,
            moeda: payment.currency_id,
            metodo: payment.payment_method_id, // 'pix', 'credit_card'...
            criadoEm: new Date(),
            vencimentoGerado: novoVencimento,
          });
        } else if (["rejected", "cancelled"].includes(status)) {
          await atualizarCliente(externalRef, null, status);
        }

        return res.status(200).send("OK");
      }

      // ── Evento: Assinatura recorrente (preapproval) ───────────────────────
      if (
        (tipo === "subscription_preapproval" ||
          tipo === "preapproval" ||
          tipo === "subscription_authorized_payment") &&
        dataId
      ) {
        const sub = await fetchSubscription(dataId, token);

        const status = sub.status; // 'authorized', 'paused', 'cancelled'
        const externalRef = sub.external_reference;
        const novoVencimento = calcularVencimento(sub.next_payment_date);

        console.log(`Assinatura ${dataId}: status=${status}, ref=${externalRef}`);

        if (status === "authorized") {
          await atualizarCliente(externalRef, novoVencimento, "approved");
        } else if (["paused", "cancelled"].includes(status)) {
          await atualizarCliente(externalRef, null, status);
        }

        return res.status(200).send("OK");
      }

      // Evento desconhecido — responde 200 para o MP não retentar
      console.log("Tipo de evento não tratado:", tipo);
      return res.status(200).send("Ignored");
    } catch (err) {
      console.error("Erro ao processar webhook:", err);
      // Retorna 500 para o MP retentar depois
      return res.status(500).send("Internal Error");
    }
  }
);
