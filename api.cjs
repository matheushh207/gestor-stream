// ==========================================
// MÓDULO: API WHATSAPP GESTOR STREAM (Billing)
// ==========================================
const express = require('express');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Sensor de Chamadas (Para diagnóstico)
app.use((req, res, next) => {
  console.log(`[API-LOG] Recebida chamada: ${req.method} ${req.url}`);
  next();
});

// Configuração de Memória
const v8 = require('v8');
v8.setFlagsFromString('--max-old-space-size=1024'); 

// CORS Manual
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Private-Network", "true"); 
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const sessions = {};
const initializing = new Set(); 

function msgLog(revendaId, msg) {
  console.log(`[BILLING-REV-${revendaId}] -> ${msg}`);
}

/**
 * Inicializa um cliente WhatsApp para uma revenda específica
 */
async function initClient(revendaId) {
  // CHECAGEM SÍNCRONA E IMEDIATA DO CADEADO
  if (initializing.has(revendaId)) {
    return; // Já está tentando abrir, não faz nada
  }

  if (sessions[revendaId] && (sessions[revendaId].status === "CONNECTED" || sessions[revendaId].status === "QR_READY" || sessions[revendaId].status === "STARTING")) {
    return;
  }

  // FECHA O CADEADO ANTES DE QUALQUER AWAIT
  initializing.add(revendaId);
  sessions[revendaId] = { status: "STARTING", qr: null };
  
  msgLog(revendaId, "Abrindo navegador... Aguarde.");

  try {
    const client = new Client({
      authStrategy: new LocalAuth({ 
        clientId: revendaId,
        dataPath: path.join(__dirname, '.wwebjs_auth')
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
        protocolTimeout: 60000,
      }
    });

    client.on('qr', async (qr) => {
      try {
        const qrBase64 = await qrcode.toDataURL(qr);
        sessions[revendaId].qr = qrBase64;
        sessions[revendaId].status = "QR_READY";
        msgLog(revendaId, "QR Code pronto!");
        initializing.delete(revendaId);
      } catch (e) {
        msgLog(revendaId, "Erro no QR: " + e.message);
      }
    });

    client.on('ready', () => {
      msgLog(revendaId, "WhatsApp Conectado! ✅");
      sessions[revendaId].status = "CONNECTED";
      sessions[revendaId].qr = null;
      initializing.delete(revendaId);
    });

    client.on('auth_failure', () => {
      msgLog(revendaId, "Falha na autenticação.");
      delete sessions[revendaId];
      initializing.delete(revendaId);
    });

    client.on('disconnected', () => {
      msgLog(revendaId, "Desconectado.");
      delete sessions[revendaId];
      initializing.delete(revendaId);
    });

    await client.initialize();
    sessions[revendaId].client = client;

  } catch (err) {
    msgLog(revendaId, "Erro ao abrir navegador: " + err.message);
    delete sessions[revendaId];
    initializing.delete(revendaId);
  }
}

// --- ENDPOINTS ---

app.post('/api/start/:revendaId', (req, res) => {
  const { revendaId } = req.params;
  initClient(revendaId); 
  return res.json({ message: "Iniciando...", revendaId });
});

app.get('/api/ping', (req, res) => {
  res.json({ status: "online" });
});

app.get('/api/status/:revendaId', (req, res) => {
  const { revendaId } = req.params;
  const session = sessions[revendaId];
  if (!session) return res.json({ status: "OFFLINE_API", qr: null });
  return res.json({ status: session.status, qr: session.qr });
});

app.post('/api/send/:revendaId', async (req, res) => {
  const { revendaId } = req.params;
  const session = sessions[revendaId];
  if (!session || session.status !== "CONNECTED") return res.status(400).json({ error: "Desconectado" });
  
  const { numero, texto } = req.body;
  try {
    let cleanNumber = String(numero).replace(/\D/g, '');
    if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;
    const numberId = await session.client.getNumberId(cleanNumber);
    if (!numberId) return res.status(400).json({ error: "Número inválido" });
    await session.client.sendMessage(numberId._serialized, texto);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/logout/:revendaId', async (req, res) => {
  const { revendaId } = req.params;
  const session = sessions[revendaId];
  if (session && session.client) {
    await session.client.logout().catch(() => {});
    await session.client.destroy().catch(() => {});
    delete sessions[revendaId];
  }
  return res.sendStatus(200);
});

const PORT = 3001; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MOTOR DE COBRANÇA ON (Porta ${PORT})`);
});
