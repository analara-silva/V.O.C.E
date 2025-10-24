// ================================================================
//                       IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');

const requireLogin = require('./middlewares/auth.js')

// Módulos de Rotas (ADICIONADO RECENTEMENTE)
const apiRoutes = require('./routes/api.js');
const viewRoutes = require('./routes/views.js'); 

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
    secret: 'chave-secreta-para-a-versao-oficial-do-tcc',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 1 dia
}));

app.use(['/api', '/dashboard'], requireLogin);


// ================================================================
//                       APLICAÇÃO DAS ROTAS
// ================================================================
app.use('/api', apiRoutes); // Rotas de API (Logs, Classes, Students)
app.use('/', viewRoutes);  // Rotas de Visualização (Login, Dashboard)

// ================================================================
//                       TRATAMENTO DE ERROS E INICIALIZAÇÃO
// ================================================================

// Rota de fallback para erro 404
app.use((req, res) => res.status(404).render('error404'));

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
    console.log(`🚀 Servidor oficial V.O.C.E rodando em http://localhost:${port}`);
});