const express = require('express');
const router = express.Router();
const { pool } = require('../models/db');
const classifier = require('../classifier/python_classifier');
const { extractHostname } = require('../utils/url-helper');
const { getCachedCategory, cacheCategory } = require("../services/redisService");

// ================================================================
//      FUNÇÕES AUXILIARES (REGRA DE NEGÓCIO)
// ================================================================

/**
 * Classificação Rápida por Regex (Heurística)
 * Detecta padrões óbvios para economizar processamento da IA.
 */
function fastCategorization(url) {
    const u = url.toLowerCase();
    
    // --- 1. PRIORIDADE MÁXIMA: Inteligência Artificial (IA) ---
    // Estes devem ser checados antes de 'google.com' ou 'microsoft.com'
    const iaDomains = [
        'chatgpt.com', 'openai.com', 'chat.openai.com',
        'gemini.google.com', 'bard.google.com',
        'claude.ai', 'anthropic.com',
        'bing.com/chat', 'copilot.microsoft.com',
        'perplexity.ai', 'character.ai',
        'midjourney.com', 'leonardo.ai',
        'huggingface.co', 'poe.com'
    ];
    
    if (iaDomains.some(domain => u.includes(domain))) {
        return 'IA';
    }

    // --- 2. IPs e Localhost (Produtividade) ---
    if (u.startsWith('localhost') || u.includes('127.0.0.1')) return 'Produtividade & Ferramentas';
    // Regex para IPs (ex: 192.168.0.1)
    if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(u)) return 'Produtividade & Ferramentas';

    // --- 3. Governo e Militar ---
    if (u.includes('.gov.br') || u.includes('.jus.br') || u.includes('.mil.br')) return 'Governo';
    
    // --- 4. Educacional e Institucional ---
    if (u.includes('.edu.br') || u.includes('ava.') || u.includes('moodle') || u.includes('portal.senai') || u.includes('sp.senai')) return 'Produtividade & Ferramentas';
    
    // --- 5. Lojas ---
    if (u.includes('shop') || u.includes('store') || u.includes('loja.') || u.includes('vendas.') || u.includes('mercadolivre') || u.includes('amazon')) return 'Loja Digital';
    
    // --- 6. Redes Sociais ---
    if (u.includes('tiktok.') || u.includes('instagram.') || u.includes('facebook.') || u.includes('twitter.') || u.includes('x.com')) return 'Rede Social';

    return null; // Se não cair em nenhum, vai para a IA (Python) ou 'Outros'
}

// ================================================================
//      APIs PÚBLICAS (SEM AUTENTICAÇÃO - EXTENSÃO CHAMA AQUI)
// ================================================================

// --- Coleta de Logs ---
router.post('/logs', async (req, res) => {
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    const io = req.io; // O io é injetado pelo middleware no arquivo principal
    
    if (!logs || logs.length === 0) return res.status(400).send('Nenhum log recebido.');

    try {
        // 1. Obter hostnames únicos para buscar overrides no banco
        const uniqueHostnames = [...new Set(logs.map(log => {
            try { return new URL(`http://${log.url}`).hostname.toLowerCase(); } 
            catch (e) { return log.url.toLowerCase(); }
        }).filter(Boolean))];

        let overrides = {};
        if (uniqueHostnames.length > 0) {
            const [overrideRows] = await pool.query(
                'SELECT hostname, category FROM category_overrides WHERE hostname IN (?)', 
                [uniqueHostnames]
            );
            overrides = overrideRows.reduce((map, row) => { map[row.hostname] = row.category; return map; }, {});
        }

        // 2. Processar cada log e definir a categoria final
        const values = await Promise.all(logs.map(async log => {
            let category = 'Não Categorizado';
            let hostname = '';
            
            try { 
                hostname = extractHostname(log.url); 
            } catch(e) { 
                hostname = log.url.toLowerCase(); 
            }

            // --- FLUXO DE DECISÃO HÍBRIDO COM REDIS ---
            
            // A. Override do professor (PRIORIDADE MÁXIMA)
            if (overrides[hostname]) {
                category = overrides[hostname];
            } 
            // B. Redis (cache de classificações já feitas)
            else {
                const cached = await getCachedCategory(hostname);
                if (cached) {
                    console.log(`[Redis] Cache encontrado: ${hostname} -> ${cached}`);
                    category = cached;
                }
                else {
                    // C. Regex rápido
                    const fastCat = fastCategorization(log.url);
                    
                    if (fastCat) {
                        category = fastCat;
                        console.log(`[FAST] Regex identificou: ${hostname} -> ${category}`);
                        // salva no redis
                        await cacheCategory(hostname, category);
                    }
                    else {
                        // D. Classificação pela IA
                        try {
                            category = await classifier.categorizar(log.url);
                            // salva no redis
                            await cacheCategory(hostname, category);
                        } catch (classifierError) {
                            console.error(`Erro ao classificar URL ${log.url}:`, classifierError);
                            category = 'Outros';
                        }
                    }
                }
            }

            return [
                 log.aluno_id,
                 log.url || '',
                 log.durationSeconds || 0,
                 category,
                 new Date(log.timestamp || Date.now())
             ];
        }));

        // 3. Inserir no Banco de Dados
        if (values.length > 0) await pool.query(
            'INSERT INTO logs (aluno_id, url, duration, categoria, timestamp) VALUES ?', [values]
        );

        // 4. Preparar dados para o Dashboard em Tempo Real (Socket.IO)
        const categoryCounts = {};
        values.forEach(([aluno_id, url, duration, categoria]) => {
            categoryCounts[categoria] = (categoryCounts[categoria] || 0) + 1;
        });

        if (io) {
            // Busca nomes dos alunos para enriquecer o evento do socket
            const studentIds = [...new Set(values.map(v => v[0]))];
            let studentMap = new Map();
            
            if (studentIds.length > 0) {
                const [students] = await pool.query(
                    'SELECT full_name, cpf, pc_id FROM students WHERE cpf IN (?) OR pc_id IN (?)', 
                    [studentIds, studentIds]
                );
                students.forEach(s => {
                    if (s.pc_id) studentMap.set(s.pc_id, s.full_name);
                    if (s.cpf) studentMap.set(s.cpf, s.full_name);
                });
            }
            
            // Emite o evento para atualizar a tela do professor
            io.emit('logs_updated', { 
                count: values.length,
                categoryCounts,
                logs: values.map(([aluno_id, url, duration, categoria, timestamp]) => ({ 
                     aluno_id, 
                     url, 
                     duration, 
                     categoria,
                     timestamp,
                    student_name: studentMap.get(aluno_id) || null
                })) 
            });
        }
   
        res.status(200).send('Logs salvos com sucesso.');

    } catch (error) {
        console.error('Erro ao salvar logs:', error);
        res.status(500).send('Erro interno ao processar os logs.');
    }
});

module.exports = router;