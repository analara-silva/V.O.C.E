// ============================
// 🔍 BACKGROUND DO FIREFOX (FINAL)
// ============================

// ============================
// 🔧 CONFIGURAÇÕES
// ============================

const NATIVE_HOST = "com.meutcc.monitor";
let BACKEND_URL = null;              
let activeTabs = {};
let dataBuffer = [];
let osUsername = "Desconhecido";
let ready = false;

const CPFregex = /^\d{11}$/;
const MAX_BATCH_SIZE = 200;


// ============================
// 🌐 PEGAR BACKEND_URL DO NATIVE HOST
// ============================

async function getBackendUrl() {
  try {
    const res = await browser.runtime.sendNativeMessage(NATIVE_HOST, {
      cmd: "get_backend_url"
    });

    if (res?.backend_url) {
      BACKEND_URL = res.backend_url;
      console.log("🌐 URL do servidor carregada:", BACKEND_URL);
    } else {
      console.error("❌ Native Host respondeu sem backend_url");
    }

  } catch (err) {
    console.error("❌ Erro ao carregar BACKEND_URL:", err);
  }

  ready = true; // agora os eventos podem iniciar
}

// ============================
// 🧠 PEGAR USERNAME DO SISTEMA
// ============================

async function getOSUsername() {
  try {
    const res = await browser.runtime.sendNativeMessage(NATIVE_HOST, {
      cmd: "get_username"
    });

    if (res?.status === "success") {
      osUsername = res.username?.trim() || "erro_script_host";
    } else {
      osUsername = "erro_script_host";
    }

  } catch (err) {
    osUsername = "erro_host_nao_encontrado";
  }

  console.log("👤 Sistema retornou username:", osUsername);
}




getOSUsername();
getBackendUrl();



// ============================
// 🚀 ENVIO COM BATCH
// ============================

async function sendBatch() {

  if (!ready) return;

  if (!CPFregex.test(osUsername)) {
    console.log("⛔ Professor detectado — bloqueando envio.");
    dataBuffer = [];
    return;
  }

  if (!BACKEND_URL) {
    console.log("⛔ BACKEND_URL não carregado ainda.");
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
      return;
    }

    console.log(`✔ Enviados ${batch.length} registros.`);

  } catch (e) {
    console.error("Erro ao enviar batch:", e);
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

  if (!ready) return;

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
      timestamp: new Date().toISOString(),
    });

    console.log(`+ Registro armazenado (${domain} - ${durationSeconds}s)`);

    checkBatchSize();
  }
}



// ============================
// 🔄 TROCA DE ABA
// ============================

browser.tabs.onActivated.addListener(async (activeInfo) => {

  if (!ready) return;

  const prevId = Object.keys(activeTabs)[0];

  if (prevId) {
    try {
      const prevTab = await browser.tabs.get(parseInt(prevId));
      if (prevTab.url && prevTab.url.startsWith("http")) {
        recordTime(parseInt(prevId), prevTab.url);
      }
    } catch (e) {}

    delete activeTabs[prevId];
  }

  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    if (tab.url && tab.url.startsWith("http")) {
      activeTabs[tab.id] = { startTime: Date.now() };
    }
  } catch (error) {}

});



// ============================
// 🌐 URL MUDOU
// ============================

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

  if (!ready) return;

  if (tab.active && changeInfo.url && changeInfo.url.startsWith("http")) {
    recordTime(tabId, changeInfo.url);
    activeTabs[tabId] = { startTime: Date.now() };
  }
});



// ============================
// ⏱️ ENVIO PERIÓDICO
// ============================

browser.alarms.create("sendData", { periodInMinutes: 10 });

browser.alarms.onAlarm.addListener((alarm) => {
  if (!ready) return;

  if (alarm.name === "sendData") {
    sendBatch();
  }
});
