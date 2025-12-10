const express = require('express');
const router = express.Router();
const { pool } = require('../models/db');
const { requireLogin } = require('../middlewares/auth');
const PDFDocument = require('pdfkit');
const { extractHostname } = require('../utils/url-helper');
const bcrypt = require('bcrypt'); // Necessário para a troca de senha
const fs = require('fs');
const path = require('path');

// ================================================================
//      APIs PROTEGIDAS DE GESTÃO E DADOS (SQL)
// ================================================================

// --- Override de Categoria ---
router.post('/override-category', requireLogin, async (req, res) => {
    const { url, newCategory } = req.body;
    const professorId = req.session.professorId;

    if (!url || !newCategory || newCategory.trim() === '') {
        return res.status(400).json({ error: 'URL e nova categoria são obrigatórios.' });
    }

    let hostname = '';
    try {
        hostname = extractHostname(url);
    } catch(e) {
         hostname = url.toLowerCase();
    }

    if (!hostname) return res.status(400).json({ error: 'URL inválida.' });

    try {
        const sql = `
            INSERT INTO category_overrides (hostname, category, updated_by_professor_id)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                category = VALUES(category),
                updated_by_professor_id = VALUES(updated_by_professor_id),
                updated_at = NOW();
        `;
        const values = [hostname, newCategory.trim(), professorId];

        const [result] = await pool.query(sql, values);

        if (result.affectedRows > 0 || result.warningStatus === 0) {
             try {
                appendTrainingData(url, newCategory.trim());
             } catch (err) {
                 console.error("Erro ao salvar feedback de IA:", err);
             }
             res.json({ success: true, message: `Categoria para "${hostname}" atualizada para "${newCategory.trim()}".` });
        } else {
             res.status(500).json({ error: 'Não foi possível confirmar a alteração no banco de dados.' });
        }
    } catch (error) {
        console.error('Erro ao salvar override de categoria:', error);
        res.status(500).json({ error: 'Erro interno ao salvar a regra de categoria.' });
    }
});

// --- Gestão de Turmas ---

// Criar Turma
router.post('/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Nome da turma é obrigatório.' });

    const owner_id = req.session.professorId;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const [classResult] = await connection.query('INSERT INTO classes (name, owner_id) VALUES (?, ?)', [name.trim(), owner_id]);
        const classId = classResult.insertId;
        await connection.query('INSERT INTO class_members (class_id, professor_id) VALUES (?, ?)', [classId, owner_id]);
        await connection.commit();
        res.status(201).json({ success: true, message: 'Turma criada com sucesso!', classId });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro interno ao criar turma.' });
    } finally {
        connection.release(); 
    }
});

// Editar Turma
router.post('/classes/:classId/edit', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { newName } = req.body;
    const professorId = req.session.professorId;

    if (!newName || newName.trim() === '') {
        return res.status(400).json({ error: 'O nome da turma não pode ser vazio.' });
    }

    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });
        
        if (rows[0].owner_id !== professorId) {
            return res.status(403).json({ error: 'Apenas o dono pode editar o nome da turma.' });
        }

        await pool.query('UPDATE classes SET name = ? WHERE id = ?', [newName.trim(), classId]);
        res.json({ success: true, message: 'Nome da turma atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao editar nome da turma:', error);
        res.status(500).json({ error: 'Erro interno ao editar a turma.' });
    }
});

// Deletar Turma
router.delete('/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const professorId = req.session.professorId;

    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });

        if (rows[0].owner_id !== professorId) return res.status(403).json({ error: 'Apenas o dono pode remover a turma.' });

        await pool.query('DELETE FROM classes WHERE id = ?', [classId]);
        res.json({ success: true, message: 'Turma removida com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover turma:', error);
        res.status(500).json({ error: 'Erro interno ao remover a turma.' });
    }
});

// Compartilhar Turma
router.post('/classes/:classId/share', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { professorId: professorToShareId } = req.body;

    if (!professorToShareId) return res.status(400).json({ error: 'ID do professor para compartilhar é obrigatório.' });

    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });
        if (rows[0].owner_id !== req.session.professorId) return res.status(403).json({ error: 'Apenas o dono pode compartilhar a turma.' });

        const [profExists] = await pool.query('SELECT id FROM professors WHERE id = ?', [professorToShareId]);
        if (profExists.length === 0) return res.status(404).json({ error: 'Professor a ser adicionado não encontrado.' });

        await pool.query('INSERT IGNORE INTO class_members (class_id, professor_id) VALUES (?, ?)', [classId, professorToShareId]);
        res.json({ success: true, message: 'Turma compartilhada com sucesso!' });
    } catch (error) {
        console.error("Erro ao compartilhar turma:", error);
        res.status(500).json({ error: 'Erro interno ao compartilhar turma.' });
    }
});

