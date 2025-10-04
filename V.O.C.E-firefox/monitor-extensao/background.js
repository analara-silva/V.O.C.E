// background.js (VERSÃO PARA CONFIGURAÇÃO MANUAL NO FIREFOX)

let activeTabs = {};
let dataBuffer = [];
const BACKEND_URL = 'http://localhost:8080/api/data';
let identifier = 'nao_configurado'; // Valor padrão

// O namespace 'browser' é o padrão para WebExtensions
const storage = browser.storage.local;

// Função para carregar o identificador salvo
function loadIdentifier() {
  storage.get("identifier").then((result) => {
    if (result.identifier) {
      identifier = result.identifier;
      console.log(`Identificador carregado: ${identifier}`);
    } else {
      console.log('Nenhum identificador configurado. Use a página de opções da extensão.');
    }
  });
}

// Carrega o identificador quando a extensão inicia
loadIdentifier();

// Ouve por mudanças, caso o usuário salve um novo identificador com a extensão aberta
storage.onChanged.addListener((changes) => {
    if (changes.identifier) {
        identifier = changes.identifier.newValue;
        console.log(`Identificador atualizado para: ${identifier}`);
    }
});


// O resto do código (sendDataToServer, recordTime, listeners) permanece o mesmo,
// mas a função recordTime usará a nova variável 'identifier'.

async function sendDataToServer() {
  if (dataBuffer.length === 0) return;
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataBuffer),
    });
    if (response.ok) {
      console.log('Dados enviados com sucesso:', dataBuffer);
      dataBuffer = [];
    } else {
      console.error('Falha ao enviar dados para o servidor:', response.statusText);
    }
  } catch (error) {
    console.error('Erro de rede:', error);
  }
}

function recordTime(tabId, url) {
  if (activeTabs[tabId]) {
    const startTime = activeTabs[tabId].startTime;
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const domain = new URL(url).hostname;
    if (durationSeconds > 5) {
      dataBuffer.push({
        aluno_id: identifier, // Usa a variável 'identifier'
        url: domain,
        durationSeconds: durationSeconds,
        timestamp: new Date().toISOString()
      });
      console.log(`[${identifier}] Tempo para ${domain}: ${durationSeconds}s`);
    }
  }
}

chrome.tabs.onActivated.addListener(activeInfo => {
  const previousTabId = Object.keys(activeTabs)[0];
  if (previousTabId) {
    chrome.tabs.get(parseInt(previousTabId), (tab) => {
        if (!chrome.runtime.lastError && tab && tab.url && tab.url.startsWith('http')) {
             recordTime(parseInt(previousTabId), tab.url);
        }
        delete activeTabs[previousTabId];
    });
  }

  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!chrome.runtime.lastError && tab.url && tab.url.startsWith('http')) {
      activeTabs[tab.id] = { startTime: Date.now() };
    }
  });
});

// Evento disparado quando uma URL na aba é atualizada
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url && changeInfo.url.startsWith('http')) {
      // Grava o tempo da URL anterior antes de atualizar
      recordTime(tabId, changeInfo.url);
      // Reinicia o contador para a nova URL
      activeTabs[tabId] = { startTime: Date.now() };
    }
});


// Cria um alarme para enviar os dados periodicamente (a cada 5 minutos)
chrome.alarms.create('sendData', { periodInMinutes: 5 });

// Escuta o alarme
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'sendData') {
    sendDataToServer();
  }
});