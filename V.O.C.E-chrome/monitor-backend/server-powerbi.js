// ================================================================
//                 TESTE COM UTILIZAÇÃO DO POWER BI
// ================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const mysql = require('mysql2/promise');
const classifier = require('./classifier/python_classifier'); 

const app = express();
const port = 3000;

// <-- MUDANÇA AQUI: Adicionamos a variável para a URL do Power BI no topo
const POWER_BI_PUSH_URL = '';

// ================================================================
//                  CONFIGURAÇÃO DO EXPRESS (EJS)
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());


// ================================================================
//                  ROTAS DA API
// ================================================================

app.post('/api/data', async (req, res) => {
    const dataFromExtension = req.body;
    try {
        const classificationPromises = dataFromExtension.map(log => classifier.categorizar(log.url));
        const categories = await Promise.all(classificationPromises);
        
        const enrichedData = dataFromExtension.map((log, index) => ({ ...log, categoria: categories[index] }));
        
        // --- MUDANÇA AQUI: Envia os mesmos dados para o Power BI ---
        try {
            if (!POWER_BI_PUSH_URL.startsWith('http')) {
                console.warn("URL do Power BI não configurada. Pulando envio.");
            } else {
                const responseBI = await fetch(POWER_BI_PUSH_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(enrichedData)
                });
                if (responseBI.ok) {
                    console.log('Dados também enviados para o Power BI com sucesso!');
                } else {
                    console.error('Falha ao enviar dados para o Power BI:', responseBI.status, await responseBI.text());
                }
            }
        } catch (powerBiError) {
            console.error("Erro na comunicação com a API do Power BI:", powerBiError);
        }
        // -----------------------------------------------------------

        res.status(200).send({ message: 'Dados recebidos e salvos.' });

    } catch (error) {
        console.error('Erro em /api/data:', error);
        res.status(500).send({ message: 'Erro interno no servidor.' });
    }
});

// ================================================================
//                  INICIALIZAÇÃO DO SERVIDOR
// ================================================================
app.listen(port, () => {
  console.log(`Servidor rodando! Acesse o dashboard em http://localhost:${port}/dashboard`);
});