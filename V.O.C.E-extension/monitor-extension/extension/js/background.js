// ============================
// 🔍 BACKGROUND DO FIREFOX (FINAL)
// ============================

// ============================
// 🔧 CONFIGURAÇÕES
// ============================
let BACKEND_URL = null;
const NATIVE_HOST = 'com.voce.monitor';
let activeTabs = {};
let dataBuffer = [];
let osUsername = 'Desconhecido';
const CPFregex = /^\d{11}$/;
const MAX_BATCH_SIZE = 200;

// ============================
// 🌐 PEGAR BACKEND_URL DO NATIVE HOST
// ============================
function getBackendUrl() {
  chrome.runtime.sendNativeMessage(NATIVE_HOST, { cmd: "get_backend_url" }, (res) => {

    if (chrome.runtime.lastError) {
      console.error("Erro ao obter BACKEND_URL:", chrome.runtime.lastError);
      return;
    }

    if (res?.backend_url) {
      BACKEND_URL = res.backend_url;
      console.log("🌐 URL carregada:", BACKEND_URL);
    } else {
      console.error("⚠ backend_url não encontrada:", res);
    }
  });
}


// ==============================
// 👤 PEGAR USERNAME
// ==============================
function getOSUsername() {

  chrome.runtime.sendNativeMessage(NATIVE_HOST, { cmd: "get_username" }, (res) => {

    if (chrome.runtime.lastError) {
      console.log("⚠️ Host não encontrado:", chrome.runtime.lastError);
      osUsername = 'erro_host_nao_encontrado';
      return;
    }

    if (res?.status === "ok") {
      osUsername = res.username;
    } else {
      osUsername = "erro_script_host";
    }

    if (!CPFregex.test(osUsername)) {
      console.log("👨‍🏫 PROFESSOR detectado → monitoração OFF");
    } else {
      console.log("🎓 ALUNO detectado → monitoração ON");
    }
  });
}

getOSUsername();
getBackendUrl();



// ============================
// 🚀 ENVIO COM BATCH
// ============================

async function sendBatch() {

  if (!CPFregex.test(osUsername)) {
    dataBuffer = [];
    return;
  }

  if (dataBuffer.length === 0) return;

  const batch = [...dataBuffer];
  dataBuffer = [];

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch)
    });

    if (!res.ok) {
      console.error("Falha ao enviar batch:", res.status);
      dataBuffer.push(...batch);
    } else {
      console.log(`✔ Enviados ${batch.length} registros.`);
    }

  } catch (err) {
    console.error("Erro ao enviar batch:", err);
    dataBuffer.push(...batch);
  }
}

function checkBatchSize() {
  if (dataBuffer.length >= MAX_BATCH_SIZE) {
    console.log(`⚡ Buffer cheio (${dataBuffer.length}). Enviando agora...`);
    sendBatch();
  }
}



// ============================
// 📌 REGISTRO DE TEMPO
// ============================

function recordTime(tabId, url) {

  if (!CPFregex.test(osUsername)) return;

  const session = activeTabs[tabId];
  if (!session) return;

  const durationSeconds = Math.round((Date.now() - session.startTime) / 1000);

  if (durationSeconds > 5) {
    const domain = new URL(url).hostname;

    dataBuffer.push({
      aluno_id: osUsername,
      url: domain,
      durationSeconds,
      timestamp: new Date().toISOString()
    });

    console.log(`+ Registro armazenado (${domain} - ${durationSeconds}s)`);

    checkBatchSize();
  }
}



// ============================
// 🔄 EVENTOS DE TROCA DE ABA
// ============================

chrome.tabs.onActivated.addListener((activeInfo) => {

  const prevId = Object.keys(activeTabs)[0];

  if (prevId) {
    chrome.tabs.get(parseInt(prevId), (prevTab) => {
      if (prevTab && prevTab.url && prevTab.url.startsWith("http")) {
        recordTime(parseInt(prevId), prevTab.url);
      }
      delete activeTabs[prevId];
    });
  }

  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url && tab.url.startsWith("http")) {
      activeTabs[tab.id] = { startTime: Date.now() };
    }
  });

});



// ============================
// 🌐 URL mudou
// ============================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

  if (tab.active && changeInfo.url && changeInfo.url.startsWith("http")) {
    recordTime(tabId, changeInfo.url);
    activeTabs[tabId] = { startTime: Date.now() };
  }

});



// ============================
// ⏱️ ENVIO PERIÓDICO
// ============================

chrome.alarms.create("sendData", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "sendData") {
    sendBatch();
  }
});