// Remover Membro da Turma
router.delete('/classes/:classId/remove-member/:professorId', requireLogin, async (req, res) => {
    const { classId, professorId: memberToRemoveId } = req.params;

    if (!memberToRemoveId) return res.status(400).json({ error: 'ID do professor a remover é obrigatório.' });

    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });

        const ownerId = rows[0].owner_id;
        if (ownerId !== req.session.professorId) return res.status(403).json({ error: 'Apenas o dono pode remover membros.' });
        if (ownerId == memberToRemoveId) return res.status(400).json({ error: 'O dono da turma não pode ser removido.' });

        const [result] = await pool.query('DELETE FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, memberToRemoveId]);
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Professor removido da turma!' });
        } else {
            res.status(404).json({ error: 'Professor não encontrado nesta turma.' });
        }
    } catch (error) {
        console.error("Erro ao remover membro da turma:", error);
        res.status(500).json({ error: 'Erro interno ao remover membro.' });
    }
});

// Listar Membros
router.get('/classes/:classId/members', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não é membro desta turma.' });

        const [members] = await pool.query(`
            SELECT p.id, p.full_name, p.username, (c.owner_id = p.id) as isOwner
            FROM professors p
            JOIN class_members cm ON p.id = cm.professor_id
            JOIN classes c ON cm.class_id = c.id
            WHERE cm.class_id = ? ORDER BY p.full_name
        `, [classId]);

        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        const isCurrentUserOwner = rows.length > 0 && rows[0].owner_id === req.session.professorId;

        res.json({ members, isCurrentUserOwner });
    } catch (error) {
        console.error("Erro ao buscar membros da turma:", error);
        res.status(500).json({ error: "Erro interno ao buscar membros." });
    }
});

// --- Gestão de Alunos ---

// Criar Aluno (VINCULADO AO PROFESSOR)
router.post('/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id } = req.body;
    const professorId = req.session.professorId; // ID do professor logado

    if (!fullName || fullName.trim() === '') return res.status(400).json({ error: 'Nome do aluno é obrigatório.' });

    const cleanCpf = cpf ? cpf.trim() : null;
    const cleanPcId = pc_id ? pc_id.trim() : null;

    try {
        // Agora salvamos o created_by
        const [result] = await pool.query(
            'INSERT INTO students (full_name, cpf, pc_id, created_by) VALUES (?, ?, ?, ?)', 
            [fullName.trim(), cleanCpf || null, cleanPcId || null, professorId]
        );
        res.status(201).json({ success: true, student: { id: result.insertId, full_name: fullName.trim(), cpf: cleanCpf, pc_id: cleanPcId } });
    } catch (error) {
        console.error('Erro ao criar aluno:', error);
        if (error.code === 'ER_DUP_ENTRY') {
             return res.status(409).json({ error: 'CPF ou ID do PC já cadastrado.' });
        }
        res.status(500).json({ error: 'Erro interno ao criar aluno.' });
    }
});

// Editar Aluno (COM VERIFICAÇÃO DE PROPRIEDADE)
router.post('/students/:studentId/edit', requireLogin, async (req, res) => {
    const { studentId } = req.params;
    const { fullName, cpf, pc_id } = req.body;
    const professorId = req.session.professorId;

    if (!fullName || fullName.trim() === '') {
        return res.status(400).json({ error: 'Nome do aluno é obrigatório.' });
    }
    
    const cleanCpf = cpf ? cpf.trim() : null;
    const cleanPcId = pc_id ? pc_id.trim() : null;

    try {
        // Verifica se o aluno pertence ao professor logado
        const [checkOwner] = await pool.query('SELECT id FROM students WHERE id = ? AND created_by = ?', [studentId, professorId]);
        
        // Se não encontrar, ou o aluno não existe ou pertence a outro professor
        if (checkOwner.length === 0) {
            return res.status(403).json({ error: 'Você não tem permissão para editar este aluno ou ele não existe.' });
        }

        await pool.query(
            'UPDATE students SET full_name = ?, cpf = ?, pc_id = ? WHERE id = ?', 
            [fullName.trim(), cleanCpf || null, cleanPcId || null, studentId]
        );
        res.json({ success: true, message: 'Dados do aluno atualizados com sucesso!' });
    } catch (error) {
        console.error('Erro ao editar aluno:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'CPF ou ID do PC já cadastrado em outro aluno.' });
        }
        res.status(500).json({ error: 'Erro interno ao editar aluno.' });
    }
});

