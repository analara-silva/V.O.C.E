// background.js - VERSÃO UNIFICADA (Chrome + Firefox) com Native Messaging

// Polyfill para compatibilidade com browser.*
importScripts('./browser-polyfill.min.js');

// ============================
// 🌐 VARIÁVEIS GLOBAIS
// ============================

const BACKEND_URL = 'http://localhost:8080/api/logs';
const NATIVE_HOST = 'com.meutcc.monitor';

let activeTabs = {};
let dataBuffer = [];
let osUsername = 'carregando...'; // Valor inicial até o nome do usuário ser carregado

// ============================
// 🧠 FUNÇÃO: Obter nome de usuário via Native Messaging
// ============================

function getOSUsername() {
  console.log(`Tentando obter nome de usuário via host nativo: ${NATIVE_HOST}`);

  browser.runtime.sendNativeMessage(NATIVE_HOST, { text: "get_username_request" })
    .then(response => {
      if (response?.status === 'success') {
        osUsername = response.username;
        console.log('Nome de usuário do SO obtido com sucesso:', osUsername);
      } else {
        console.error('Erro do host nativo:', response?.message || 'Resposta vazia');
        osUsername = 'erro_script_host';
      }
    })
    .catch(error => {
      console.error('ERRO NATIVE MESSAGING (Conexão):', error);
      osUsername = 'erro_host_nao_encontrado';
    });
}

getOSUsername();

// ============================
// 🛰️ FUNÇÃO: Enviar dados para o servidor
// ============================

async function sendDataToServer() {
  if (dataBuffer.length === 0) return;

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataBuffer),
    });

    if (response.ok) {
      console.log('Dados enviados com sucesso.');
      dataBuffer = [];
    } else {
      console.error('Falha ao enviar dados:', response.statusText);
    }
  } catch (error) {
    console.error('Erro de rede ao enviar dados:', error);
  }
}

// ============================
// ⏱️ FUNÇÃO: Registrar tempo de uso da aba
// ============================

function recordTime(tabId, url) {
  const session = activeTabs[tabId];
  if (!session) return;

  const durationSeconds = Math.round((Date.now() - session.startTime) / 1000);
  const domain = new URL(url).hostname;

  if (durationSeconds > 5) {
    dataBuffer.push({
      aluno_id: osUsername,
      url: domain,
      durationSeconds,
      timestamp: new Date().toISOString(),
    });
    console.log(`[${osUsername}] Tempo para ${domain}: ${durationSeconds}s`);
  }
}

// ============================
// 📌 EVENTO: Mudança de aba ativa
// ============================

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const [previousTabId] = Object.keys(activeTabs);

  if (previousTabId) {
    try {
      const previousTab = await browser.tabs.get(parseInt(previousTabId));
      if (previousTab?.url?.startsWith('http')) {
        recordTime(parseInt(previousTabId), previousTab.url);
      }
    } catch (error) {
      console.error('Erro ao acessar aba anterior:', error);
    }
    delete activeTabs[previousTabId];
  }

  try {
    const currentTab = await browser.tabs.get(activeInfo.tabId);
    if (currentTab.url?.startsWith('http')) {
      activeTabs[currentTab.id] = { startTime: Date.now() };
    }
  } catch (error) {
    console.error('Erro ao acessar aba atual:', error);
  }
});

// ============================
// 🔄 EVENTO: Atualização de aba (URL mudou)
// ============================

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url?.startsWith('http')) {
    recordTime(tabId, changeInfo.url);
    activeTabs[tabId] = { startTime: Date.now() };
  }
});

// ============================
// ⏰ ALARME: Envio periódico dos dados
// ============================

browser.alarms.create('sendData', { periodInMinutes: 1 });

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'sendData') {
    sendDataToServer();
  }
});
