const express = require('express');
const router = express.Router();
const classifier = require('../classifier/python_classifier.js'); // Módulo de classificação
const { db } = require('../firebase/firebase-config.js')

// O db, auth e FieldValue são injetados via middleware no app.js: req.db, req.auth, req.FieldValue

// Middleware de Autenticação (Para APIs, retorna 401 Unauthorized)
const requireLogin = (req, res, next) => {
    if (req.session && req.session.uid) {
        return next();
    }
    res.status(401).json({ error: 'Não autorizado. Faça login.' });
};

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

// --- APIs DE GESTÃO (AGORA COM FIREBASE) ---
router.post('/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    const { uid } = req.session;
    if (!name) return res.status(400).json({ error: 'Nome da turma é obrigatório' });
    try {
        // [ALTERAÇÃO] Cria a turma com owner_id e member_ids
        const docRef = await db.collection('classes').add({ 
            name, 
            owner_id: uid, // O criador é o dono
            member_ids: [uid], // O criador é o primeiro membro
            student_ids: [] 
        });
        res.json({ success: true, message: 'Turma criada com sucesso!', classId: docRef.id });
    } catch (error) {
        console.error('Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro ao criar turma' });
    }
});

router.put('/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'O novo nome da turma é obrigatório.' });
    try {
        const classRef = db.collection('classes').doc(classId);
        const doc = await classRef.get();
        // [ALTERAÇÃO] Verifica se o usuário é membro da turma
        if (!doc.exists || !doc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }
        await classRef.update({ name });
        res.json({ success: true, message: 'Nome da turma atualizado!' });
    } catch (error) {
        console.error('Erro ao atualizar turma:', error);
        res.status(500).json({ error: 'Erro ao atualizar a turma.' });
    }
});

router.delete('/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    try {
        const classRef = db.collection('classes').doc(classId);
        const doc = await classRef.get();
        // [ALTERAÇÃO] Apenas o dono pode apagar a turma
        if (!doc.exists || doc.data().owner_id !== req.session.uid) {
            return res.status(403).json({ error: 'Apenas o dono da turma pode removê-la.' });
        }
        await classRef.delete();
        res.json({ success: true, message: 'Turma removida com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover turma:', error);
        res.status(500).json({ error: 'Erro ao remover a turma.' });
    }
});

// [NOVO] Rota para partilhar uma turma
router.post('/classes/:classId/share', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { professorId } = req.body;
    if (!professorId) return res.status(400).json({ error: 'ID do professor é obrigatório.' });

    try {
        const classRef = db.collection('classes').doc(classId);
        const doc = await classRef.get();
        if (!doc.exists || !doc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        // Adiciona o novo professor ao array de membros de forma atómica
        await classRef.update({
            member_ids: FieldValue.arrayUnion(professorId)
        });

        res.json({ success: true, message: 'Turma partilhada com sucesso!' });
    } catch (error) {
        console.error("Erro ao partilhar turma:", error);
        res.status(500).json({ error: 'Erro interno ao partilhar turma.' });
    }
});

// [NOVO] Rota para obter a lista de professores para partilhar
router.get('/professors/list', requireLogin, async (req, res) => {
    try {
        const snapshot = await db.collection('professors').get();
        const professors = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            // Filtra o professor que está logado
            .filter(prof => prof.id !== req.session.uid);
            
        res.json(professors);
    } catch (error) {
        console.error("Erro ao listar professores:", error);
        res.status(500).json({ error: 'Erro ao buscar professores.' });
    }
});

// [NOVO] Rota para obter os membros atuais de uma turma
router.get('/classes/:classId/members', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const classDoc = await db.collection('classes').doc(classId).get();

        if (!classDoc.exists || !classDoc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        const memberIds = classDoc.data().member_ids || [];
        if (memberIds.length === 0) return res.json([]);

        const memberRefs = memberIds.map(id => db.collection('professors').doc(id));
        const memberDocs = await db.getAll(...memberRefs);
        
        const members = memberDocs.map(doc => ({
            id: doc.id,
            full_name: doc.exists ? doc.data().full_name : 'Utilizador Desconhecido',
            isOwner: doc.id === classDoc.data().owner_id
        }));

        res.json(members);

    } catch (error) {
        console.error("Erro ao buscar membros da turma:", error);
        res.status(500).json({ error: "Erro ao buscar membros." });
    }
});


router.post('/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id } = req.body;
    if (!fullName) return res.status(400).json({ error: 'Nome do aluno é obrigatório' });
    try {
        const studentData = { full_name: fullName, cpf: cpf || null, pc_id: pc_id || null };
        const docRef = await db.collection('students').add(studentData);
        res.json({ success: true, message: 'Aluno criado com sucesso!', student: { id: docRef.id, ...studentData } });
    } catch (error) {
        console.error('Erro ao criar aluno:', error);
        res.status(500).json({ error: 'Erro ao criar aluno' });
    }
});

