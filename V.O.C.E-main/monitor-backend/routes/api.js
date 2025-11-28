const express = require('express');
const router = express.Router();
const { pool } = require('../models/db'); 
const { requireLogin } = require('../middlewares/auth');
const PDFDocument = require('pdfkit');
// Certifique-se de que o classifier e o url-helper existem nesses caminhos na nova versão
const classifier = require('../classifier/python_classifier'); 
const { extractHostname } = require('../utils/url-helper');
const bcrypt = require('bcrypt'); // Necessário para a troca de senha

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

// Editar Turma (ESTA ROTA ESTAVA FALTANDO)
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

// Criar Aluno
router.post('/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id } = req.body;
    if (!fullName || fullName.trim() === '') return res.status(400).json({ error: 'Nome do aluno é obrigatório.' });
    const cleanCpf = cpf ? cpf.trim() : null;
    const cleanPcId = pc_id ? pc_id.trim() : null;
    try {
        const [result] = await pool.query('INSERT INTO students (full_name, cpf, pc_id) VALUES (?, ?, ?)', [fullName.trim(), cleanCpf || null, cleanPcId || null]);
        res.status(201).json({ success: true, student: { id: result.insertId, full_name: fullName.trim(), cpf: cleanCpf, pc_id: cleanPcId } });
    } catch (error) {
        console.error('Erro ao criar aluno:', error);
        if (error.code === 'ER_DUP_ENTRY') {
             return res.status(409).json({ error: 'CPF ou ID do PC já cadastrado.' });
        }
        res.status(500).json({ error: 'Erro interno ao criar aluno.' });
    }
});

// Editar Aluno (ESTA ROTA ESTAVA FALTANDO)
router.post('/students/:studentId/edit', requireLogin, async (req, res) => {
    const { studentId } = req.params;
    const { fullName, cpf, pc_id } = req.body;

    if (!fullName || fullName.trim() === '') {
        return res.status(400).json({ error: 'Nome do aluno é obrigatório.' });
    }
    
    const cleanCpf = cpf ? cpf.trim() : null;
    const cleanPcId = pc_id ? pc_id.trim() : null;

    try {
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

// Listar todos os alunos
router.get('/students/all', requireLogin, async (req, res) => {
    try {
        const [students] = await pool.query('SELECT * FROM students ORDER BY full_name');
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar todos os alunos:', error);
        res.status(500).json({ error: 'Erro interno ao buscar alunos.' });
    }
});

// Listar alunos da turma
router.get('/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
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

// --- Alteração de Senha (ESTA ROTA ESTAVA FALTANDO) ---
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

        // 3. Calcular Alertas (COM NORMALIZAÇÃO DE ID)
        const redAlerts = new Set();
        const blueAlerts = new Set();

        finalLogs.forEach(log => {
            if (!log.aluno_id) return;
            const normalizedId = String(log.aluno_id).trim().toLowerCase(); // Normaliza para evitar erro
            
            if (['Rede Social', 'Streaming & Jogos'].includes(log.categoria)) {
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

router.get('/alerts/:alunoId/:type', requireLogin, async (req, res) => {
    const alunoId = decodeURIComponent(req.params.alunoId);
    const { type } = req.params;
    let categories;
    if (type === 'red') categories = ['Rede Social', 'Streaming & Jogos'];
    else if (type === 'blue') categories = ['IA'];
    else return res.status(400).json({ error: 'Tipo de alerta inválido.' });

    try {
        const [logs] = await pool.query(
            'SELECT * FROM logs WHERE aluno_id = ? AND categoria IN (?) ORDER BY timestamp DESC',
            [alunoId, categories]
        );
        res.json(logs);
    } catch (err) {
        console.error('ERRO na rota /api/alerts/:alunoId:', err);
        res.status(500).json({ error: 'Erro interno ao buscar logs de alerta.' });
    }
});

// --- Relatório em PDF ---
router.get('/download-report/:date', requireLogin, async (req, res) => {
    try {
        const [students] = await pool.query('SELECT full_name, cpf, pc_id FROM students');
        const studentNameMap = new Map();
        students.forEach(s => {
            if (s.pc_id) studentNameMap.set(s.pc_id, s.full_name);
            if (s.cpf) studentNameMap.set(s.cpf, s.full_name);
        });

        const dateStr = req.params.date; 
        const requestedDate = new Date(dateStr + 'T00:00:00'); 
        if (isNaN(requestedDate.getTime())) return res.status(400).send('Formato de data inválido. Use AAAA-MM-DD.');

        const today = new Date();
        today.setHours(0,0,0,0);
        const requestedDateOnly = new Date(requestedDate);

        let aggregatedData = {};
        let dataSource = '';
        let foundData = false;

        if (requestedDateOnly.getTime() === today.getTime()) {
            dataSource = 'Logs do Dia (em tempo real)';
            const [logsResult] = await pool.query(
                `SELECT aluno_id, url, SUM(duration) as total_duration, COUNT(*) as count
                 FROM logs WHERE DATE(timestamp) = CURDATE() GROUP BY aluno_id, url`
            );
            if (logsResult.length > 0) {
                 foundData = true;
                 logsResult.forEach(row => {
                    if (!aggregatedData[row.aluno_id]) aggregatedData[row.aluno_id] = {};
                    aggregatedData[row.aluno_id][row.url] = { total_duration: row.total_duration, count: row.count };
                 });
            }
        } else {
            dataSource = 'Logs Arquivados';
            const [rows] = await pool.query('SELECT aluno_id, daily_logs FROM old_logs WHERE archive_date = ?', [dateStr]);
            if (rows.length > 0) {
                foundData = true;
                rows.forEach(row => {
                    try {
                        aggregatedData[row.aluno_id] = row.daily_logs;
                    } catch (parseError) {
                         console.error(`Erro ao parsear JSON de old_logs:`, parseError);
                    }
                });
            }
        }

        if (!foundData) return res.status(404).send('Nenhum log encontrado para esta data.');

        const doc = new PDFDocument({ margin: 50 });
        const filename = `relatorio-logs-${dateStr}.pdf`;
        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        doc.fontSize(18).text('Relatório de Atividade de Alunos', { align: 'center' });
        doc.fontSize(12).text(`Data: ${requestedDate.toLocaleDateString('pt-BR')} | Fonte: ${dataSource}`, { align: 'center' });
        doc.moveDown(2);

        for (const alunoId in aggregatedData) {
            const displayName = studentNameMap.get(alunoId) || alunoId;
            const dailyLogs = aggregatedData[alunoId];
            doc.fontSize(14).font('Helvetica-Bold').text(`Aluno: ${displayName}`);
            doc.moveDown(0.5);

            if (dailyLogs && typeof dailyLogs === 'object' && Object.keys(dailyLogs).length > 0) {
                 for (const url in dailyLogs) {
                    const details = dailyLogs[url];
                    const duration = details.total_duration || 0;
                    const count = details.count || 0;
                    const durationMinutes = (duration / 60).toFixed(1);
                    doc.fontSize(10).font('Helvetica').text(`  - URL: ${url} | Duração: ${durationMinutes} min | Acessos: ${count}`);
                }
            } else {
                 doc.fontSize(10).font('Helvetica').text('  Nenhuma atividade registrada ou dados inválidos.');
            }
            doc.moveDown(1.5);
        }
        doc.end();

    } catch (error) {
        console.error('ERRO CRÍTICO ao gerar relatório em PDF:', error);
        res.status(500).send('Erro interno ao gerar o relatório.');
    }
});

module.exports = router;