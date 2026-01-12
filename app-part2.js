// PARTE 2 - Continuação do app.js

function renderAdminInterface() {
    const icons = {
        chart: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"></path><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path></svg>',
        counter: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>',
        calendar: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="8" cy="14" r="1" fill="currentColor"></circle><circle cx="12" cy="14" r="1" fill="currentColor"></circle><circle cx="16" cy="14" r="1" fill="currentColor"></circle></svg>',
        users: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
        documents: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>',
        usersNav: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
        logs: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>'
    };

    const adminContent = document.querySelector('.admin-content');
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
                    <div class="admin-nav-card" onclick="showAdminSubView('documents')">
                        <div class="stat-icon">${icons.documents}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Documentos</div>
                            <div class="help-text">Gerenciar tipos de documentos</div>
                        </div>
                    </div>
                    <div class="admin-nav-card" onclick="showAdminSubView('users')">
                        <div class="stat-icon">${icons.usersNav}</div>
                        <div>
                            <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Usuários</div>
                            <div class="help-text">Cadastrar e gerenciar usuários</div>
                        </div>
                    </div>
                    <div class="admin-nav-card" onclick="showAdminSubView('logs')">
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
            <button class="back-btn" onclick="showAdminSubView('stats')">← Voltar</button>
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
            <button class="back-btn" onclick="showAdminSubView('stats')">← Voltar</button>
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
            <button class="back-btn" onclick="showAdminSubView('stats')">← Voltar</button>
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

    renderAdminDocs();
    renderAdminUsers();
    renderLogs();
}

function showAdminSubView(view) {
    document.querySelectorAll('.admin-sub-view').forEach(v => v.style.display = 'none');
    document.getElementById(view + 'View').style.display = 'block';

    if (view === 'stats') updateStats();
    if (view === 'documents') renderAdminDocs();
    if (view === 'users') renderAdminUsers();
    if (view === 'logs') renderLogs();
}