router.put('/students/:studentId', requireLogin, async (req, res) => {
    const { studentId } = req.params;
    const { fullName, cpf, pc_id } = req.body;
    if (!fullName) return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
    try {
        await db.collection('students').doc(studentId).update({ full_name: fullName, cpf: cpf || null, pc_id: pc_id || null });
        res.json({ success: true, message: 'Dados do aluno atualizados!' });
    } catch (error) {
        console.error('Erro ao atualizar aluno:', error);
        res.status(500).json({ error: 'Erro ao atualizar o aluno.' });
    }
});

router.get('/students/all', requireLogin, async (req, res) => {
    try {
        const snapshot = await db.collection('students').orderBy('full_name').get();
        const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar todos os alunos:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos' });
    }
});

router.get('/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const classDoc = await db.collection('classes').doc(classId).get();
        if (!classDoc.exists || !classDoc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json([]);
        }
        const studentIds = classDoc.data().student_ids || [];
        if (studentIds.length === 0) return res.json([]);
        
        const studentRefs = studentIds.map(id => db.collection('students').doc(id));
        const studentDocs = await db.getAll(...studentRefs);
        const students = studentDocs.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos da turma' });
    }
});

router.post('/classes/:classId/add-student', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const { studentId } = req.body;
        const classRef = db.collection('classes').doc(classId);
        const classDoc = await classRef.get();
        if (!classDoc.exists || !classDoc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json({error: 'Permissão negada'});
        }
        await classRef.update({
            student_ids: FieldValue.arrayUnion(studentId)
        });
        res.json({ success: true, message: 'Aluno adicionado à turma!' });
    } catch (error) {
        console.error('Erro ao adicionar aluno à turma:', error);
        res.status(500).json({ error: 'Erro ao associar aluno.' });
    }
});

router.delete('/classes/:classId/remove-student/:studentId', requireLogin, async (req, res) => {
    try {
        const { classId, studentId } = req.params;
        const classRef = db.collection('classes').doc(classId);
        const classDoc = await classRef.get();
        if (!classDoc.exists || !classDoc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json({error: 'Permissão negada'});
        }
        await classRef.update({
            student_ids: FieldValue.arrayRemove(studentId)
        });
        res.json({ success: true, message: 'Aluno removido da turma!' });
    } catch (error) {
        console.error('Erro ao remover aluno da turma:', error);
        res.status(500).json({ error: 'Erro ao remover aluno.' });
    }
});

// --- APIs DE DADOS (LOGS, ALERTAS, ETC.) ---
router.get('/data', requireLogin, async (req, res) => {
    try {
        const logsSnapshot = await db.collection('logs').orderBy('timestamp', 'desc').get();
        const studentsSnapshot = await db.collection('students').get();

        const studentsMap = new Map();
        studentsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.cpf) studentsMap.set(data.cpf, data.full_name);
            if (data.pc_id) studentsMap.set(data.pc_id, data.full_name);
        });

        const logs = logsSnapshot.docs.map(doc => {
            const log = doc.data();
            const timestamp = (log.timestamp && typeof log.timestamp.toDate === 'function')
                ? log.timestamp.toDate()
                : null;
            return {
                ...log,
                student_name: studentsMap.get(log.aluno_id) || `<i>${log.aluno_id}</i>`,
                timestamp: timestamp
            };
        }).filter(log => log.timestamp);

        const summary = {};
        logs.forEach(log => {
            const studentId = log.aluno_id;
            if (!summary[studentId]) {
                summary[studentId] = {
                    aluno_id: studentId,
                    student_name: log.student_name,
                    total_duration: 0,
                    log_count: 0,
                    last_activity: new Date(0),
                    has_red_alert: 0,
                    has_blue_alert: 0
                };
            }
            summary[studentId].total_duration += log.duration;
            summary[studentId].log_count += 1;
            if (log.timestamp > summary[studentId].last_activity) {
                summary[studentId].last_activity = log.timestamp;
            }
            if (['Rede Social', 'Streaming & Jogos'].includes(log.categoria)) {
                summary[studentId].has_red_alert = 1;
            }
            if (log.categoria === 'IA') {
                summary[studentId].has_blue_alert = 1;
            }
        });

        res.json({
            logs,
            summary: Object.values(summary).sort((a, b) => b.last_activity - a.last_activity)
        });

    } catch (err) {
        console.error('ERRO na rota /api/data:', err);
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});


router.get('/alerts/:alunoId/:type', requireLogin, async (req, res) => {
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
        const snapshot = await db.collection('logs')
            .where('aluno_id', '==', alunoId)
            .where('categoria', 'in', categories)
            .orderBy('timestamp', 'desc')
            .get();
        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            const timestamp = (data.timestamp && typeof data.timestamp.toDate === 'function')
                ? data.timestamp.toDate()
                : null;
            return { ...data, timestamp: timestamp };
        });
        res.json(logs);
    } catch (err) {
        console.error('ERRO na rota /api/alerts/:alunoId:', err);
        res.status(500).json({ error: 'Erro ao buscar logs de alerta.' });
    }
});

module.exports = router;
