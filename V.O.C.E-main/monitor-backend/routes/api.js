const express = require('express');
const router = express.Router();
const { pool } = require('../models/db'); // seu db.js
const { requireLogin } = require('../middlewares/auth'); // se você separou
const PDFDocument = require('pdfkit');

// ================================================================
//      APIs PROTEGIDAS DE GESTÃO E DADOS (SQL)
// ================================================================

// --- Coleta de Logs ---
router.post('/api/logs', async (req, res) => {
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    if (!logs || logs.length === 0) return res.status(400).send('Nenhum log recebido.');

    try {
        const uniqueHostnames = [...new Set(logs.map(log => {
            try { return new URL(`http://${log.url}`).hostname.toLowerCase(); }
            catch (e) { return log.url.toLowerCase(); }
        }).filter(Boolean))];

        let overrides = {};
        if (uniqueHostnames.length > 0) {
            const [overrideRows] = await pool.query('SELECT hostname, category FROM category_overrides WHERE hostname IN (?)', [uniqueHostnames]);
            overrides = overrideRows.reduce((map, row) => { map[row.hostname] = row.category; return map; }, {});
        }

        const sql = 'INSERT INTO logs (aluno_id, url, duration, categoria, timestamp) VALUES ?';
        const values = await Promise.all(logs.map(async (log) => {
            let category = 'Não Categorizado';
            let hostname = '';
             try { hostname = new URL(`http://${log.url}`).hostname.toLowerCase(); }
             catch(e) { hostname = log.url.toLowerCase(); }

            if (overrides[hostname]) {
                category = overrides[hostname];
                // console.log(`[Override] ${hostname} -> ${category}`);
            } else if (log.url) { // Only classify if URL exists
                category = await classifier.categorizar(log.url);
                // console.log(`[Auto] ${log.url} -> ${category}`);
            }

            return [ log.aluno_id, log.url || '', log.durationSeconds || 0, category, new Date(log.timestamp || Date.now()) ];
        }));

        if (values.length > 0) { await pool.query(sql, [values]); }
        res.status(200).send('Logs salvos com sucesso.');

    } catch (error) {
        console.error('Erro ao salvar logs no MySQL com overrides:', error);
        res.status(500).send('Erro interno ao processar os logs.');
    }
});

// --- Override de Categoria ---
router.post('/api/override-category', requireLogin, async (req, res) => {
    console.log("\n--- DEBUG: Recebido POST /api/override-category ---"); // Log de Entrada
    const { url, newCategory } = req.body;
    const professorId = req.session.professorId;
    console.log("--- DEBUG: Dados Recebidos:", { url, newCategory, professorId }); // Log dos Dados

    if (!url || !newCategory || newCategory.trim() === '') {
        console.log("--- DEBUG: Falha na validação - URL ou Categoria vazia."); // Log de Falha
        return res.status(400).json({ error: 'URL e nova categoria (não vazia) são obrigatórios.' });
    }

    let hostname = '';
    try {
        hostname = extractHostname(url); // Usa a função auxiliar
        console.log("--- DEBUG: Hostname extraído:", hostname); // Log do Hostname
    } catch(e) {
         console.error("--- DEBUG: Erro CRÍTICO ao extrair hostname:", e); // Log Erro Extração
         hostname = url.toLowerCase(); // Fallback
    }


    if (!hostname) {
         console.log("--- DEBUG: Falha na validação - Hostname resultou em vazio."); // Log Hostname Vazio
         return res.status(400).json({ error: 'URL inválida ou não processável.' });
    }

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
        // Loga a query formatada ANTES de executar
        console.log("--- DEBUG: Executando SQL:", pool.format(sql, values));

        // Executa a query
        const [result] = await pool.query(sql, values);
        // Loga o resultado da execução do MySQL
        console.log("--- DEBUG: Resultado da Query MySQL:", result);

        // Verifica se alguma linha foi afetada (inserida ou atualizada)
        if (result.affectedRows > 0 || result.warningStatus === 0) { // warningStatus 0 pode indicar update sem mudança real
             console.log("--- DEBUG: Operação no DB bem-sucedida."); // Log Sucesso DB
             res.json({ success: true, message: `Categoria para "${hostname}" atualizada para "${newCategory.trim}".` });
        } else {
             console.log("--- DEBUG: Query executada, mas nenhuma linha afetada (?).", result); // Log Nenhuma Mudança
             // Talvez a categoria já fosse a mesma? Ou erro inesperado?
             res.status(500).json({ error: 'Não foi possível confirmar a alteração no banco de dados.' });
        }

    } catch (error) {
        // Loga QUALQUER erro que ocorra durante a execução da query
        console.error('--- ERRO FATAL ao salvar override de categoria:', error);
        res.status(500).json({ error: 'Erro interno ao salvar a regra de categoria.' });
    }
});


