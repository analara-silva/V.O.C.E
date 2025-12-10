// ================================================================
//                           Orquestrador de Classificação - V.O.C.E TCC
// ================================================================

const { spawn } = require('child_process');
const path = require('path');
const simpleClassifier = require('./simple_classifier.js');

const { 
  getCachedCategory,
  cacheCategory
} = require("../services/redisService.js");

const classifier = {
  categorizar: async function(domain) {

    // ============================================================
    // 1. TENTAR PEGAR O RESULTADO DO REDIS
    // ============================================================
    const cached = await getCachedCategory(domain);

    if (cached) {
      console.log(`[Redis] Cache encontrado: ${domain} -> ${cached}`);
      return cached;
    }

    // ============================================================
    // 2. CLASSIFICADOR SIMPLES (DATASET)
    // ============================================================
    const simpleResult = await simpleClassifier.categorizar(domain);

    if (simpleResult !== 'Outros') {
      console.log(`[Classificador Simples] Sucesso: ${domain} -> ${simpleResult}`);

      // salva no redis
      await cacheCategory(domain, simpleResult);

      return simpleResult;
    }

    // ============================================================
    // 3. IA PYTHON – CNN FINAL
    // ============================================================
    console.log(`[IA Python] Acionando IA (CNN Final) para '${domain}'...`);

    return new Promise((resolve) => {

      const scriptPath = path.join(
        __dirname,
        '..',
        'classifier-tf',
        'cnn',
        'predict_cnn.py'
      );

      const pythonProcess = spawn('python', [scriptPath, domain]);

      let resultJson = '';
      let error = '';

      pythonProcess.stdout.on('data', (data) => {
        resultJson += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      pythonProcess.on('close', async (code) => {

        if (code === 0 && resultJson.trim() !== '') {
          try {
            const resultData = JSON.parse(resultJson);

            if (resultData.category) {
              console.log(
                `[IA Python] Sucesso: ${domain} -> ${resultData.category} (Confiança: ${resultData.confidence.toFixed(2)})`
              );

              // salva no redis
              await cacheCategory(domain, resultData.category);

              return resolve(resultData.category);
            }

            console.error(`[IA Python] Script retornou erro:`, resultData.error);
            return resolve('Outros');

          } catch (e) {
            console.error(`[IA Python] Erro ao parsear JSON:`, e, `Raw: ${resultJson}`);
            return resolve('Outros');
          }
        }

        console.error(`[IA Python] Falha ao classificar '${domain}':`, error);
        resolve('Outros');
      });

      pythonProcess.on('error', (err) => {
        console.error(`[IA Python] Erro crítico ao iniciar processo:`, err);
        resolve('Outros');
      });
    });
  }
};

module.exports = classifier;
