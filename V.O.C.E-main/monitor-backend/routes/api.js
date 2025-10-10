const express = require('express');
const router = express.Router();
const classifier = require('../classifier/python_classifier.js'); // Módulo de classificação

// O db, auth e FieldValue são injetados via middleware no app.js: req.db, req.auth, req.FieldValue

// Middleware de Autenticação (Para APIs, retorna 401 Unauthorized)
const requireLogin = (req, res, next) => {
    if (req.session && req.session.uid) {
        return next();
    }
    res.status(401).json({ error: 'Não autorizado. Faça login.' });
};

// ================================================================
//                       ROTAS DE AUTENTICAÇÃO E PERFIL (POSTS)
// ================================================================

router.post('/createProfile', async (req, res, next) => {
    console.log("Recebido em /api/createProfile:", req.body);
    const { uid, fullName, username } = req.body;
    if (!uid || !fullName || !username) {
        return res.status(400).json({ error: 'Dados incompletos para criar perfil.' });
    }
    try {
        await req.db.collection('professors').doc(uid).create({
            full_name: fullName,
            username: username
        });
        console.log(`Perfil criado com sucesso no Firestore para UID: ${uid}`);
        res.status(201).json({ success: true, message: 'Perfil do professor criado com sucesso.' });
    } catch (error) {
        console.error('Erro detalhado ao criar perfil no Firestore:', error);
        try {
            await req.auth.deleteUser(uid);
            console.log(`Usuário órfão ${uid} deletado do Auth.`);
        } catch (cleanupError) {
            console.error(`Falha CRÍTICA ao limpar usuário órfão ${uid}:`, cleanupError);
        }
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

// ================================================================
//                       ROTA PARA RECEBER LOGS DA EXTENSÃO
// ================================================================

router.post('/logs', async (req, res, next) => {
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    if (!logs || logs.length === 0) return res.status(400).send('Nenhum log recebido.');
    
    try {
        const batch = req.db.batch();
        for (const log of logs) {
            if (log.url && log.durationSeconds && log.aluno_id && log.timestamp) {
                const category = await classifier.categorizar(log.url);
                const logRef = req.db.collection('logs').doc();
                batch.set(logRef, {
                    aluno_id: log.aluno_id,
                    url: log.url,
                    duration: log.durationSeconds,
                    timestamp: new Date(log.timestamp),
                    categoria: category
                });
            }
        }
        await batch.commit();
        console.log(`${logs.length} logs foram salvos no Firestore.`);
        res.status(200).send('Logs recebidos e processados com sucesso.');
    } catch (error) {
        next(error); // Tratamento de erro centralizado
    }
});

// ================================================================
//                       APIs DE GESTÃO DE TURMAS (CLASSES)
// ================================================================

// Criação de Turma
router.post('/classes', requireLogin, async (req, res, next) => {
    const { name } = req.body;
    const { uid } = req.session;
    if (!name) return res.status(400).json({ error: 'Nome da turma é obrigatório' });
    try {
        const docRef = await req.db.collection('classes').add({ 
            name, 
            owner_id: uid,
            member_ids: [uid], 
            student_ids: [] 
        });
        res.status(201).json({ success: true, message: 'Turma criada com sucesso!', classId: docRef.id });
    } catch (error) {
        next(error);
    }
});

// Atualização de Turma
router.put('/classes/:classId', requireLogin, async (req, res, next) => {
    const { classId } = req.params;
    const { name } = req.body;
    const { uid } = req.session;

    if (!name) return res.status(400).json({ error: 'Nome da turma é obrigatório' });

    try {
        const classRef = req.db.collection('classes').doc(classId);
        const doc = await classRef.get();

        if (!doc.exists) return res.status(404).json({ error: 'Turma não encontrada.' });
        if (doc.data().owner_id !== uid && !doc.data().member_ids.includes(uid)) {
            return res.status(403).json({ error: 'Você não tem permissão para editar esta turma.' });
        }

        await classRef.update({ name });
        res.json({ success: true, message: 'Turma atualizada com sucesso.' });
    } catch (error) {
        next(error);
    }
});

// Deleção de Turma
router.delete('/classes/:classId', requireLogin, async (req, res, next) => {
    const { classId } = req.params;
    const { uid } = req.session;
    try {
        const classRef = req.db.collection('classes').doc(classId);
        const doc = await classRef.get();

        if (!doc.exists) return res.status(404).json({ error: 'Turma não encontrada.' });
        
        if (doc.data().owner_id !== uid) {
            return res.status(403).json({ error: 'Apenas o dono da turma pode deletá-la.' });
        }

        await classRef.delete();
        res.json({ success: true, message: 'Turma deletada com sucesso.' });
    } catch (error) {
        next(error);
    }
});

// Compartilhamento/Adicionar Membro (Share)
router.post('/classes/:classId/share', requireLogin, async (req, res, next) => {
    const { classId } = req.params;
    const { professorUsername } = req.body;
    const { uid } = req.session;

    if (!professorUsername) return res.status(400).json({ error: 'Nome de usuário é obrigatório.' });

    try {
        const classRef = req.db.collection('classes').doc(classId);
        const classDoc = await classRef.get();

        if (!classDoc.exists) return res.status(404).json({ error: 'Turma não encontrada.' });
        
        if (!classDoc.data().member_ids.includes(uid)) {
            return res.status(403).json({ error: 'Você não é membro desta turma para compartilhá-la.' });
        }

        const professorSnapshot = await req.db.collection('professors').where('username', '==', professorUsername).limit(1).get();
        if (professorSnapshot.empty) {
            return res.status(404).json({ error: 'Professor não encontrado.' });
        }
        const newMemberId = professorSnapshot.docs[0].id;

        await classRef.update({
            member_ids: req.FieldValue.arrayUnion(newMemberId)
        });

        res.json({ success: true, message: `Professor ${professorUsername} adicionado à turma.` });

    } catch (error) {
        next(error);
    }
});

// ================================================================
//                       APIs DE GESTÃO DE ALUNOS (STUDENTS)
// ================================================================

// Adicionar Aluno (Exemplo)
router.post('/classes/:classId/students', requireLogin, async (req, res, next) => {
    const { classId } = req.params;
    const { name, extension_id } = req.body;
    const { uid } = req.session;

    if (!name || !extension_id) return res.status(400).json({ error: 'Nome e ID da extensão são obrigatórios.' });
    
    try {
        const classDoc = await req.db.collection('classes').doc(classId).get();
        if (!classDoc.exists || !classDoc.data().member_ids.includes(uid)) {
            return res.status(403).json({ error: 'Você não é membro desta turma.' });
        }

        const studentRef = await req.db.collection('students').add({
            name,
            extension_id,
            class_id: classId,
            owner_id: uid, // O professor que criou
            created_at: req.FieldValue.serverTimestamp()
        });

        await req.db.collection('classes').doc(classId).update({
            student_ids: req.FieldValue.arrayUnion(studentRef.id)
        });
        
        res.status(201).json({ success: true, message: 'Aluno adicionado com sucesso.', studentId: studentRef.id });

    } catch (error) {
        next(error);
    }
});

// Implementar router.put, router.delete e router.get para students aqui...


// ================================================================
//                       APIs DE DADOS E RELATÓRIOS
// ================================================================

// Listagem de professores (para compartilhamento de turmas)
router.get('/professors/list', requireLogin, async (req, res, next) => {
    try {
        const professorsSnapshot = await req.db.collection('professors').get();
        const professors = professorsSnapshot.docs.map(doc => ({
            id: doc.id,
            username: doc.data().username,
            fullName: doc.data().full_name
        }));
        res.json({ success: true, professors });
    } catch (error) {
        next(error);
    }
});

// Obtenção de Dados para o Dashboard (Filtros, Logs, etc.)
router.get('/data', requireLogin, async (req, res, next) => {
    const { classId, studentId, category } = req.query; // Exemplo de filtros
    const { uid } = req.session;
    let query = req.db.collection('logs');

    try {
        // Implementação da lógica de filtros
        if (studentId) {
            query = query.where('aluno_id', '==', studentId);
        }

        const logsSnapshot = await query.limit(50).get(); // Limitar para performance
        const logs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ success: true, logs });
    } catch (error) {
        next(error);
    }
});

// NOVA ROTA: Obtenção de Logs de Alertas por Tipo
router.get('/alerts/:alunoId/:type', requireLogin, async (req, res, next) => {
    try {
        const alunoId = decodeURIComponent(req.params.alunoId);
        const { type } = req.params;
        let categories;

        if (type === 'red') {
            categories = ['Rede Social', 'Streaming & Jogos'];
        } else if (type === 'blue') {
            categories = ['IA'];
        } else {
            return res.status(400).json({ error: 'Tipo de alerta inválido.' });
        }
        
        // Usa req.db e query otimizada do Firestore
        const snapshot = await req.db.collection('logs')
            .where('aluno_id', '==', alunoId)
            // Usa query 'in' para buscar múltiplas categorias
            .where('categoria', 'in', categories)
            // Se o volume de logs for grande, este orderBy pode exigir um índice no Firestore
            .orderBy('timestamp', 'desc') 
            .get();

        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            // Conversão de Firebase Timestamp para objeto Date (se necessário)
            const timestamp = (data.timestamp && typeof data.timestamp.toDate === 'function')
                ? data.timestamp.toDate()
                : data.timestamp;
            return { ...data, timestamp: timestamp, id: doc.id };
        });

        res.json(logs);
    } catch (err) {
        // Encaminha o erro para o middleware centralizado no app.js
        next(err); 
    }
});

module.exports = router;