function renderAdminDocs() {
    const container = document.getElementById('adminDocsList');
    if (!container) return;

    // ORDEM ALFABÉTICA
    const sortedDocs = [...state.documents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    container.innerHTML = sortedDocs.map(doc => `
        <div class="admin-doc-item" style="opacity: ${doc.enabled ? '1' : '0.5'}">
            <div class="admin-doc-info">
                <div class="admin-doc-name">${doc.name} ${!doc.enabled ? '(Desabilitado)' : ''}</div>
                <div class="admin-doc-details">
                    Prefixo: ${doc.prefix || 'Nenhum'} | 
                    Número atual: ${doc.currentNumber} | 
                    Reset anual: ${doc.yearlyReset ? 'Sim' : 'Não'}
                </div>
            </div>
            <div class="admin-doc-actions">
                <button class="icon-btn" onclick="toggleDocStatus('${doc.id}')" title="${doc.enabled ? 'Desabilitar' : 'Habilitar'}">${doc.enabled ? '👁️' : '🚫'}</button>
                <button class="icon-btn" onclick="openEditDocModal('${doc.id}')" title="Editar">✏️</button>
                <button class="icon-btn delete" onclick="deleteDocument('${doc.id}')" title="Excluir">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');
    if (!container) return;

    container.innerHTML = state.users.map(user => {
        const permLabel = PERMISSION_LEVELS[user.role]?.label || user.role;
        const permIcon = user.role === 'admin' ? '🔑' : user.role === 'user_readonly' ? '👁️' : '👤';

        return `
            <div class="admin-doc-item">
                <div class="admin-doc-info">
                    <div class="admin-doc-name">${user.name} ${user.id === state.currentUser.id ? '(Você)' : ''}</div>
                    <div class="admin-doc-details">
                        Usuário: ${user.username} | 
                        Cargo: ${user.cargo || 'N/A'} | 
                        Setor: ${user.setor || 'N/A'} | 
                        Secretaria: ${user.secretaria || 'N/A'}
                    </div>
                    <div class="admin-doc-details">
                        ${permIcon} ${permLabel}
                        ${user.allowedDocuments?.length > 0 ? ` | Acesso a ${user.allowedDocuments.length} documento(s)` : ''}
                    </div>
                </div>
                <div class="admin-doc-actions">
                    ${user.id !== state.currentUser.id ? `
                        <button class="icon-btn" onclick="openEditUserModal('${user.id}')">✏️</button>
                        <button class="icon-btn delete" onclick="deleteUser('${user.id}')">🗑️</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderLogs() {
    const container = document.getElementById('logsList');
    if (!container) return;

    const search = document.getElementById('logsSearch')?.value.toLowerCase() || '';

    let filtered = state.logs;

    if (state.currentLogFilter !== 'todos') {
        filtered = filtered.filter(l => l.type === state.currentLogFilter);
    }

    if (search) {
        filtered = filtered.filter(l =>
            l.action.toLowerCase().includes(search) ||
            l.details.toLowerCase().includes(search) ||
            l.userName.toLowerCase().includes(search)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum log encontrado.</p>';
        return;
    }

    container.innerHTML = filtered.slice(0, 100).map(log => {
        const date = new Date(log.timestamp);
        const typeColor = log.type === 'cadastro' ? '#3b82f6' : '#10b981';
        const typeIcon = log.type === 'cadastro' ? '📝' : '🔢';

        return `
            <div class="log-item" style="border-left: 4px solid ${typeColor}">
                <div class="log-header">
                    <span class="log-icon">${typeIcon}</span>
                    <span class="log-user">${log.userName}</span>
                    <span class="log-time">${formatDate(date)} às ${formatTime(date)}</span>
                </div>
                <div class="log-action">${log.action}</div>
                ${log.details ? `<div class="log-details">${log.details}</div>` : ''}
            </div>
        `;
    }).join('');
}

function filterLogs(type) {
    state.currentLogFilter = type;
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(type === 'todos' ? 'Todos' : type === 'cadastro' ? 'Cadastros' : 'Reservas'));
    });
    renderLogs();
}

function updateStats() {
    if (!document.getElementById('totalDocTypes')) return;

    document.getElementById('totalDocTypes').textContent = state.documents.length;
    document.getElementById('totalReservations').textContent = state.reservations.length;
    document.getElementById('totalUsers').textContent = state.users.length;

    const today = new Date().toISOString().split('T')[0];
    const todayCount = state.reservations.filter(r => r.timestamp.startsWith(today)).length;
    document.getElementById('todayReservations').textContent = todayCount;
}

function openAddDocModal() {
    state.editingDocId = null;
    document.getElementById('modalTitle').textContent = 'Adicionar Documento';
    document.getElementById('docForm').reset();
    document.getElementById('docModal').classList.add('active');
}

function openEditDocModal(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;

    state.editingDocId = docId;
    document.getElementById('modalTitle').textContent = 'Editar Documento';
    document.getElementById('docName').value = doc.name;
    document.getElementById('docPrefix').value = doc.prefix || '';
    document.getElementById('startNumber').value = doc.startNumber;
    document.getElementById('yearlyReset').checked = doc.yearlyReset;
    document.getElementById('docEnabled').checked = doc.enabled;
    document.getElementById('docModal').classList.add('active');
}

function closeDocModal() {
    document.getElementById('docModal').classList.remove('active');
}

function handleDocFormSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('docName').value,
        prefix: document.getElementById('docPrefix').value,
        startNumber: parseInt(document.getElementById('startNumber').value),
        yearlyReset: document.getElementById('yearlyReset').checked,
        enabled: document.getElementById('docEnabled').checked
    };

    if (state.editingDocId) {
        const doc = state.documents.find(d => d.id === state.editingDocId);
        Object.assign(doc, formData);
        addLog('cadastro', 'Editou documento', doc.name);
    } else {
        state.documents.push({
            id: generateId(),
            ...formData,
            currentNumber: formData.startNumber,
            lastResetYear: new Date().getFullYear()
        });
        addLog('cadastro', 'Criou documento', formData.name);
    }

    saveData();
    renderAdminDocs();
    renderDocuments();
    updateStats();
    closeDocModal();
}

function toggleDocStatus(docId) {
    const doc = state.documents.find(d => d.id === docId);
    doc.enabled = !doc.enabled;
    saveData();
    addLog('cadastro', `${doc.enabled ? 'Habilitou' : 'Desabilitou'} documento`, doc.name);
    renderAdminDocs();
    renderDocuments();
}

function deleteDocument(docId) {
    if (!confirm('Excluir este documento?')) return;
    const doc = state.documents.find(d => d.id === docId);
    state.documents = state.documents.filter(d => d.id !== docId);
    saveData();
    addLog('cadastro', 'Excluiu documento', doc.name);
    renderAdminDocs();
    renderDocuments();
    updateStats();
}

function openAddUserModal() {
    state.editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Adicionar Usuário';
    document.getElementById('userForm').reset();
    document.getElementById('userRole').value = 'user_restricted';
    handleRoleChange();
    document.getElementById('userModal').classList.add('active');
}

function openEditUserModal(userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    state.editingUserId = userId;
    document.getElementById('userModalTitle').textContent = 'Editar Usuário';
    document.getElementById('userName').value = user.name;
    document.getElementById('userCargo').value = user.cargo || '';
    document.getElementById('userSetor').value = user.setor || '';
    document.getElementById('userSecretaria').value = user.secretaria || '';
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = user.password;
    document.getElementById('userRole').value = user.role;

    handleRoleChange();

    if (user.allowedDocuments) {
        setTimeout(() => {
            user.allowedDocuments.forEach(docId => {
                const cb = document.querySelector(`.doc-checkbox[value="${docId}"]`);
                if (cb) cb.checked = true;
            });
        }, 100);
    }

    document.getElementById('userModal').classList.add('active');
}

function closeUserModal() {
    document.getElementById('userModal').classList.remove('active');
}

function handleRoleChange() {
    const role = document.getElementById('userRole').value;
    const section = document.getElementById('documentsSection');
    const desc = document.getElementById('roleDescription');

    desc.textContent = PERMISSION_LEVELS[role]?.desc || '';

    if (role === 'user_restricted' || role === 'user_readonly') {
        section.style.display = 'block';
        renderDocCheckboxes();
    } else {
        section.style.display = 'none';
    }
}

function renderDocCheckboxes() {
    const container = document.querySelector('#userModal #documentsList');
    if (!container) return;

    // ORDEM ALFABÉTICA
    const sortedDocs = [...state.documents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    container.innerHTML = sortedDocs.map(doc => `
        <label class="checkbox-label document-checkbox">
            <input type="checkbox" class="doc-checkbox" value="${doc.id}" ${doc.enabled ? '' : 'disabled'}>
            <span>${doc.name} ${doc.prefix ? '(' + doc.prefix + ')' : ''}</span>
            ${!doc.enabled ? '<span class="badge-disabled">Desabilitado</span>' : ''}
        </label>
    `).join('');
}

function selectAllDocs() {
    document.querySelectorAll('.doc-checkbox').forEach(cb => {
        if (!cb.disabled) cb.checked = true;
    });
}

function deselectAllDocs() {
    document.querySelectorAll('.doc-checkbox').forEach(cb => cb.checked = false);
}

function handleUserFormSubmit(e) {
    e.preventDefault();

    const role = document.getElementById('userRole').value;
    let allowedDocuments = [];

    if (role === 'user_restricted' || role === 'user_readonly') {
        allowedDocuments = Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.value);
        if (allowedDocuments.length === 0) {
            alert('Selecione pelo menos um documento!');
            return;
        }
    }

    const formData = {
        name: document.getElementById('userName').value,
        cargo: document.getElementById('userCargo').value,
        setor: document.getElementById('userSetor').value,
        secretaria: document.getElementById('userSecretaria').value,
        username: document.getElementById('userUsername').value,
        password: document.getElementById('userPassword').value,
        role: role,
        allowedDocuments: allowedDocuments
    };

    const existing = state.users.find(u => u.username === formData.username && u.id !== state.editingUserId);
    if (existing) {
        alert('Este nome de usuário já existe!');
        return;
    }

    if (state.editingUserId) {
        const user = state.users.find(u => u.id === state.editingUserId);
        Object.assign(user, formData);
        addLog('cadastro', 'Editou usuário', `${formData.name} - ${formData.cargo}`);
    } else {
        state.users.push({
            id: generateId(),
            ...formData,
            createdAt: new Date().toISOString()
        });
        addLog('cadastro', 'Criou usuário', `${formData.name} - ${formData.cargo}`);
    }

    saveUsers();
    renderAdminUsers();
    updateStats();
    closeUserModal();
}

function deleteUser(userId) {
    if (!confirm('Excluir este usuário?')) return;
    const user = state.users.find(u => u.id === userId);
    state.users = state.users.filter(u => u.id !== userId);
    saveUsers();
    addLog('cadastro', 'Excluiu usuário', user.name);
    renderAdminUsers();
    updateStats();
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(date) {
    return date.toLocaleDateString('pt-BR');
}

function formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
