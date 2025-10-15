const express = require('express');
const router = express.Router();

// Middleware de Autenticação (Mantido aqui, mas pode ser movido para um 'middlewares/auth.js')
const requireLogin = (req, res, next) => {
    if (req.session && req.session.uid) {
        return next();
    }
    res.redirect('/login');
};

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
router.get('/cadastro', (req, res) => res.render('cadastro', { error: null, pageTitle: 'Cadastro - V.O.C.E' }));

router.post('/createProfile', async (req, res, next) => {
    console.log("Recebido em /createProfile:", req.body);
    // CORRIGIDO: Adicionando 'email' na desestruturação
    const { uid, fullName, username, email } = req.body; 
    
    // CORRIGIDO: Adicionando 'email' na validação
    if (!uid || !fullName || !username || !email) { 
        return res.status(400).json({ error: 'Dados incompletos para criar perfil.' });
    }
    
    try {
        // CORRIGIDO: Usando .set() ao invés de .create() para evitar erro "ALREADY_EXISTS"
        // Adicionando o email e um carimbo de data/hora
        await req.db.collection('professors').doc(uid).set({
            full_name: fullName,
            username: username,
            email: email, // Campo adicionado
            createdAt: req.FieldValue.serverTimestamp() // Boa prática para rastreamento
        });
        
        console.log(`Perfil criado com sucesso no Firestore para UID: ${uid}`);
        res.status(201).json({ success: true, message: 'Perfil do professor criado com sucesso.' });
    } catch (error) {
        console.error('Erro detalhado ao criar perfil no Firestore:', error);
        
        // Tenta limpar o usuário criado no Auth se o Firestore falhar.
        try {
            await req.auth.deleteUser(uid);
            console.log(`Usuário órfão ${uid} deletado do Auth.`);
        } catch (cleanupError) {
            console.error(`Falha CRÍTICA ao limpar usuário órfão ${uid}:`, cleanupError);
            // Continua, pois o erro principal já foi tratado pelo 'next(error)'
        }
        
        // Adicionando uma mensagem de erro mais clara antes de encaminhar
        error.customMessage = 'Falha ao registrar perfil. O usuário no Auth foi deletado para que possa tentar novamente.';
        next(error); // Encaminha o erro
    }
});

router.post('/sessionLogin', async (req, res, next) => {
    const { idToken } = req.body;
    try {
        const decodedToken = await req.auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const professorDoc = await req.db.collection('professors').doc(uid).get();
        if (!professorDoc.exists) {
            console.error(`Login falhou: Perfil não encontrado para o UID: ${uid}.`);
            // Lançar um erro para ser pego no catch
            throw new Error('Professor não encontrado no Firestore.'); 
        }
        req.session.uid = uid;
        req.session.professorName = professorDoc.data().full_name;
        res.status(200).json({ success: true });
    } catch (error) {
        // Para falhas de login, tratamos localmente com 401 antes do next
        res.status(401).json({ error: 'Falha na autenticação.' });
    }
});


router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// ================================================================
//                       ROTAS PROTEGIDAS
// ================================================================

router.get('/dashboard', requireLogin, async (req, res, next) => {
    try {
        const { uid, professorName } = req.session;
        // Otimização: Buscando turmas onde o professor é membro
        const classesSnapshot = await req.db.collection('classes').where('member_ids', 'array-contains', uid).orderBy('name').get();
        const classes = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Melhoria: Usar metadados ou cache para categorias (em vez de ler todos os logs)
        // Por enquanto, mantemos a lógica original para evitar quebrar o código:
        const logsSnapshot = await req.db.collection('logs').get();
        const categoriesSet = new Set();
        logsSnapshot.forEach(doc => {
            const categoria = doc.data().categoria;
            if (categoria) categoriesSet.add(categoria);
        });
        
        res.render('dashboard', { 
            pageTitle: 'Dashboard', 
            professorName, 
            classes, 
            categories: Array.from(categoriesSet).sort()
        });
    } catch (error) {
        // Encaminha o erro para o middleware CENTRALIZADO
        next(error);
    }
});

// ROTA 1: GET /perfil (Carrega a página e os dados)
router.get('/perfil', requireLogin, async (req, res, next) => {
    try {
        const { uid } = req.session;
        // Usa req.db para acessar o Firestore
        const doc = await req.db.collection('professors').doc(uid).get();
        
        if(!doc.exists) return res.redirect('/logout');
        
        res.render('perfil', {
            pageTitle: 'Meu Perfil',
            user: doc.data(),
            success: req.query.success
        });
    } catch (error) {
        // Encaminha o erro para o middleware centralizado
        next(error);
    }
});

// ROTA 2: POST /perfil (Atualiza os dados do perfil)
router.post('/perfil', requireLogin, async (req, res, next) => {
    const { fullName } = req.body;
    const { uid } = req.session;
    
    // Rota de View: Validação falha redireciona
    if (!fullName) return res.redirect('/perfil'); 
    
    try {
        // Usa req.db para acessar o Firestore
        await req.db.collection('professors').doc(uid).update({ full_name: fullName });
        req.session.professorName = fullName;
        
        // Rota de View: Sucesso redireciona
        res.redirect('/perfil?success=true');
    } catch (error) {
        // Encaminha o erro para o middleware centralizado
        next(error);
    }
});



module.exports = router;