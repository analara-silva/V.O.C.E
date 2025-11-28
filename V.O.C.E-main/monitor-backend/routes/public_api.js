const express = require('express');
const router = express.Router();
const { pool } = require('../models/db');
const classifier = require('../classifier/python_classifier');
const { extractHostname } = require('../utils/url-helper');

// ================================================================
//      APIs PÚBLICAS (SEM AUTENTICAÇÃO)
// ================================================================

// --- Coleta de Logs ---
router.post('/logs', async (req, res) => {
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    const io = req.io // O io é injetado pelo middleware no arquivo principal
    if (!logs || logs.length === 0) return res.status(400).send('Nenhum log recebido.');

    try {
        // Obter hostnames únicos e aplicar overrides
        const uniqueHostnames = [...new Set(logs.map(log => {
            try { return new URL(`http://${log.url}` ).hostname.toLowerCase(); }
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

    // Preparar dados para inserção
    const values = await Promise.all(logs.map(async log => {
    let category = 'Não Categorizado';
    let hostname = '';
    
    try { 
        hostname = extractHostname(log.url); 
    } catch(e) { 
        hostname = log.url.toLowerCase(); 
    }

    if (overrides[hostname]) {
        category = overrides[hostname];
    } else if (log.url) {
        // NOVO: Adiciona try/catch ao redor do classificador
        try {
            category = await classifier.categorizar(log.url);
        } catch (classifierError) {
            console.error(`Erro ao classificar URL ${log.url}:`, classifierError);
            // Mantém a categoria como 'Não Categorizado'
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

        if (values.length > 0) await pool.query(
            'INSERT INTO logs (aluno_id, url, duration, categoria, timestamp) VALUES ?', [values]
        );

        // Monta contagem por categoria para atualizar o gráfico
        const categoryCounts = {};
        values.forEach(([aluno_id, url, duration, categoria]) => {
            categoryCounts[categoria] = (categoryCounts[categoria] || 0) + 1;
        });

        // EMISSÃO DO SOCKET.IO
        console.log("api/public/logs: ", io)
        if (io) {
        // Busca os nomes dos alunos para os logs recém-inseridos
        const studentIds = [...new Set(values.map(v => v[0]))];
        const [students] = await pool.query(
            'SELECT full_name, cpf, pc_id FROM students WHERE cpf IN (?) OR pc_id IN (?)', [studentIds, studentIds]
        );
    
        const studentMap = new Map();
        students.forEach(s => {
        if (s.pc_id) studentMap.set(s.pc_id, s.full_name);
        if (s.cpf) studentMap.set(s.cpf, s.full_name);
        });
        
        console.log('Enviando dados pro dashboard:', { 
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
