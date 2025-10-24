document.addEventListener('DOMContentLoaded', () => {
    // Referências a elementos do DOM que podem ou não existir na página
    const logoutButton = document.getElementById('logout-button');
    const chartTypeButtons = document.querySelectorAll('.chart-type-button');
    const logCountSpan = document.getElementById('log-count');
    const activityLogsTableBody = document.querySelector('#activity-logs-table tbody');
    const filterDateInput = document.getElementById('filter-date');
    const applyDateFilterButton = document.getElementById('apply-date-filter');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const pageInfoSpan = document.getElementById('page-info');

    let allLogs = [];
    let currentPage = 1;
    const logsPerPage = 10;
    let chartInstance = null;
    const API_BASE_URL = window.location.origin;

    // --- FUNÇÃO CENTRAL DE API ---
    // Mantemos esta função pois ela envia os cookies corretamente
    async function apiCall(url, method = 'GET', body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        if (!response.ok) {
            // Se falhar por não estar autorizado, redireciona para o login
            if (response.status === 401 || response.status === 403) {
                window.location.href = '/login';
            }
            const errorData = await response.json().catch(() => ({ error: `Erro ${response.status}` }));
            throw new Error(errorData.error || `Erro ${response.status}`);
        }
        return response.json();
    }

    // --- LÓGICA DE LOGOUT ---
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await apiCall(`${API_BASE_URL}/api/logout`, 'POST');
                window.location.href = '/login';
            } catch (error) {
                console.error('Erro de rede ao fazer logout:', error);
                alert('Erro de rede ao fazer logout.');
            }
        });
    }

    // --- LÓGICA DE LOGS E PAGINAÇÃO ---
    async function fetchLogs(dateFilter = null) {
        // A função só executa se os elementos da tabela de logs existirem
        if (!activityLogsTableBody) return;

        try {
            const url = dateFilter ? `${API_BASE_URL}/api/data?date=${dateFilter}` : `${API_BASE_URL}/api/data`;
            const data = await apiCall(url);
            allLogs = data.logs || [];
            if (logCountSpan) logCountSpan.textContent = allLogs.length;
            renderLogs();
            updatePaginationButtons();
            renderChart(allLogs); // Renderiza o gráfico com os dados novos
        } catch (error) {
            console.error('Erro ao buscar logs:', error);
            // O redirecionamento já é tratado dentro de apiCall
        }
    }

    function renderLogs() {
        if (!activityLogsTableBody) return;
        activityLogsTableBody.innerHTML = '';
        const start = (currentPage - 1) * logsPerPage;
        const end = start + logsPerPage;
        const logsToDisplay = allLogs.slice(start, end);

        if (logsToDisplay.length === 0) {
            activityLogsTableBody.innerHTML = '<tr><td colspan="5">Nenhum log encontrado.</td></tr>';
            return;
        }

        logsToDisplay.forEach(log => {
            const row = activityLogsTableBody.insertRow();
            row.insertCell(0).innerHTML = log.student_name || 'N/A';
            row.insertCell(1).textContent = log.url;
            row.insertCell(2).textContent = log.duration;
            row.insertCell(3).textContent = log.categoria || 'N/A';
            row.insertCell(4).textContent = new Date(log.timestamp).toLocaleString('pt-BR');
        });
    }

    function updatePaginationButtons() {
        if (!pageInfoSpan) return;
        const totalPages = Math.ceil(allLogs.length / logsPerPage);
        pageInfoSpan.textContent = `Página ${currentPage} de ${totalPages || 1}`;
        prevPageButton.disabled = currentPage === 1;
        nextPageButton.disabled = currentPage === totalPages || totalPages === 0;
    }

    if (prevPageButton) {
        prevPageButton.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderLogs();
            }
        });
    }

    if (nextPageButton) {
        nextPageButton.addEventListener('click', () => {
            const totalPages = Math.ceil(allLogs.length / logsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderLogs();
            }
        });
    }

    if (applyDateFilterButton) {
        applyDateFilterButton.addEventListener('click', () => {
            const selectedDate = filterDateInput.value;
            currentPage = 1;
            fetchLogs(selectedDate);
        });
    }

    // --- LÓGICA DOS GRÁFICOS ---
    function processChartData(logs) {
        const domainDurations = {};
        logs.forEach(log => {
            const domain = log.url;
            domainDurations[domain] = (domainDurations[domain] || 0) + log.duration;
        });

        const sortedDomains = Object.entries(domainDurations)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10); // Top 10

        return {
            labels: sortedDomains.map(item => item[0]),
            data: sortedDomains.map(item => item[1])
        };
    }

    function renderChart(logs, chartType = 'bar') {
        const ctx = document.getElementById('mainChart')?.getContext('2d');
        if (!ctx) return; // Só continua se o canvas do gráfico existir na página

        const chartData = processChartData(logs);

        if (chartInstance) {
            chartInstance.destroy();
        }

        const backgroundColors = [
            'rgba(220, 38, 38, 0.7)', 'rgba(54, 162, 235, 0.7)',
            'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)',
            'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
            'rgba(199, 199, 199, 0.7)', 'rgba(83, 102, 255, 0.7)',
            'rgba(120, 120, 120, 0.7)', 'rgba(60, 180, 75, 0.7)'
        ];

        let datasets = [];
        if (['line', 'radar'].includes(chartType)) {
            datasets.push({
                label: 'Duração (s)',
                data: chartData.data,
                fill: false,
                backgroundColor: backgroundColors[1],
                borderColor: backgroundColors[1],
                tension: 0.1
            });
        } else {
             datasets.push({
                label: 'Duração (s)',
                data: chartData.data,
                backgroundColor: backgroundColors,
                borderWidth: 1
            });
        }

        chartInstance = new Chart(ctx, {
            type: chartType,
            data: {
                labels: chartData.labels,
                datasets: datasets,
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: chartType === 'bar' ? 'y' : 'x',
                plugins: {
                    legend: {
                        display: ['pie', 'doughnut', 'polarArea'].includes(chartType)
                    }
                }
            }
        });
    }

    if (chartTypeButtons.length > 0) {
        chartTypeButtons.forEach(button => {
            button.addEventListener('click', () => {
                chartTypeButtons.forEach(btn => btn.classList.remove('active', 'bg-red-700', 'text-white'));
                button.classList.add('active', 'bg-red-700', 'text-white');
                const type = button.dataset.type;
                renderChart(allLogs, type);
            });
        });
    }

    // --- INICIALIZAÇÃO ---
    // Removemos a chamada 'checkAuth()' daqui. A primeira chamada 'fetchLogs' servirá como verificação.
    fetchLogs();
});