// --- Gestão de Turmas ---
router.post('/api/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Nome da turma é obrigatório.' });
    const owner_id = req.session.professorId;
    const connection = await pool.getConnection(); // Get connection for transaction
    try {
        await connection.beginTransaction();
        const [classResult] = await connection.query('INSERT INTO classes (name, owner_id) VALUES (?, ?)', [name.trim(), owner_id]);
        const classId = classResult.insertId;
        // Automatically add the owner as a member
        await connection.query('INSERT INTO class_members (class_id, professor_id) VALUES (?, ?)', [classId, owner_id]);
        await connection.commit();
        res.status(201).json({ success: true, message: 'Turma criada com sucesso!', classId });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro interno ao criar turma.' });
    } finally {
        connection.release(); // Always release connection
    }
});

router.delete('/api/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const professorId = req.session.professorId;
    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });
        if (rows[0].owner_id !== professorId) return res.status(403).json({ error: 'Apenas o dono pode remover a turma.' });

        // ON DELETE CASCADE handles related entries in class_members and class_students
        await pool.query('DELETE FROM classes WHERE id = ?', [classId]);
        res.json({ success: true, message: 'Turma removida com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover turma:', error);
        res.status(500).json({ error: 'Erro interno ao remover a turma.' });
    }
});

router.post('/api/classes/:classId/share', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { professorId: professorToShareId } = req.body; // Renamed for clarity
    if (!professorToShareId) return res.status(400).json({ error: 'ID do professor para compartilhar é obrigatório.' });
    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });
        if (rows[0].owner_id !== req.session.professorId) return res.status(403).json({ error: 'Apenas o dono pode compartilhar a turma.' });

        // Check if the professor to share exists
        const [profExists] = await pool.query('SELECT id FROM professors WHERE id = ?', [professorToShareId]);
        if (profExists.length === 0) return res.status(404).json({ error: 'Professor a ser adicionado não encontrado.' });

        // INSERT IGNORE avoids errors if the member already exists
        await pool.query('INSERT IGNORE INTO class_members (class_id, professor_id) VALUES (?, ?)', [classId, professorToShareId]);
        res.json({ success: true, message: 'Turma compartilhada com sucesso!' });
    } catch (error) {
        console.error("Erro ao compartilhar turma:", error);
        res.status(500).json({ error: 'Erro interno ao compartilhar turma.' });
    }
});

