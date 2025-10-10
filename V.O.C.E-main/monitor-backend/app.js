// ================================================================
//                       IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// Módulos de Rotas (ADICIONADO RECENTEMENTE)
const apiRoutes = require('./routes/api.js');
const viewRoutes = require('./routes/views.js'); 

const serviceAccount = require('./firebase/firebase-service-account.json');

// Inicialização do Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();
// Exportamos para que as rotas possam usar
module.exports.db = db;
module.exports.auth = auth;

const app = express();
const port = process.env.PORT || 8080;

// ================================================================
//                       CONFIGURAÇÃO DO EXPRESS
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'segredo-muito-forte-aqui',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Middleware de Log e Variáveis Exportadas
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    // Anexamos db, auth e FieldValue ao req para facilitar o acesso nas rotas
    req.db = db;
    req.auth = auth;
    req.FieldValue = FieldValue;
    next();
});

// ================================================================
//                       APLICAÇÃO DAS ROTAS
// ================================================================
app.use('/api', apiRoutes); // Rotas de API (Logs, Classes, Students)
app.use('/', viewRoutes);  // Rotas de Visualização (Login, Dashboard)

// ================================================================
//                       TRATAMENTO DE ERROS E INICIALIZAÇÃO
// ================================================================

// Rota de fallback para erro 404
app.use((req, res) => res.status(404).send('Página não encontrada'));

// Middleware CENTRALIZADO para tratamento de erros 500
app.use((err, req, res, next) => {
    console.error('ERRO CENTRALIZADO NO BACKEND:', err.stack);
    // Para APIs, retorna JSON; para views, renderiza erro ou redireciona
    if (req.originalUrl.startsWith('/api')) {
        res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
    } else {
        res.status(500).send("Erro interno ao processar a requisição.");
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    console.log(`Acesse o dashboard em http://localhost:${port}/dashboard (após o login)`);
});