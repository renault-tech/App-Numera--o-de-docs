// Versão POLIDA - Ícones bonitos + Layout harmonioso + Texto correto
// Cole no Console (F12) após login

(function () {
    // Ícones SVG refinados e bonitos
    const icons = {
        // Ícones das ESTATÍSTICAS - mais detalhados e bonitos
        chart: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"></path><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path></svg>',
        counter: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>',
        calendar: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="8" cy="14" r="1" fill="currentColor"></circle><circle cx="12" cy="14" r="1" fill="currentColor"></circle><circle cx="16" cy="14" r="1" fill="currentColor"></circle></svg>',
        users: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',

        // Ícones dos CARDS DE NAVEGAÇÃO
        documents: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>',
        usersNav: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
        logs: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>'
    };

    const adminContent = document.querySelector('.admin-content');
    if (!adminContent) {
        alert('Vá para Administração primeiro!');
        return;
    }

    adminContent.innerHTML = `
        <div id="statsView" class="admin-sub-view" style="display: block;">
            <section class="stats-section">
                <h2>Estatísticas</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon" style="color: #2563eb;">${icons.chart}</div>
                        <div><div class="stat-value" id="totalDocTypes">0</div><div class="stat-label">Tipos de Documentos</div></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="color: #10b981;">${icons.counter}</div>
                        <div><div class="stat-value" id="totalReservations">0</div><div class="stat-label">Total de Reservas</div></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="color: #f59e0b;">${icons.calendar}</div>
                        <div><div class="stat-value" id="todayReservations">0</div><div class="stat-label">Reservas Hoje</div></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="color: #8b5cf6;">${icons.users}</div>
                        <div><div class="stat-value" id="totalUsers">0</div><div class="stat-label">Usuários</div></div>
                    </div>
                </div>
            </section>

            <section class="manage-section">
                <h2>Gerenciar Sistema</h2>
                <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
                    <div class="admin-nav-card" onclick="document.getElementById('statsView').style.display='none'; document.getElementById('documentsView').style.display='block'; renderAdminDocs();">
                        <div class="stat-icon">${icons.documents}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Documentos</div>
                            <div class="help-text">Gerenciar tipos de documentos</div>
                        </div>
                    </div>
                    <div class="admin-nav-card" onclick="document.getElementById('statsView').style.display='none'; document.getElementById('usersView').style.display='block'; renderAdminUsers();">
                        <div class="stat-icon">${icons.usersNav}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Usuários</div>
                            <div class="help-text">Cadastrar e gerenciar usuários</div>
                        </div>
                    </div>
                    <div class="admin-nav-card" onclick="document.getElementById('statsView').style.display='none'; document.getElementById('logsView').style.display='block'; renderLogs();">
                        <div class="stat-icon">${icons.logs}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Logs do Sistema</div>
                            <div class="help-text">Histórico completo de ações</div>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <div id="documentsView" class="admin-sub-view" style="display: none;">
            <button class="back-btn" onclick="this.parentElement.style.display='none'; document.getElementById('statsView').style.display='block';">← Voltar</button>
            <div class="view-header">
                <h2>📄 Gerenciar Documentos</h2>
                <p>Adicionar, editar e configurar tipos de documentos</p>
            </div>
            <div style="margin-bottom: 1.5rem;">
                <button class="btn-primary" onclick="openAddDocModal()">➕ Adicionar Documento</button>
            </div>
            <div id="adminDocsList" class="admin-docs-list"></div>
        </div>

        <div id="usersView" class="admin-sub-view" style="display: none;">
            <button class="back-btn" onclick="this.parentElement.style.display='none'; document.getElementById('statsView').style.display='block';">← Voltar</button>
            <div class="view-header">
                <h2>👥 Gerenciar Usuários</h2>
                <p>Cadastrar usuários e configurar permissões</p>
            </div>
            <div style="margin-bottom: 1.5rem;">
                <button class="btn-primary" onclick="openAddUserModal()">➕ Adicionar Usuário</button>
            </div>
            <div id="adminUsersList" class="admin-docs-list"></div>
        </div>

        <div id="logsView" class="admin-sub-view" style="display: none;">
            <button class="back-btn" onclick="this.parentElement.style.display='none'; document.getElementById('statsView').style.display='block';">← Voltar</button>
            <div class="view-header">
                <h2>📊 Logs do Sistema</h2>
                <p>Histórico completo de todas as ações realizadas no sistema</p>
            </div>
            <div class="logs-filters">
                <button class="log-filter-btn active" onclick="filterLogs('todos')">📋 Todos</button>
                <button class="log-filter-btn" onclick="filterLogs('cadastro')">📝 Cadastros</button>
                <button class="log-filter-btn" onclick="filterLogs('reserva')">🔢 Reservas</button>
                <div class="logs-search">
                    <input type="text" id="logsSearch" placeholder="Buscar logs..." oninput="renderLogs()">
                </div>
            </div>
            <div id="logsList" class="logs-list"></div>
        </div>
    `;

    // Melhorar layout dos cards de documentos na tela principal
    const style = document.createElement('style');
    style.textContent = `
        /* Cards de documentos menores e mais harmoniosos */
        .doc-card {
            min-height: 200px !important;
            max-height: 200px !important;
        }
        
        .doc-card-header {
            justify-content: center !important;
            margin-bottom: 0.75rem !important;
        }
        
        .doc-badge {
            display: none !important; /* Remover número no canto */
        }
        
        .doc-icon {
            font-size: 2.5rem !important;
        }
        
        .documents-grid {
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
            gap: 1.25rem !important;
        }
        
        .doc-name {
            font-size: 1.125rem !important;
            margin-bottom: 0.5rem !important;
        }
        
        .doc-prefix {
            font-size: 0.875rem !important;
            margin-bottom: 0.75rem !important;
        }
        
        .doc-number {
            font-size: 1.5rem !important;
            font-weight: 700 !important;
            color: #2563eb !important;
            margin-bottom: 1rem !important;
        }
    `;
    document.head.appendChild(style);

    // Filtrar histórico
    const originalRenderHistory = window.renderHistory;
    window.renderHistory = function () {
        const container = document.getElementById('historyList');
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';

        let filtered = state.reservations;

        if (state.currentUser.role !== 'admin') {
            filtered = filtered.filter(r => r.userId === state.currentUser.id);
        }

        filtered = filtered.filter(r =>
            r.docName.toLowerCase().includes(search) ||
            r.formattedNumber.toLowerCase().includes(search) ||
            r.userName.toLowerCase().includes(search)
        );

        if (filtered.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhuma reserva encontrada.</p>';
            return;
        }

        container.innerHTML = filtered.slice(0, 50).map(r => `
            <div class="history-item">
                <div class="history-info">
                    <div class="history-type">${r.docName}</div>
                    <div class="history-details">${formatDate(new Date(r.timestamp))} às ${formatTime(new Date(r.timestamp))} - ${r.userName}</div>
                </div>
                <div class="history-number">${r.formattedNumber}</div>
            </div>
        `).join('');
    };

    if (typeof updateStats === 'function') updateStats();

    console.log('✅ Interface polida e harmoniosa!');
    console.log('✅ Ícones bonitos nas estatísticas com cores');
    console.log('✅ Cards menores e organizados');
    console.log('✅ Sem números duplicados');
})();
