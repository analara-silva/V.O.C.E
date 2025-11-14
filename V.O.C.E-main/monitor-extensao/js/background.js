// background.js - Versão otimizada com batching inteligente

importScripts('./browser-polyfill.min.js');

const BACKEND_URL = 'http://localhost:8081/api/logs';
const NATIVE_HOST = 'com.meutcc.monitor';

let activeTabs = {};
let dataBuffer = [];
let osUsername = 'Desconhecido';
const MAX_BATCH_SIZE = 200; // Envia imediatamente quando passar disso

// ============================
// 🧠 OBTER USUÁRIO DO SISTEMA
// ============================

function getOSUsername() {
  browser.runtime.sendNativeMessage(NATIVE_HOST, { text: "get_username_request" })
    .then(response => {
      if (response?.status === 'success') {
        osUsername = response.username;
      } else {
        osUsername = 'erro_script_host';
      }
    })
    .catch(() => {
      osUsername = 'erro_host_nao_encontrado';
    });
}

getOSUsername();

// ============================
// 🚀 ENVIO com Batching Inteligente
// ============================

async function sendBatch() {
  if (dataBuffer.length === 0) return;

  const batch = [...dataBuffer];
  dataBuffer = []; // esvazia antes do envio

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });

    if (!response.ok) {
      console.error("Falha ao enviar batch:", response.status);
      dataBuffer.push(...batch); // devolve ao buffer caso falhe
    } else {
      console.log(`✔ Enviados ${batch.length} registros.`);
    }
  } catch (err) {
    console.error("Erro ao enviar batch:", err);
    dataBuffer.push(...batch);
  }
}

// dispara envio se buffer ficar muito grande
function checkBatchSize() {
  if (dataBuffer.length >= MAX_BATCH_SIZE) {
    console.log(`⚡ Buffer cheio (${dataBuffer.length}). Enviando imediatamente...`);
    sendBatch();
  }
}

// ============================
// 📌 REGISTRO DE TEMPO
// ============================

function recordTime(tabId, url) {
  const session = activeTabs[tabId];
  if (!session) return;

  const durationSeconds = Math.round((Date.now() - session.startTime) / 1000);

  if (durationSeconds > 5) {
    const domain = new URL(url).hostname;
    dataBuffer.push({
      aluno_id: osUsername,
      url: domain,
      durationSeconds,
      timestamp: new Date().toISOString(),
    });

    console.log(`+ Registro armazenado (${domain} - ${durationSeconds}s)`);
    checkBatchSize();
  }
}

// ============================
// 🔄 EVENTOS DE ABA
// ============================

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const [previousTabId] = Object.keys(activeTabs);

  if (previousTabId) {
    try {
      const previousTab = await browser.tabs.get(parseInt(previousTabId));
      if (previousTab.url?.startsWith('http')) {
        recordTime(parseInt(previousTabId), previousTab.url);
      }
    } catch (e) {}
    delete activeTabs[previousTabId];
  }

  try {
    const currentTab = await browser.tabs.get(activeInfo.tabId);
    if (currentTab.url?.startsWith('http')) {
      activeTabs[currentTab.id] = { startTime: Date.now() };
    }
  } catch (e) {}
});

// ============================
// 🌐 URL mudou
// ============================

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url?.startsWith('http')) {
    recordTime(tabId, changeInfo.url);
    activeTabs[tabId] = { startTime: Date.now() };
  }
});

// ============================
// ⏱️ ENVIO PERIÓDICO
// ============================

browser.alarms.create('sendData', { periodInMinutes: 10 });

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sendData') {
    sendBatch();
  }
});