// Remover Aluno (Sistema) (COM VERIFICAÇÃO DE PROPRIEDADE)
router.delete('/students/:studentId', requireLogin, async (req, res) => {
    const { studentId } = req.params;
    const professorId = req.session.professorId;

    try {
        // Verifica propriedade e deleta em uma única verificação se possível, mas aqui faremos em duas para clareza
        const [result] = await pool.query('DELETE FROM students WHERE id = ? AND created_by = ?', [studentId, professorId]);
        
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Aluno removido com sucesso!' });
        } else {
            // Se não deletou nada, ou não existe ou não é dono
            res.status(403).json({ error: 'Você não tem permissão para remover este aluno ou ele não existe.' });
        }
    } catch (error) {
        console.error('Erro ao remover aluno:', error);
        res.status(500).json({ error: 'Erro interno ao remover aluno (verifique se há logs vinculados).' });
    }
});

// Listar alunos (APENAS DO PROFESSOR LOGADO)
router.get('/students/all', requireLogin, async (req, res) => {
    try {
        const professorId = req.session.professorId;
        // Filtra pelo ID do professor
        const [students] = await pool.query('SELECT * FROM students WHERE created_by = ? ORDER BY full_name', [professorId]);
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos:', error);
        res.status(500).json({ error: 'Erro interno ao buscar alunos.' });
    }
});

// Listar alunos da turma (AQUI É MANTIDO O ACESSO COMPARTILHADO)
// Se eu compartilho a turma com outro professor, ele deve ver os alunos daquela turma, mesmo que não os tenha criado.
router.get('/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        // Verifica se o professor é membro da turma (dono ou convidado)
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não tem permissão para ver os alunos desta turma.' });

        const [students] = await pool.query(`
            SELECT s.* FROM students s
            JOIN class_students cs ON s.id = cs.student_id
            WHERE cs.class_id = ? ORDER BY s.full_name
        `, [classId]);
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro interno ao buscar alunos da turma.' });
    }
});

// Adicionar Aluno à Turma
router.post('/classes/:classId/add-student', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { studentId } = req.body;

    if (!studentId) return res.status(400).json({ error: 'ID do aluno é obrigatório.' });

    try {
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não tem permissão para adicionar alunos a esta turma.' });

        const [studentExists] = await pool.query('SELECT id FROM students WHERE id = ?', [studentId]);
        if (studentExists.length === 0) return res.status(404).json({ error: 'Aluno não encontrado.' });

        await pool.query('INSERT IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, studentId]);
        res.json({ success: true, message: 'Aluno adicionado à turma!' });
    } catch (error) {
        console.error('Erro ao adicionar aluno à turma:', error);
        res.status(500).json({ error: 'Erro interno ao associar aluno.' });
    }
});

// Remover Aluno da Turma
router.delete('/classes/:classId/remove-student/:studentId', requireLogin, async (req, res) => {
    const { classId, studentId } = req.params;

    try {
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não tem permissão para remover alunos desta turma.' });

        const [result] = await pool.query('DELETE FROM class_students WHERE class_id = ? AND student_id = ?', [classId, studentId]);
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Aluno removido da turma!' });
        } else {
             res.status(404).json({ error: 'Aluno não encontrado nesta turma.' });
        }
    } catch (error) {
        console.error('Erro ao remover aluno da turma:', error);
        res.status(500).json({ error: 'Erro interno ao remover aluno.' });
    }
});

// --- Listagem de Professores ---
router.get('/professors/list', requireLogin, async (req, res) => {
    try {
        const [professors] = await pool.query('SELECT id, full_name, username, email FROM professors WHERE id != ? ORDER BY full_name', [req.session.professorId]);
        res.json(professors);
    } catch (error) {
        console.error("Erro ao listar professores:", error);
        res.status(500).json({ error: 'Erro interno ao buscar professores.' });
    }
});

