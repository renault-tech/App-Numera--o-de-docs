// Versão corrigida - Cole DEPOIS de recarregar a página e fazer login

(function () {
    const icons = {
        documents: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`,
        users: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
        logs: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
        history: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
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
                        <div class="stat-icon">📊</div>
                        <div><div class="stat-value" id="totalDocTypes">0</div><div class="stat-label">Tipos de Documentos</div></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🔢</div>
                        <div><div class="stat-value" id="totalReservations">0</div><div class="stat-label">Total Reservas</div></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📅</div>
                        <div><div class="stat-value" id="todayReservations">0</div><div class="stat-label">Reservas Hoje</div></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">👥</div>
                        <div><div class="stat-value" id="totalUsers">0</div><div class="stat-label">Usuários</div></div>
                    </div>
                </div>
            </section>

            <section class="manage-section">
                <h2>Gerenciar Sistema</h2>
                <div class="stats-grid">
                    <div class="admin-nav-card" data-view="documents" onclick="document.getElementById('statsView').style.display='none'; document.getElementById('documentsView').style.display='block'; renderAdminDocs();">
                        <div class="stat-icon">${icons.documents}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Documentos</div>
                            <div class="help-text">Gerenciar tipos de documentos</div>
                        </div>
                    </div>
                    <div class="admin-nav-card" data-view="users" onclick="document.getElementById('statsView').style.display='none'; document.getElementById('usersView').style.display='block'; renderAdminUsers();">
                        <div class="stat-icon">${icons.users}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Usuários</div>
                            <div class="help-text">Cadastrar e gerenciar usuários</div>
                        </div>
                    </div>
                    <div class="admin-nav-card" data-view="logs" onclick="document.getElementById('statsView').style.display='none'; document.getElementById('logsView').style.display='block'; renderLogs();">
                        <div class="stat-icon">${icons.logs}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Logs</div>
                            <div class="help-text">Histórico de ações do sistema</div>
                        </div>
                    </div>
                    <div class="admin-nav-card" onclick="switchView('main')">
                        <div class="stat-icon">${icons.history}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Histórico</div>
                            <div class="help-text">Ver reservas de números</div>
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
                <p>Histórico completo de ações realizadas</p>
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

    if (typeof updateStats === 'function') updateStats();

    console.log('✅ Interface com ícones SVG criada!');
    console.log('✅ Clique nos cards para navegar');
})();
