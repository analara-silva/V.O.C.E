const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../models/db');
const { requireLogin} = require('../middlewares/auth'); // Importa middleware


// ================================================================
//                       ROTAS PÚBLICAS
// ================================================================

router.get('/', (req, res) => {
    res.render('landpage', {
        pageTitle: 'V.O.C.E - Monitorização Inteligente',
        isLoggedIn: !!req.session.uid
    });
});

router.get('/login', (req, res) => res.render('login', { error: null, message: req.query.message || null, pageTitle: 'Login - V.O.C.E' }));

router.get('/cadastro', (req, res) => res.render('cadastro', { pageTitle: 'Cadastro' }));

// Rota de cadastro (resposta JSON)
router.post('/cadastro', async (req, res) => {
    const { fullName, username, email, password } = req.body;
    if (!fullName || !username || !email || !password) {
        return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
        await pool.query(
            'INSERT INTO professors (full_name, username, email, password_hash) VALUES (?, ?, ?, ?)',
            [fullName, username, email, hashedPassword]
        );
        res.status(201).json({ success: true, message: 'Cadastro realizado com sucesso!' });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Email ou nome de usuário já está em uso.' });
        }
        res.status(500).json({ success: false, message: 'Erro interno ao tentar realizar o cadastro.' });
    }
});

// Rota de login (resposta JSON)
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios.' });
    }
    try {
        const [rows] = await pool.query('SELECT * FROM professors WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Email ou senha inválidos.' });
        }
        const professor = rows[0];
        const match = await bcrypt.compare(password, professor.password_hash); // Compare hashed password
        if (match) {
            // Store professor info in session
            req.session.professorId = professor.id;
            req.session.professorName = professor.full_name;
            req.session.save((err) => { // Explicitly save session before responding
                if (err) {
                    console.error('Erro ao salvar sessão:', err);
                    return res.status(500).json({ success: false, message: 'Erro interno ao iniciar sessão.' });
                }
                res.status(200).json({ success: true }); // Send success to frontend
            });
        } else {
            res.status(401).json({ success: false, message: 'Email ou senha inválidos.' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor durante o login.' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
             console.error('Erro ao destruir sessão:', err);
             return res.status(500).send('Não foi possível fazer logout.');
        }
        res.clearCookie('connect.sid'); // Optional: Clear the session cookie
        res.redirect('/');
    });
});

router.get('/termos', (req, res) => {res.render('termos-de-uso', { pageTitle: 'V.O.C.E | Termos de Uso' });});

router.get('/politicas', (req, res) => {res.render('politicas-de-privacidade', { pageTitle: 'V.O.C.E | Politícas de Privacidade' });});


// ================================================================
//      ROTAS DE PÁGINAS PROTEGIDAS (RENDERIZAÇÃO EJS COM DADOS SQL)
// ================================================================
router.get('/dashboard',  async (req, res) => {
    try {
        const [classes] = await pool.query('SELECT c.id, c.name FROM classes c JOIN class_members cm ON c.id = cm.class_id WHERE cm.professor_id = ? ORDER BY c.name', [req.session.professorId]);
        // Fetch distinct categories directly from logs table for the filter dropdown
        const [categoriesResult] = await pool.query('SELECT DISTINCT categoria FROM logs WHERE categoria IS NOT NULL ORDER BY categoria');
        const categories = categoriesResult.map(c => c.categoria);
        res.render('dashboard', { pageTitle: 'Dashboard', professorName: req.session.professorName, classes, categories });
    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro ao carregar o dashboard.' });
    }
});

router.get('/gerenciamento', async (req, res) => {
    try {
        const [classes] = await pool.query('SELECT c.id, c.name FROM classes c JOIN class_members cm ON c.id = cm.class_id WHERE cm.professor_id = ? ORDER BY c.name', [req.session.professorId]);
        res.render('gerenciamento', { pageTitle: 'Gestão', professorName: req.session.professorName, classes });
    } catch (error) {
        console.error("Erro ao carregar gerenciamento:", error);
         res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro ao carregar a página de gerenciamento.' });
    }
});

router.get('/perfil', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, full_name, username, email FROM professors WHERE id = ?', [req.session.professorId]);
        if (rows.length === 0) return res.redirect('/logout'); // Should not happen if logged in
        res.render('perfil', { pageTitle: 'Meu Perfil', user: rows[0], success: req.query.success, professorName: req.session.professorName });
    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro ao carregar o perfil.' });
    }
});

router.post('/perfil', async (req, res) => {
    const { fullName } = req.body;
    if (!fullName || fullName.trim() === '') {
        // Redirect back with an error message (optional)
        return res.redirect('/perfil?error=Nome não pode ser vazio');
    }
    try {
        await pool.query('UPDATE professors SET full_name = ? WHERE id = ?', [fullName.trim(), req.session.professorId]);
        req.session.professorName = fullName.trim(); // Update name in session
        req.session.save(err => { // Save session explicitly
             if (err) { console.error('Erro ao salvar nome na sessão:', err); }
             res.redirect('/perfil?success=true');
        });
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro ao atualizar o perfil.' });
    }
});


module.exports = router;