// --- Alteração de Senha ---
router.post('/change-password', requireLogin, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const professorId = req.session.professorId;

    if (!currentPassword || !newPassword || !confirmPassword) return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
    if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: 'A nova senha e a confirmação não coincidem.' });
    if (newPassword === currentPassword) return res.status(400).json({ success: false, message: 'A nova senha não pode ser igual à senha atual.' });

    try {
        const [rows] = await pool.query('SELECT password_hash FROM professors WHERE id = ?', [professorId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });

        const currentHashedPassword = rows[0].password_hash;
        const isMatch = await bcrypt.compare(currentPassword, currentHashedPassword);

        if (!isMatch) return res.status(401).json({ success: false, message: 'A senha atual está incorreta.' });

        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE professors SET password_hash = ? WHERE id = ?', [newHashedPassword, professorId]);

        res.json({ success: true, message: 'Senha alterada com sucesso!' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor ao tentar alterar a senha.' });
    }
});

// --- Dados para Dashboard e Alertas ---
router.get('/data', requireLogin, async (req, res) => {
    try {
        const targetDate = req.query.date || new Date().toISOString().split('T')[0];
        const classId = req.query.classId;
        
        // 1. Query de Logs (Detalhada)
        let query = `
            SELECT l.id as log_id, l.aluno_id, l.url, l.duration,
                    l.categoria as original_category, l.timestamp,
                    s.full_name as student_name
            FROM logs l 
            LEFT JOIN students s ON l.aluno_id = s.pc_id OR l.aluno_id = s.cpf
        `;
        
        const params = [targetDate];
        
        if (classId && classId !== 'null') {
            query += ` INNER JOIN class_students cs ON s.id = cs.student_id WHERE cs.class_id = ? AND DATE(l.timestamp) = ?`;
            params.unshift(classId); 
        } else {
            query += ` WHERE DATE(l.timestamp) = ?`;
        }
        
        query += ` ORDER BY l.timestamp DESC`;
        const [rawLogsData] = await pool.query(query, params);

        // 2. Processar Overrides e Categorias
        const uniqueHostnames = [...new Set(rawLogsData.map(log => extractHostname(log.url)).filter(Boolean))];
        let overrideMap = {};

        if (uniqueHostnames.length > 0) {
            const [overrideRows] = await pool.query('SELECT hostname, category FROM category_overrides WHERE hostname IN (?)', [uniqueHostnames]);
            overrideMap = overrideRows.reduce((map, row) => { map[row.hostname] = row.category; return map; }, {});
        }

        const finalLogs = rawLogsData.map(log => {
            const hostname = extractHostname(log.url);
            const overriddenCategory = overrideMap[hostname];
            const finalCategory = overriddenCategory !== undefined ? overriddenCategory : (log.original_category || 'Não Categorizado');
            return { ...log, categoria: finalCategory };
        });

        // 3. Calcular Alertas
        const redAlerts = new Set();
        const blueAlerts = new Set();
        const forbiddenCategories = ['Rede Social', 'Streaming & Jogos', 'Streaming', 'Jogos', 'Loja Digital', 'Anime'];

        finalLogs.forEach(log => {
            if (!log.aluno_id) return;
            const normalizedId = String(log.aluno_id).trim().toLowerCase();
            
            if (forbiddenCategories.includes(log.categoria)) {
                redAlerts.add(normalizedId);
            }
            if (log.categoria === 'IA') {
                blueAlerts.add(normalizedId);
            }
        });

        // 4. Query de Resumo (Summary)
        const [summary] = await pool.query(`
            SELECT s.full_name as student_name, COALESCE(s.pc_id, s.cpf) as aluno_id,
                    COALESCE(SUM(CASE WHEN DATE(l.timestamp) = ? THEN l.duration ELSE 0 END), 0) as total_duration,
                    COALESCE(SUM(CASE WHEN DATE(l.timestamp) = ? THEN 1 ELSE 0 END), 0) as log_count,
                    MAX(CASE WHEN DATE(l.timestamp) = ? THEN l.timestamp ELSE NULL END) as last_activity 
            FROM students s 
            LEFT JOIN logs l ON (s.pc_id = l.aluno_id OR s.cpf = l.aluno_id) AND DATE(l.timestamp) = ?
            GROUP BY s.id, s.full_name, s.pc_id, s.cpf 
            ORDER BY MAX(CASE WHEN DATE(l.timestamp) = ? THEN l.timestamp ELSE NULL END) IS NULL ASC,
                     MAX(CASE WHEN DATE(l.timestamp) = ? THEN l.timestamp ELSE NULL END) DESC, s.full_name ASC
        `, [targetDate, targetDate, targetDate, targetDate, targetDate, targetDate]);

        // 5. Unir Alertas ao Resumo
        const finalSummary = summary.map(s => {
            const id = s.aluno_id ? String(s.aluno_id).trim().toLowerCase() : '';
            return {
                ...s,
                has_red_alert: redAlerts.has(id),
                has_blue_alert: blueAlerts.has(id)
            };
        });

        res.json({ logs: finalLogs, summary: finalSummary });

    } catch (err) {
        console.error('ERRO na rota /api/data:', err);
        res.status(500).json({ error: 'Erro interno ao buscar dados.' });
    }
});

