// ==========================================
// MÓDULO: API WHATSAPP GESTOR STREAM (Billing)
// ==========================================
const express = require('express');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.json());

// CORS Manual
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Banco de dados em memória para as seções
const sessions = {};

function msgLog(revendaId, msg) {
  console.log(`[BILLING-REV-${revendaId}] -> ${msg}`);
}

app.post('/api/start/:revendaId', async (req, res) => {
  const { revendaId } = req.params;

  if (sessions[revendaId]) {
    return res.status(400).json({ error: "Sessão já existe ou está rodando." });
  }

  msgLog(revendaId, "Inicializando motor de COBRANÇA...");
  
  sessions[revendaId] = {
    client: null,
    qr: null,
    status: "STARTING"
  };

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: revendaId }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  });

  sessions[revendaId].client = client;

  client.on('qr', async (qr) => {
    try {
      const qrBase64 = await qrcode.toDataURL(qr);
      sessions[revendaId].qr = qrBase64;
      sessions[revendaId].status = "QR_READY";
    } catch(e) { }
  });

  client.on('ready', () => {
    msgLog(revendaId, "Conectado para Avisos de Vencimento! ✅");
    sessions[revendaId].status = "CONNECTED";
    sessions[revendaId].qr = null;
  });

  client.on('disconnected', (reason) => {
    msgLog(revendaId, `Desconectado: ${reason}`);
    sessions[revendaId].status = "DISCONNECTED";
    sessions[revendaId].qr = null;
  });

  client.initialize();
  return res.json({ message: "Iniciando motor de avisos...", revendaId });
});

app.get('/api/status/:revendaId', (req, res) => {
  const { revendaId } = req.params;
  const session = sessions[revendaId];
  if (!session) return res.json({ status: "NOT_FOUND", qr: null });
  return res.json({ status: session.status, qr: session.qr });
});

app.post('/api/send/:revendaId', async (req, res) => {
  const { revendaId } = req.params;
  const session = sessions[revendaId];

  if (!session || session.status !== "CONNECTED") {
    return res.status(400).json({ error: "WhatsApp não está conectado." });
  }

  const { numero, texto } = req.body;
  if (!numero || !texto) return res.status(400).json({ error: "Número e texto são obrigatórios." });

  try {
    let cleanNumber = String(numero).replace(/\D/g, '');
    if (!cleanNumber.startsWith('55') && cleanNumber.length >= 10) {
      cleanNumber = '55' + cleanNumber;
    }
    const numberId = await session.client.getNumberId(cleanNumber);
    if (!numberId) return res.status(400).json({ error: "Número não existe no WhatsApp." });
    
    await session.client.sendMessage(numberId._serialized, texto);
    msgLog(revendaId, `Aviso de vencimento enviado para ${cleanNumber}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/logout/:revendaId', async (req, res) => {
  const { revendaId } = req.params;
  const session = sessions[revendaId];
  if (session && session.client) {
    try {
      await session.client.logout();
      await session.client.destroy();
      delete sessions[revendaId];
      return res.json({ message: "Deslogado." });
    } catch(e) {
      delete sessions[revendaId];
      return res.sendStatus(200);
    }
  }
  return res.status(404).json({ error: "Não encontrado." });
});

const PORT = 3001; 
app.listen(PORT, () => {
    console.log(`🚀 MOTOR DE COBRANÇA ON (Porta ${PORT})`);
});