router.delete('/api/classes/:classId/remove-member/:professorId', requireLogin, async (req, res) => {
    const { classId, professorId: memberToRemoveId } = req.params; // Renamed for clarity
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

router.get('/api/classes/:classId/members', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        // Check if current user is a member first
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
router.post('/api/students', requireLogin, async (req, res) => {
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

router.get('/api/students/all', requireLogin, async (req, res) => {
    try {
        const [students] = await pool.query('SELECT * FROM students ORDER BY full_name');
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar todos os alunos:', error);
        res.status(500).json({ error: 'Erro interno ao buscar alunos.' });
    }
});

router.get('/api/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        // Check if user is member
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

router.post('/api/classes/:classId/add-student', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'ID do aluno é obrigatório.' });
    try {
        // Check if user is member
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não tem permissão para adicionar alunos a esta turma.' });

        // Check if student exists
         const [studentExists] = await pool.query('SELECT id FROM students WHERE id = ?', [studentId]);
         if (studentExists.length === 0) return res.status(404).json({ error: 'Aluno não encontrado.' });

        // INSERT IGNORE avoids error if student is already in class
        await pool.query('INSERT IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, studentId]);
        res.json({ success: true, message: 'Aluno adicionado à turma!' });
    } catch (error) {
        console.error('Erro ao adicionar aluno à turma:', error);
        res.status(500).json({ error: 'Erro interno ao associar aluno.' });
    }
});

router.delete('/api/classes/:classId/remove-student/:studentId', requireLogin, async (req, res) => {
    const { classId, studentId } = req.params;
    try {
         // Check if user is member
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
router.get('/api/professors/list', requireLogin, async (req, res) => {
    try {
        // Exclude the current user from the list
        const [professors] = await pool.query('SELECT id, full_name, username, email FROM professors WHERE id != ? ORDER BY full_name', [req.session.professorId]);
        res.json(professors);
    } catch (error) {
        console.error("Erro ao listar professores:", error);
        res.status(500).json({ error: 'Erro interno ao buscar professores.' });
    }
});

// --- Dados para Dashboard e Alertas ---
// Helper function (mantida)
function extractHostname(urlString) {
    try {
        let fullUrl = urlString.startsWith('http://') || urlString.startsWith('https://') ? urlString : `http://${urlString}`;
        return new URL(fullUrl).hostname.toLowerCase();
    } catch (e) { return urlString ? urlString.toLowerCase() : ''; } // Retorna string vazia se url for nula/undefined
}

router.get('/api/data', requireLogin, async (req, res) => {
    console.log("--- Iniciando GET /api/data ---"); // Log
    try {
        const professorId = req.session.professorId;

        // 1. Fetch RAW logs for today, joining student names
        const [rawLogsData] = await pool.query(`
            SELECT l.id as log_id, l.aluno_id, l.url, l.duration, l.categoria as original_category, l.timestamp, s.full_name as student_name
            FROM logs l LEFT JOIN students s ON l.aluno_id = s.pc_id OR l.aluno_id = s.cpf
            WHERE DATE(l.timestamp) = CURDATE() ORDER BY l.timestamp DESC`);
        console.log(`--- Encontrados ${rawLogsData.length} logs brutos.`); // Log

        // 2. Extract unique hostnames
        const uniqueHostnames = [...new Set(rawLogsData.map(log => extractHostname(log.url)).filter(Boolean))];
        console.log("--- Hostnames únicos:", uniqueHostnames); // Log

        // 3. Fetch overrides for these hostnames
        let overrideMap = {};
        if (uniqueHostnames.length > 0) {
            const [overrideRows] = await pool.query(
                'SELECT hostname, category FROM category_overrides WHERE hostname IN (?)',
                [uniqueHostnames]
            );
            overrideMap = overrideRows.reduce((map, row) => {
                map[row.hostname] = row.category;
                return map;
            }, {});
            console.log("--- Overrides encontrados:", overrideMap); // Log
        }

        // 4. Apply overrides to create finalLogs
        const finalLogs = rawLogsData.map(log => {
            const hostname = extractHostname(log.url);
            const overriddenCategory = overrideMap[hostname];
            // *** APLICA O OVERRIDE AQUI ***
            const finalCategory = overriddenCategory !== undefined ? overriddenCategory : (log.original_category || 'Não Categorizado');
            return {
                id: log.log_id,
                aluno_id: log.aluno_id,
                url: log.url,
                duration: log.duration,
                categoria: finalCategory, // Usa a categoria final
                timestamp: log.timestamp,
                student_name: log.student_name
            };
        });
        console.log(`--- ${finalLogs.length} logs finais processados (com overrides).`); // Log

        // --- Summary Calculation (unchanged - uses original log categories for simplicity) ---
        // Manter a query original do summary por simplicidade no TCC.
        // Se precisar que o summary reflita overrides, a query fica bem mais complexa.
        const [summary] = await pool.query(`
            SELECT s.full_name as student_name, COALESCE(s.pc_id, s.cpf) as aluno_id, COALESCE(SUM(CASE WHEN DATE(l.timestamp) = CURDATE() THEN l.duration ELSE 0 END), 0) as total_duration, COALESCE(SUM(CASE WHEN DATE(l.timestamp) = CURDATE() THEN 1 ELSE 0 END), 0) as log_count, MAX(CASE WHEN DATE(l.timestamp) = CURDATE() THEN l.timestamp ELSE NULL END) as last_activity
             FROM students s LEFT JOIN logs l ON s.pc_id = l.aluno_id OR s.cpf = l.aluno_id
             GROUP BY s.id, s.full_name, s.pc_id, s.cpf
             ORDER BY MAX(CASE WHEN DATE(l.timestamp) = CURDATE() THEN l.timestamp ELSE NULL END) IS NULL ASC, MAX(CASE WHEN DATE(l.timestamp) = CURDATE() THEN l.timestamp ELSE NULL END) DESC, s.full_name ASC
        `);

        // --- CORREÇÃO: Alert Calculation BASED ON finalLogs (with overrides) ---
        const finalRedAlertStudents = new Set();
        const finalBlueAlertStudents = new Set();
        finalLogs.forEach(log => { // Itera sobre os logs JÁ COM overrides
            if (['Rede Social', 'Streaming & Jogos'].includes(log.categoria)) {
                finalRedAlertStudents.add(log.aluno_id);
            }
            if (log.categoria === 'IA') {
                finalBlueAlertStudents.add(log.aluno_id);
            }
        });
        console.log("--- Alertas recalculados com overrides:", { red: finalRedAlertStudents.size, blue: finalBlueAlertStudents.size }); // Log

        // Add CORRECTED alert flags to the summary
        const finalSummaryWithCorrectAlerts = summary.map(s => ({
            ...s,
            has_red_alert: finalRedAlertStudents.has(s.aluno_id), // Usa os sets recalculados
            has_blue_alert: finalBlueAlertStudents.has(s.aluno_id) // Usa os sets recalculados
        }));
        // --- Fim da Correção dos Alertas ---

        console.log("--- Enviando resposta final."); // Log
        // 5. Send the logs WITH overrides applied AND summary with CORRECTED alerts
        res.json({ logs: finalLogs, summary: finalSummaryWithCorrectAlerts });

    } catch (err) {
        console.error('ERRO na rota /api/data:', err);
        res.status(500).json({ error: 'Erro interno ao buscar dados.' });
    }
});
router.get('/api/alerts/:alunoId/:type', requireLogin, async (req, res) => {
    const alunoId = decodeURIComponent(req.params.alunoId);
    const { type } = req.params;
    let categories;
    if (type === 'red') categories = ['Rede Social', 'Streaming & Jogos'];
    else if (type === 'blue') categories = ['IA'];
    else return res.status(400).json({ error: 'Tipo de alerta inválido.' });

    try {
        // Fetch logs matching the criteria
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
router.get('/api/download-report/:date', requireLogin, async (req, res) => {
    try {
        // Fetch student names for mapping
        const [students] = await pool.query('SELECT full_name, cpf, pc_id FROM students');
        const studentNameMap = new Map();
        students.forEach(s => {
            if (s.pc_id) studentNameMap.set(s.pc_id, s.full_name);
            if (s.cpf) studentNameMap.set(s.cpf, s.full_name);
        });

        const dateStr = req.params.date; // Format YYYY-MM-DD
        const requestedDate = new Date(dateStr + 'T00:00:00'); // Use local time start for date comparison
        if (isNaN(requestedDate.getTime())) return res.status(400).send('Formato de data inválido. Use AAAA-MM-DD.');

        const today = new Date();
        today.setHours(0,0,0,0); // Start of today local time
        const requestedDateOnly = new Date(requestedDate); // Clone for comparison

        let aggregatedData = {};
        let dataSource = '';
        let foundData = false;

        if (requestedDateOnly.getTime() === today.getTime()) {
            // Fetch and aggregate logs for TODAY from 'logs' table
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
            // Fetch aggregated logs for PAST days from 'old_logs' table
            dataSource = 'Logs Arquivados';
            const [rows] = await pool.query('SELECT aluno_id, daily_logs FROM old_logs WHERE archive_date = ?', [dateStr]);
            if (rows.length > 0) {
                foundData = true;
                rows.forEach(row => {
                    try {
                        // Assuming daily_logs is stored as JSON type in MySQL
                        aggregatedData[row.aluno_id] = row.daily_logs;
                        // If stored as TEXT, uncomment below:
                        // aggregatedData[row.aluno_id] = JSON.parse(row.daily_logs);
                    } catch (parseError) {
                         console.error(`Erro ao parsear JSON de old_logs para aluno ${row.aluno_id} na data ${dateStr}:`, parseError);
                         // Handle error, maybe skip this entry or log it
                    }
                });
            }
        }

        if (!foundData) return res.status(404).send('Nenhum log encontrado para esta data.');

        // --- PDF Generation ---
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