// --- Detalhes dos Alertas (Modal) ---
router.get('/alerts/:alunoId/:type', requireLogin, async (req, res) => {
    const alunoId = decodeURIComponent(req.params.alunoId);
    const { type } = req.params;
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];

    let categories;
    if (type === 'red') {
        categories = ['Rede Social', 'Streaming & Jogos', 'Streaming', 'Jogos', 'Loja Digital', 'Anime'];
    } else if (type === 'blue') {
        categories = ['IA'];
    } else {
        return res.status(400).json({ error: 'Tipo de alerta inválido.' });
    }

    try {
        const [logs] = await pool.query(
            'SELECT * FROM logs WHERE aluno_id = ? AND categoria IN (?) AND DATE(timestamp) = ? ORDER BY timestamp DESC',
            [alunoId, categories, targetDate]
        );
        res.json(logs);
    } catch (err) {
        console.error('ERRO na rota /api/alerts/:alunoId:', err);
        res.status(500).json({ error: 'Erro interno ao buscar logs de alerta.' });
    }
});


// ================================================================
//      FUNÇÃO AUXILIAR: REGISTRAR APRENDIZADO (FEEDBACK)
// ================================================================
function appendTrainingData(url, category) {
    const trainingFile = path.join(__dirname, '..', 'classifier-tf', 'ai_training_feedback.csv');
    const hostname = extractHostname(url) || url;
    const csvLine = `${hostname},${category}\n`;
    
    fs.appendFile(trainingFile, csvLine, (err) => {
        if (err) console.error("Erro ao salvar dados de treinamento:", err);
        else console.log(`[IA Feedback] Novo dado de treino salvo: ${hostname} -> ${category}`);
    });
}



