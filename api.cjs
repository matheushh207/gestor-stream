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
const fs = require('fs');
const path = require('path');

// Banco de dados em memória para as seções
const sessions = {};

function msgLog(revendaId, msg) {
  console.log(`[BILLING-REV-${revendaId}] -> ${msg}`);
}

/**
 * Inicializa um cliente WhatsApp para uma revenda específica
 */
async function initClient(revendaId) {
  if (sessions[revendaId] && (sessions[revendaId].status === "STARTING" || sessions[revendaId].status === "CONNECTED" || sessions[revendaId].status === "QR_READY")) {
    return sessions[revendaId];
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
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
        "--disable-setuid-sandbox",
        "--disable-accelerated-2d-canvas",
      ],
      executablePath: process.env.CHROME_PATH || null // Útil para alguns ambientes Docker
    }
  });

  sessions[revendaId].client = client;

  client.on('qr', async (qr) => {
    try {
      const qrBase64 = await qrcode.toDataURL(qr);
      sessions[revendaId].qr = qrBase64;
      sessions[revendaId].status = "QR_READY";
      msgLog(revendaId, "QR Code gerado. Aguardando leitura...");
    } catch(e) { 
      msgLog(revendaId, "Erro ao gerar QR Code: " + e.message);
    }
  });

  client.on('ready', () => {
    msgLog(revendaId, "Conectado para Avisos de Vencimento! ✅");
    sessions[revendaId].status = "CONNECTED";
    sessions[revendaId].qr = null;
  });

  client.on('authenticated', () => {
    msgLog(revendaId, "Autenticado! Sincronizando dados (isso pode demorar no Render)...");
    sessions[revendaId].status = "AUTHENTICATED"; 
  });

  client.on('auth_failure', (msg) => {
    msgLog(revendaId, "Falha na autenticação: " + msg);
    sessions[revendaId].status = "DISCONNECTED";
    delete sessions[revendaId];
  });

  client.on('disconnected', (reason) => {
    msgLog(revendaId, `Desconectado: ${reason}`);
    sessions[revendaId].status = "DISCONNECTED";
    sessions[revendaId].qr = null;
    delete sessions[revendaId];
  });

  // Tenta inicializar. Se falhar, limpa o estado.
  try {
    client.initialize().catch(err => {
        msgLog(revendaId, "Erro na inicialização: " + err.message);
        sessions[revendaId].status = "OFFLINE_API";
    });
  } catch(e) {
    msgLog(revendaId, "Erro crítico no initialize: " + e.message);
  }

  return sessions[revendaId];
}

/**
 * Tenta retomar sessões existentes no disco ao iniciar o servidor
 */
async function resumeSessions() {
  const authDir = path.join(process.cwd(), '.wwebjs_auth');
  if (fs.existsSync(authDir)) {
    const files = fs.readdirSync(authDir);
    const sessionDirs = files.filter(f => f.startsWith('session-'));
    
    for (const dir of sessionDirs) {
      const revendaId = dir.replace('session-', '');
      msgLog(revendaId, "Retomando sessão encontrada no disco...");
      initClient(revendaId).catch(() => {});
      // Delay pequeno entre inicializações para não sobrecarregar CPU/RAM
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

app.post('/api/start/:revendaId', async (req, res) => {
  const { revendaId } = req.params;
  await initClient(revendaId);
  return res.json({ message: "Iniciando motor de avisos...", revendaId });
});

app.get('/api/ping', (req, res) => {
  res.json({ status: "online", timestamp: new Date().toISOString() });
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

const PORT = process.env.PORT || 3001; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MOTOR DE COBRANÇA ON (Porta ${PORT})`);
    // Inicia a retomada automática de sessões
    resumeSessions();
});
