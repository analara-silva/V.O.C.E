// ================================================================
//         Classificador Simples por Dataset - V.O.C.E TCC
// ================================================================

const fs = require('fs');
const path = require('path');

const categoryMap = {};

// Detecta se o domínio é um IP interno
function isInternalIP(domain) {
  // Garante formato padronizado
  const ip = domain.trim();

  // 10.x.x.x
  if (ip.startsWith("10.")) return true;

  // 192.168.x.x
  if (ip.startsWith("192.168.")) return true;

  // 172.16.x.x até 172.31.x.x
  if (ip.startsWith("172.")) {
    const parts = ip.split(".");
    const second = parseInt(parts[1]);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
};

try {
    const datasetPath = path.join(__dirname, '..', 'classifier-tf', 'dataset.csv');
    const csvData = fs.readFileSync(datasetPath, 'utf8');
    const lines = csvData.split(/\r?\n/);
    lines.forEach(line => {
        if (line && line.toLowerCase().trim() !== 'dominio,categoria') {
            const parts = line.split(',');
            if (parts.length === 2) {
                const domain = parts[0].trim().toLowerCase();
                const category = parts[1].trim();
                if(domain && category) {
                    categoryMap[domain] = category;
                }
            }
        }
    });
    console.log(`[Fallback Simples] Dataset carregado com ${Object.keys(categoryMap).length} domínios.`);
} catch (error) {
    console.error('[Fallback Simples] Erro crítico: Não foi possível carregar o dataset.csv.', error);
}

const classifier = {
  categorizar: async function(domain) {
    if (!domain) return 'Outros';

    let normalizedDomain = domain
      .toLowerCase()
      .replace('www.', '')
      .trim();

    // 🔥 Nova regra: IP interno = categoria interna
    if (isInternalIP(normalizedDomain)) {
        return 'Interno';
    }

    // Regras do dataset
    if (categoryMap[normalizedDomain]) {
        return categoryMap[normalizedDomain];
    }

    const baseDomainMatch = Object.keys(categoryMap).find(key =>
      normalizedDomain.endsWith('.' + key)
    );
    if (baseDomainMatch) {
      return categoryMap[baseDomainMatch];
    }

    return 'Outros';
}};

module.exports = classifier;