// ================================================================
//      RELATÓRIO PDF (CORRIGIDO: ALINHAMENTO E CATEGORIA OUTROS)
// ================================================================
router.get('/download-report/:date', requireLogin, async (req, res) => {
    const professorId = req.session.professorId;
    
    try {
        const dateStr = req.params.date;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return res.status(400).send('Formato de data inválido.');

        // 1. BUSCA ALUNOS
        const [students] = await pool.query(
            'SELECT full_name, cpf, pc_id FROM students WHERE created_by = ?', 
            [professorId]
        );

        // Mapa normalizado (lowercase + trim)
        const studentNameMap = new Map();
        const myStudentIds = new Set(); 
        
        students.forEach(s => {
            if (s.pc_id) {
                const pid = String(s.pc_id).toLowerCase().trim();
                studentNameMap.set(pid, s.full_name);
                myStudentIds.add(pid);
            }
            if (s.cpf) {
                const cid = String(s.cpf).toLowerCase().trim();
                studentNameMap.set(cid, s.full_name);
                myStudentIds.add(cid);
            }
        });

        // Fallback: Se não achou alunos vinculados, busca todos (segurança)
        if (myStudentIds.size === 0) {
            const [allStudents] = await pool.query('SELECT full_name, cpf, pc_id FROM students');
            allStudents.forEach(s => {
                if(s.pc_id) { const pid = String(s.pc_id).toLowerCase().trim(); studentNameMap.set(pid, s.full_name); myStudentIds.add(pid); }
                if(s.cpf) { const cid = String(s.cpf).toLowerCase().trim(); studentNameMap.set(cid, s.full_name); myStudentIds.add(cid); }
            });
        }

        // 2. CONFIGURAÇÃO DE CATEGORIAS
        // REMOVIDO "Outros" DA LISTA DE INDEVIDOS
        const IMPROPER_CATEGORIES = ['Rede Social', 'Streaming', 'Jogos', 'Streaming & Jogos', 'Loja Digital', 'Anime', 'Musica'];
        
        const colors = { 
            primary: '#B91C1C', danger: '#DC2626', secondary: '#1F2937',  
            accent: '#F3F4F6', text: '#374151', muted: '#6B7280'
        };

        // 3. COLETA DE DADOS
        const requestDateObj = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        const isToday = requestDateObj.toISOString().split('T')[0] === today.toISOString().split('T')[0];

        let aggregatedData = {};
        let dataSource = '';
        let foundData = false;

        if (isToday) {
            dataSource = 'Monitoramento em Tempo Real';
            const [logsResult] = await pool.query(
                `SELECT aluno_id, url, categoria, SUM(duration) as total_duration 
                 FROM logs 
                 WHERE DATE(timestamp) = ? 
                 GROUP BY aluno_id, url, categoria`, [dateStr]);
            
            if (logsResult.length > 0) {
                 logsResult.forEach(row => {
                    if (!row.aluno_id) return;
                    const logId = String(row.aluno_id).toLowerCase().trim();

                    if (myStudentIds.has(logId)) {
                        foundData = true;
                        if (!aggregatedData[logId]) aggregatedData[logId] = {};
                        if (!aggregatedData[logId][row.url]) {
                            aggregatedData[logId][row.url] = { total_duration: 0, category: row.categoria };
                        }
                        aggregatedData[logId][row.url].total_duration += Number(row.total_duration);
                    }
                 });
            }
        } else {
            dataSource = 'Histórico Arquivado';
            const [rows] = await pool.query('SELECT aluno_id, daily_logs FROM old_logs WHERE archive_date = ?', [dateStr]);
            if (rows.length > 0) {
                rows.forEach(row => {
                    const logId = String(row.aluno_id).toLowerCase().trim();
                    if (myStudentIds.has(logId)) {
                        foundData = true;
                        try { 
                            aggregatedData[logId] = typeof row.daily_logs === 'string' ? JSON.parse(row.daily_logs) : row.daily_logs; 
                        } catch (e) {}
                    }
                });
            }
        }

        if (!foundData) return res.status(404).send(`Nenhum dado encontrado para a data ${dateStr}.`);

        // --- GERAÇÃO DO PDF ---
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const filename = `Relatorio_${dateStr}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        // Fontes
        const fontRegular = path.join(__dirname, '../public/fonts/Roboto-Regular.ttf');
        const fontBold = path.join(__dirname, '../public/fonts/Roboto-Bold.ttf');
        let hasCustomFont = fs.existsSync(fontRegular) && fs.existsSync(fontBold);

        if (hasCustomFont) {
            doc.registerFont('Regular', fontRegular);
            doc.registerFont('Bold', fontBold);
        }

        const cleanText = (text) => hasCustomFont ? (text || "") : (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const setFont = (type = 'Regular', size = 10) => {
            if (hasCustomFont) doc.font(type).fontSize(size);
            else doc.font(type === 'Bold' ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
        };

        const formatDuration = (seconds) => {
            if (!seconds || seconds <= 0) return "0s";
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            if (h > 0) return `${h}h ${m}m`;
            if (m > 0) return `${m}m ${s}s`;
            return `${s}s`;
        };

        const truncate = (str, len) => (str && str.length > len) ? str.substring(0, len-3) + "..." : (str || "-");

        // --- HEADER ---
        const drawHeader = () => {
            doc.rect(0, 0, 595.28, 90).fill(colors.primary);
            doc.fillColor('#FFFFFF');
            setFont('Bold', 24);
            doc.text(cleanText('Relatório de Monitoramento'), 40, 25);
            setFont('Regular', 11);
            doc.text(cleanText(`Professor: ${req.session.professorName || 'Docente'} | ${dataSource}`), 40, 60);
            doc.fontSize(14).text(requestDateObj.toLocaleDateString('pt-BR'), 450, 25, { align: 'right' });
            doc.moveDown(5);
        };

        drawHeader();

        // --- TOTAIS ---
        let totalStudents = Object.keys(aggregatedData).length;
        let grandTotalTime = 0, grandImproperTime = 0;
        
        for (const uid in aggregatedData) {
            for (const url in aggregatedData[uid]) {
                const item = aggregatedData[uid][url];
                const dur = Number(item.total_duration) || 0;
                grandTotalTime += dur;
                if (IMPROPER_CATEGORIES.includes(item.category)) grandImproperTime += dur;
            }
        }

        // --- CARDS ---
        const summaryY = 110;
        const cardW = 120;
        const cardH = 60;
        
        const drawCard = (x, title, value, color) => {
            doc.roundedRect(x, summaryY, cardW, cardH, 4).fill(colors.accent);
            doc.fillColor(color);
            setFont('Bold', 14);
            doc.text(value, x, summaryY + 15, {width: cardW, align:'center'});
            doc.fillColor(colors.text);
            setFont('Regular', 9);
            doc.text(cleanText(title), x, summaryY + 38, {width: cardW, align:'center'});
        };

        drawCard(40, 'Alunos Ativos', totalStudents, colors.secondary);
        drawCard(170, 'Tempo Total', formatDuration(grandTotalTime), colors.secondary);
        drawCard(300, 'Tempo Indevido', formatDuration(grandImproperTime), colors.danger);
        
        let focusPercent = grandTotalTime > 0 ? ((1 - (grandImproperTime/grandTotalTime)) * 100).toFixed(0) : 100;
        drawCard(430, 'Nível de Foco', `${focusPercent}%`, focusPercent < 70 ? colors.danger : '#16A34A');

        doc.y = summaryY + cardH + 40;

        // --- DETALHES ---
        for (const alunoId in aggregatedData) {
            const displayName = studentNameMap.get(alunoId) || `ID: ${alunoId}`;
            const userLogs = aggregatedData[alunoId];
            
            if (doc.y > 700) { doc.addPage(); drawHeader(); doc.y = 110; }

            // Nome do Aluno
            doc.rect(40, doc.y, 515, 25).fill('#E5E7EB');
            doc.fillColor(colors.secondary);
            setFont('Bold', 12);
            doc.text(cleanText(displayName), 50, doc.y - 18);
            doc.y += 10;

            const sortedSites = Object.entries(userLogs)
                .map(([url, data]) => ({ url, ...data }))
                .sort((a, b) => b.total_duration - a.total_duration);

            // CORREÇÃO DOS TÍTULOS DA TABELA
            const col1 = 40;
            const col2 = 320; // Afastei um pouco a coluna
            const col3 = 480;
            
            doc.fillColor(colors.muted);
            setFont('Bold', 9);

            // SALVA A POSIÇÃO Y ATUAL PARA USAR EM TODOS OS TÍTULOS
            const headerY = doc.y; 

            doc.text('SITE / APLICAÇÃO', col1, headerY);
            doc.text('CATEGORIA', col2, headerY);
            doc.text('TEMPO', col3, headerY);
            
            // Move para baixo APÓS escrever todos os títulos
            doc.moveDown(0.5);
            
            // Linha divisória
            doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#D1D5DB').lineWidth(1).stroke();
            doc.moveDown(0.5);

            setFont('Regular', 10);
            sortedSites.slice(0, 10).forEach((site, index) => {
                const rowY = doc.y;
                const isImproper = IMPROPER_CATEGORIES.includes(site.category);
                
                // Zebra
                if (index % 2 === 0) doc.rect(40, rowY - 2, 515, 14).fill('#F9FAFB');

                // Col 1: Site
                if (isImproper) doc.fillColor(colors.danger); else doc.fillColor(colors.text);
                doc.text(truncate(cleanText(site.url), 45), col1, rowY, { width: 270, lineBreak: false });

                // Col 2: Categoria
                doc.fillColor(colors.muted);
                doc.text(truncate(cleanText(site.category || 'Geral'), 20), col2, rowY);

                // Col 3: Tempo
                doc.fillColor(colors.secondary);
                doc.text(formatDuration(site.total_duration), col3, rowY);
                
                doc.moveDown(0.6);
            });

            doc.moveDown(1.5);
        }

        // Numeração de páginas
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            setFont('Regular', 8);
            doc.fillColor(colors.muted);
            doc.text(`Página ${i + 1} de ${range.count}`, 0, doc.page.height - 30, { align: 'center' });
        }

        doc.end();

    } catch (error) {
        console.error('ERRO PDF:', error);
        if (!res.headersSent) res.status(500).send('Erro ao gerar relatório.');
    }
});

module.exports = router;