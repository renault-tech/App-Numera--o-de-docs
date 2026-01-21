// Sistema de Numeração de Documentos - Versão Simplificada e Completa
// Com: Campos expandidos, 4 níveis de permissão, seleção de documentos, logs

let state = {
    documents: [],
    reservations: [],
    users: [],
    logs: [],
    secretariaPermissions: {}, // Documentos permitidos por secretaria
    currentUser: null,
    currentView: 'login',
    editingDocId: null,
    editingUserId: null,
    currentLogFilter: 'todos'
};

// Níveis de permissão
const PERMISSION_LEVELS = {
    admin: { label: 'Administrador', desc: 'Acesso total' },
    user_full: { label: 'Usuário Completo', desc: 'Todos documentos' },
    user_restricted: { label: 'Usuário Restrito', desc: 'Documentos específicos' },
    user_readonly: { label: 'Somente Leitura', desc: 'Visualizar apenas' }
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    checkAutoLogin();
});

// Carregar dados
function loadData() {
    const savedDocs = localStorage.getItem('documents');
    const savedReservations = localStorage.getItem('reservations');
    const savedUsers = localStorage.getItem('users');
    const savedLogs = localStorage.getItem('logs');

    if (savedDocs) {
        state.documents = JSON.parse(savedDocs);
        checkYearlyReset();
    } else {
        state.documents = [
            { id: generateId(), name: 'Ofício', prefix: 'Of.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Memorando', prefix: 'Mem.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Resolução', prefix: 'Res.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Contrato', prefix: 'Contr.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Decreto', prefix: 'Dec.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Portaria', prefix: 'Port.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Ata', prefix: '', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Edital', prefix: 'Ed.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Parecer', prefix: 'Par.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Circular', prefix: 'Circ.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Processo', prefix: 'Proc.', startNumber: 1, currentNumber: 1, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Protocolo', prefix: 'Prot.', startNumber: 1000, currentNumber: 1000, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Lei', prefix: 'L.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Lei Complementar', prefix: 'LC', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Medida Provisória', prefix: 'MP', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Instrução Normativa', prefix: 'IN', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Exposição de Motivos', prefix: 'EM', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Folha', prefix: 'fl.', startNumber: 1, currentNumber: 1, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true }
        ];
        saveData();
    }

    state.reservations = savedReservations ? JSON.parse(savedReservations) : [];
    state.logs = savedLogs ? JSON.parse(savedLogs) : [];

    // Carregar permissões de secretaria
    const savedSecretariaPerms = localStorage.getItem('secretariaPermissions');
    state.secretariaPermissions = savedSecretariaPerms ? JSON.parse(savedSecretariaPerms) : {};

    if (savedUsers) {
        state.users = JSON.parse(savedUsers);
    } else {
        state.users = [{
            id: generateId(),
            username: 'admin',
            password: 'admin123',
            name: 'Administrador',
            cargo: 'Administrador do Sistema',
            setor: 'TI',
            secretaria: 'Administrativa',
            role: 'admin',
            allowedDocuments: [],
            createdAt: new Date().toISOString()
        }];
        addLog('usuario', 'Criou usuário inicial', `${state.users[0].name} - ${state.users[0].cargo}`);
        saveUsers();
    }
}

// Salvar dados
function saveData() {
    localStorage.setItem('documents', JSON.stringify(state.documents));
    localStorage.setItem('reservations', JSON.stringify(state.reservations));
    if (typeof syncAllViews === 'function') syncAllViews();
}

function saveUsers() {
    localStorage.setItem('users', JSON.stringify(state.users));
    if (typeof syncAllViews === 'function') syncAllViews();
}

function saveLogs() {
    localStorage.setItem('logs', JSON.stringify(state.logs));
}

function saveSecretariaPermissions() {
    localStorage.setItem('secretariaPermissions', JSON.stringify(state.secretariaPermissions));
    if (typeof syncAllViews === 'function') syncAllViews();
}

// Adicionar log
function addLog(type, action, details) {
    state.logs.unshift({
        id: generateId(),
        type: type,
        action: action,
        details: details,
        userId: state.currentUser?.id,
        userName: state.currentUser?.name || 'Sistema',
        timestamp: new Date().toISOString()
    });
    if (state.logs.length > 1000) state.logs = state.logs.slice(0, 1000);
    saveLogs();
}

// Reset anual
function checkYearlyReset() {
    const currentYear = new Date().getFullYear();
    let hasChanges = false;
    state.documents.forEach(doc => {
        if (doc.yearlyReset && doc.lastResetYear !== currentYear) {
            doc.currentNumber = doc.startNumber;
            doc.lastResetYear = currentYear;
            hasChanges = true;
        }
    });
    if (hasChanges) saveData();
}

// Auto login
function checkAutoLogin() {
    const savedUserId = localStorage.getItem('currentUserId');
    if (savedUserId) {
        const user = state.users.find(u => u.id === savedUserId);
        if (user) {
            state.currentUser = user;
            showMainApp();
            return;
        }
    }
    showLoginView();
}

// Login
function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    const user = state.users.find(u => u.username === username && u.password === password);

    if (user) {
        state.currentUser = user;
        localStorage.setItem('currentUserId', user.id);
        addLog('sistema', 'Login realizado', `${user.name} acessou o sistema`);
        showMainApp();
    } else {
        showAlertModal('❌ Erro de Login', 'Usuário ou senha incorretos!');
    }
}

// Logout
function handleLogout() {
    addLog('sistema', 'Logout realizado', `${state.currentUser.name} saiu do sistema`);
    localStorage.removeItem('currentUserId');
    state.currentUser = null;
    showLoginView();
}

// Tela de login
function showLoginView() {
    document.body.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <div class="logo-large">📄</div>
                    <h1>Sistema de Numeração</h1>
                    <p>Faça login para continuar</p>
                </div>
                <form id="loginForm" class="login-form">
                    <div class="form-group">
                        <label for="loginUsername">Usuário</label>
                        <input type="text" id="loginUsername" required autofocus>
                    </div>
                    <div class="form-group">
                        <label for="loginPassword">Senha</label>
                        <input type="password" id="loginPassword" required>
                    </div>
                    <button type="submit" class="btn-primary btn-block">Entrar</button>
                </form>
            </div>
        </div>
    `;
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

// Tela principal
function showMainApp() {
    const isAdmin = state.currentUser.role === 'admin';

    document.body.innerHTML = `
        <div class="app-container">
            <header class="app-header">
                <div class="header-content">
                    <div class="logo"><h1>📄 Sistema de Numeração</h1></div>
                    <nav class="header-nav">
                        <button class="nav-btn active" onclick="switchView('main')">📋 Principal</button>
                        ${isAdmin ? '<button class="nav-btn" onclick="switchView(\'admin\')">⚙️ Administração</button>' : ''}
                    </nav>
                    <div class="header-actions">
                        <span class="user-info">${state.currentUser.name} (${PERMISSION_LEVELS[state.currentUser.role].label})</span>
                        <div class="font-zoom-controls">
                            <button class="zoom-btn" onclick="decreaseFontZoom()" title="Diminuir fonte">A-</button>
                            <span id="fontZoomIndicator" class="zoom-indicator">100%</span>
                            <button class="zoom-btn" onclick="increaseFontZoom()" title="Aumentar fonte">A+</button>
                        </div>
                        <button class="btn-secondary" onclick="handleLogout()">Sair</button>
                    </div>
                </div>
            </header>

            <main id="mainView" class="view active">
                <div class="main-content">
                    <section class="documents-section">
                        <div class="section-header">
                            <h2>Tipos de Documentos</h2>
                            <p>Selecione um documento para reservar número</p>
                        </div>
                        <div id="documentsList" class="documents-grid"></div>
                    </section>

                    <section class="history-section">
                        <div class="section-header">
                            <h2>Histórico de Reservas</h2>
                            <div class="search-box">
                                <span class="search-icon">🔍</span>
                                <input type="text" id="searchInput" placeholder="Buscar..." oninput="renderHistory()">
                            </div>
                        </div>
                        <div id="historyList" class="history-list"></div>
                    </section>
                </div>
            </main>

            ${isAdmin ? `
            <main id="adminView" class="view">
                <div class="admin-content">
                    <!-- Gerenciamento e Estatísticas -->
                    <section class="stats-section">
                        <h2>Gerenciamento e Estatísticas</h2>
                        <div class="stats-grid">
                            <div class="stat-card stat-card-clickable" onclick="showAdminSection('documentos')">
                                <div class="stat-icon">📄</div>
                                <div><div class="stat-value" id="totalDocTypes">0</div><div class="stat-label">Documentos</div></div>
                            </div>
                            <div class="stat-card stat-card-clickable" onclick="showAdminSection('logs')">
                                <div class="stat-icon">🔢</div>
                                <div><div class="stat-value" id="totalReservations">0</div><div class="stat-label">Histórico</div></div>
                            </div>
                            <div class="stat-card stat-card-clickable" onclick="showAdminSection('usuarios')">
                                <div class="stat-icon">👥</div>
                                <div><div class="stat-value" id="totalUsers">0</div><div class="stat-label">Usuários</div></div>
                            </div>
                        </div>
                    </section>

                    <!-- Ferramentas -->
                    <section class="nav-section">
                        <h2>Ferramentas</h2>
                        <div class="nav-cards-grid">
                            <div class="nav-card" onclick="showAdminSection('backup')">
                                <div class="nav-card-icon">💾</div>
                                <div class="nav-card-title">Backup</div>
                                <div class="nav-card-desc">Exportar e importar dados</div>
                            </div>
                        </div>
                    </section>

                    <!-- View: Documentos -->
                    <div id="adminSectionDocumentos" class="admin-section" style="display: none;">
                        <button class="back-btn" onclick="hideAdminSections()">← Voltar</button>
                        <h2>📄 Gerenciar Documentos</h2>
                        <button class="btn-primary" onclick="toggleDocForm()" style="margin-bottom: 1.5rem;">➕ Adicionar Documento</button>
                        
                        <!-- Formulário Inline -->
                        <div id="docFormInline" class="inline-form" style="display: none;">
                            <h3 id="docFormTitle">Adicionar Documento</h3>
                            <form id="docForm" onsubmit="handleDocFormSubmit(event)">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="docName">Nome do Documento *</label>
                                        <input type="text" id="docName" required placeholder="Ex: Ofício">
                                    </div>
                                    <div class="form-group">
                                        <label for="docPrefix">Prefixo</label>
                                        <input type="text" id="docPrefix" placeholder="Ex: Of.">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="startNumber">Número Inicial *</label>
                                        <input type="number" id="startNumber" value="1" min="1" required>
                                    </div>
                                    <div class="checkbox-group">
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="yearlyReset">
                                            <span>Resetar numeração anualmente</span>
                                        </label>
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="docEnabled" checked>
                                            <span>Documento habilitado</span>
                                        </label>
                                    </div>
                                </div>
                                <div class="form-actions">
                                    <button type="button" class="btn-secondary" onclick="toggleDocForm()">Cancelar</button>
                                    <button type="submit" class="btn-primary">Salvar</button>
                                </div>
                            </form>
                        </div>
                        
                        <div id="adminDocsList" class="admin-docs-list"></div>
                    </div>

                    <!-- View: Usuários -->
                    <div id="adminSectionUsuarios" class="admin-section" style="display: none;">
                        <button class="back-btn" onclick="hideAdminSections()">← Voltar</button>
                        <h2>👥 Gerenciar Usuários</h2>
                        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
                            <button class="btn-primary" onclick="toggleUserForm()">➕ Adicionar Usuário</button>
                            <button class="btn-secondary" onclick="toggleSecretariaConfig()">⚙️ Configurar Secretarias</button>
                        </div>
                        
                        <!-- Área de Configuração de Secretarias -->
                        <div id="secretariaConfigArea" class="inline-form" style="display: none;">
                            <h3>⚙️ Configurar Documentos por Secretaria</h3>
                            <p class="help-text" style="margin-bottom: 1.5rem;">Defina quais documentos cada secretaria pode acessar por padrão. Novos usuários dessa secretaria herdarão essas permissões automaticamente.</p>
                            <div id="secretariaConfigList"></div>
                            <div class="form-actions">
                                <button type="button" class="btn-secondary" onclick="toggleSecretariaConfig()">Cancelar</button>
                                <button type="button" class="btn-primary" onclick="saveSecretariaConfig()">💾 Salvar Configurações</button>
                            </div>
                        </div>
                        
                        <!-- Campo de Busca -->
                        <div class="search-box" style="max-width: 100%; margin-bottom: 1.5rem;">
                            <span class="search-icon">🔍</span>
                            <input type="text" id="usersSearch" placeholder="Buscar por nome, usuário, cargo, setor ou secretaria..." oninput="renderAdminUsers()">
                        </div>
                        
                        <!-- Formulário Inline -->
                        <div id="userFormInline" class="inline-form" style="display: none;">
                            <h3 id="userFormTitle">Adicionar Usuário</h3>
                            <form id="userForm" onsubmit="handleUserFormSubmit(event)">
                                <div class="form-section-inline">
                                    <h4>📋 Informações Pessoais</h4>
                                    <div class="form-group">
                                        <label for="userName">Nome Completo *</label>
                                        <input type="text" id="userName" required>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label for="userCargo">Cargo *</label>
                                            <input type="text" id="userCargo" required>
                                        </div>
                                        <div class="form-group">
                                            <label for="userSetor">Setor *</label>
                                            <input type="text" id="userSetor" required>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label for="userSecretaria">Secretaria *</label>
                                        <select id="userSecretaria" required>
                                            <option value="">Selecione...</option>
                                            <option value="Controle Interno">Controle Interno</option>
                                            <option value="Gabinete">Gabinete</option>
                                            <option value="Procuradoria">Procuradoria</option>
                                            <option value="Secretaria de Administração">Secretaria de Administração</option>
                                            <option value="Secretaria de Agricultura e Meio Ambiente">Secretaria de Agricultura e Meio Ambiente</option>
                                            <option value="Secretaria de Cultura e Turismo">Secretaria de Cultura e Turismo</option>
                                            <option value="Secretaria de Desenvolvimento Econômico e Gestão Institucional">Secretaria de Desenvolvimento Econômico e Gestão Institucional</option>
                                            <option value="Secretaria de Desenvolvimento Social">Secretaria de Desenvolvimento Social</option>
                                            <option value="Secretaria de Educação">Secretaria de Educação</option>
                                            <option value="Secretaria de Esporte">Secretaria de Esporte</option>
                                            <option value="Secretaria de Fazenda">Secretaria de Fazenda</option>
                                            <option value="Secretaria da Saúde">Secretaria da Saúde</option>
                                            <option value="Secretaria de Serviços Urbanos">Secretaria de Serviços Urbanos</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-section-inline">
                                    <h4>🔐 Credenciais</h4>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label for="userUsername">Usuário (login) *</label>
                                            <input type="text" id="userUsername" required>
                                        </div>
                                        <div class="form-group">
                                            <label for="userPassword">Senha *</label>
                                            <input type="password" id="userPassword" required>
                                        </div>
                                    </div>
                                </div>
                                <div class="form-section-inline">
                                    <h4>🔑 Permissão</h4>
                                    <div class="form-group">
                                        <label for="userRole">Nível de Permissão *</label>
                                        <select id="userRole" required onchange="handleRoleChange()">
                                            <option value="user_restricted">Usuário Restrito</option>
                                            <option value="user_full">Usuário Completo</option>
                                            <option value="user_readonly">Somente Leitura</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                        <p class="help-text" id="roleDescription">Acesso apenas a documentos específicos</p>
                                    </div>
                                </div>
                                <div class="form-section-inline" id="documentsSection">
                                    <h4>📄 Documentos Permitidos</h4>
                                    <div class="checkbox-actions">
                                        <button type="button" class="btn-link" onclick="selectAllDocs()">☑ Todos</button>
                                        <button type="button" class="btn-link" onclick="deselectAllDocs()">☐ Nenhum</button>
                                    </div>
                                    <div id="documentsList" class="documents-checkboxes"></div>
                                </div>
                                <div class="form-actions">
                                    <button type="button" class="btn-secondary" onclick="toggleUserForm()">Cancelar</button>
                                    <button type="submit" class="btn-primary">Salvar Usuário</button>
                                </div>
                            </form>
                        </div>
                        
                        <div id="adminUsersList" class="admin-docs-list"></div>
                    </div>

                    <!-- View: Logs -->
                    <div id="adminSectionLogs" class="admin-section" style="display: none;">
                        <button class="back-btn" onclick="hideAdminSections()">← Voltar</button>
                        <h2>📊 Histórico do Sistema</h2>
                        
                        <!-- Botões de Exportação -->
                        <div class="export-toolbar">
                            <button class="export-btn export-pdf" onclick="exportHistoryToPDF()" title="Exportar para PDF">
                                <span class="export-icon">📄</span>
                                <span>Exportar PDF</span>
                            </button>
                            <button class="export-btn export-excel" onclick="exportHistoryToExcel()" title="Exportar para Excel">
                                <span class="export-icon">📊</span>
                                <span>Exportar Excel</span>
                            </button>
                            <button class="export-btn export-word" onclick="exportHistoryToWord()" title="Exportar para Word">
                                <span class="export-icon">📝</span>
                                <span>Exportar Word</span>
                            </button>
                            <button class="export-btn export-stats" onclick="toggleDocStats()" title="Ver Estatísticas por Documento">
                                <span class="export-icon">📊</span>
                                <span>Estatísticas</span>
                            </button>
                        </div>
                        
                        <!-- Painel de Estatísticas Expansível -->
                        <div id="docStatsPanel" class="doc-stats-panel" style="display: none;">
                            <h3>📊 Estatísticas de Reservas por Documento</h3>
                            <div id="docStatsList" class="doc-stats-grid"></div>
                        </div>
                        
                        <div class="logs-filters">
                            <button class="log-filter-btn active" onclick="filterLogs('todos')">📋 Todos</button>
                            <button class="log-filter-btn" onclick="filterLogs('reserva')">🔢 Reservas</button>
                            <button class="log-filter-btn" onclick="filterLogs('sistema')">⚙️ Sistema</button>
                            <button class="log-filter-btn" onclick="filterLogs('usuario')">👤 Usuários</button>
                            <button class="log-filter-btn" onclick="filterLogs('documento')">📄 Documentos</button>
                            <div class="logs-search">
                                <input type="text" id="logsSearch" placeholder="Buscar logs..." oninput="renderLogs()">
                            </div>
                        </div>
                        <div id="logsList" class="logs-list"></div>
                    </div>

                    <!-- View: Backup -->
                    <div id="adminSectionBackup" class="admin-section" style="display: none;">
                        <button class="back-btn" onclick="hideAdminSections()">← Voltar</button>
                        <h2>💾 Backup de Dados</h2>
                        
                        <div class="backup-section">
                            <div class="backup-card">
                                <div class="backup-card-content">
                                    <div class="backup-icon">📥</div>
                                    <h3>Exportar Dados</h3>
                                    <p>Baixar todos os dados do sistema em formato JSON. Use este arquivo para fazer backup ou transferir para outro computador.</p>
                                    <button class="btn-primary" onclick="exportData()" style="margin-top: 1rem;">📥 Exportar Dados</button>
                                </div>
                            </div>
                            
                            <div class="backup-card">
                                <div class="backup-card-content">
                                    <div class="backup-icon">📤</div>
                                    <h3>Importar Dados</h3>
                                    <p>Carregar dados de um arquivo de backup. <strong>Atenção:</strong> Esta ação substituirá todos os dados atuais!</p>
                                    <button class="btn-secondary" onclick="importData()" style="margin-top: 1rem; background: var(--warning-gradient); color: white;">📤 Importar Dados</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="backup-info">
                            <h3>ℹ️ Informações Importantes</h3>
                            <ul>
                                <li><strong>O que é exportado:</strong> Documentos, reservas, usuários e logs</li>
                                <li><strong>Formato:</strong> Arquivo JSON</li>
                                <li><strong>Como usar:</strong> 
                                    <ol>
                                        <li>Exporte os dados neste computador</li>
                                        <li>Copie o arquivo para o outro computador</li>
                                        <li>Importe o arquivo no outro computador</li>
                                    </ol>
                                </li>
                                <li><strong>Atenção:</strong> Ao importar, todos os dados atuais serão substituídos</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </main>
            ` : ''}

            <!-- Custom Modal: Confirmação -->
            <div id="customConfirmModal" class="custom-modal-overlay">
                <div class="custom-modal">
                    <div class="custom-modal-header">
                        <h3 id="confirmModalTitle">Confirmar</h3>
                    </div>
                    <div class="custom-modal-body">
                        <p id="confirmModalMessage"></p>
                    </div>
                    <div class="custom-modal-footer">
                        <button id="cancelBtn" class="modal-btn modal-btn-cancel">Cancelar</button>
                        <button id="confirmBtn" class="modal-btn modal-btn-confirm">Confirmar</button>
                    </div>
                </div>
            </div>

            <!-- Custom Modal: Assunto e Ementa -->
            <div id="subjectEmentaModal" class="custom-modal-overlay">
                <div class="custom-modal modal-large">
                    <div class="custom-modal-header">
                        <h3>📝 Informações do Documento</h3>
                    </div>
                    <div class="custom-modal-body">
                        <div class="form-group">
                            <label for="reservationSubject">Assunto *</label>
                            <input type="text" id="reservationSubject" placeholder="Digite o assunto do documento" class="modal-input">
                        </div>
                        <div class="form-group">
                            <label for="reservationEmenta">Ementa *</label>
                            <textarea id="reservationEmenta" maxlength="300" rows="4" 
                                      placeholder="Digite a ementa do documento (máximo 300 caracteres)" 
                                      class="modal-textarea"></textarea>
                            <div class="char-counter">
                                <span id="ementaCounter">0</span>/300 caracteres
                            </div>
                        </div>
                    </div>
                    <div class="custom-modal-footer">
                        <button id="cancelSubjectBtn" class="modal-btn modal-btn-cancel">Cancelar</button>
                        <button id="continueSubjectBtn" class="modal-btn modal-btn-confirm">Continuar</button>
                    </div>
                </div>
            </div>

            <!-- Custom Modal: Alerta -->
            <div id="customAlertModal" class="custom-modal-overlay">
                <div class="custom-modal">
                    <div class="custom-modal-header">
                        <h3 id="alertModalTitle">Aviso</h3>
                    </div>
                    <div class="custom-modal-body">
                        <p id="alertModalMessage"></p>
                    </div>
                    <div class="custom-modal-footer">
                        <button id="alertOkBtn" class="modal-btn modal-btn-ok">OK</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
    renderDocuments();
    renderHistory();
    if (isAdmin) {
        renderAdminDocs();
        renderAdminUsers();
        renderLogs();
        updateStats();
    }
}

// Event listeners
function setupEventListeners() {
    if (typeof initAutocomplete === 'function') {
        const docNameInput = document.getElementById('docName');
        if (docNameInput) setTimeout(() => initAutocomplete(), 100);
    }
}

// Sincronização de todas as views
function syncAllViews() {
    // Renderizar view principal se estiver ativa
    if (document.getElementById('mainView')?.classList.contains('active')) {
        renderDocuments();
        renderHistory();
    }

    // Renderizar views admin se estiverem ativas
    if (document.getElementById('adminView')?.classList.contains('active')) {
        const isAdmin = state.currentUser?.role === 'admin';
        if (isAdmin) {
            renderAdminDocs();
            renderAdminUsers();
            renderLogs();
            updateStats();
        }
    }
}

// Mudar view
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    if (view === 'main') {
        document.getElementById('mainView').classList.add('active');
        document.querySelector('[onclick="switchView(\'main\')"]').classList.add('active');
    } else {
        document.getElementById('adminView').classList.add('active');
        document.querySelector('[onclick="switchView(\'admin\')"]').classList.add('active');
        updateStats();
    }
}

// Filtrar documentos por permissão
function getVisibleDocuments() {
    let docs = state.documents.filter(d => d.enabled);
    const user = state.currentUser;

    if (user.role === 'admin' || user.role === 'user_full') return docs;

    if (user.role === 'user_restricted' || user.role === 'user_readonly') {
        if (!user.allowedDocuments || user.allowedDocuments.length === 0) return [];
        return docs.filter(d => user.allowedDocuments.includes(d.id));
    }
    return docs;
}

// Verificar se pode reservar
function canReserve(docId) {
    const user = state.currentUser;
    if (user.role === 'user_readonly') return false;
    if (user.role === 'admin' || user.role === 'user_full') return true;
    return user.allowedDocuments && user.allowedDocuments.includes(docId);
}

// Renderizar documentos
function renderDocuments() {
    const container = document.getElementById('documentsList');
    const docs = getVisibleDocuments();

    if (docs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum documento disponível.</p>';
        return;
    }

    container.innerHTML = docs.map(doc => `
        <div class="doc-card">
            <div class="doc-name">${doc.name}</div>
            <div class="doc-prefix">${doc.prefix || 'Sem prefixo'}</div>
            <div class="doc-number">${formatNumber(doc)}</div>
            ${canReserve(doc.id) ?
            `<button class="reserve-btn" onclick="reserveNumber('${doc.id}')">Reservar Número</button>` :
            `<button class="reserve-btn" disabled style="opacity:0.5">🔒 Sem Permissão</button>`
        }
        </div>
    `).join('');
}

// Formatar número
function formatNumber(doc) {
    const year = new Date().getFullYear();
    const number = String(doc.currentNumber).padStart(3, '0');
    return doc.prefix ? `${doc.prefix} ${number}/${year}` : `${number}/${year}`;
}

// Reservar número
function reserveNumber(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc || !canReserve(docId)) return;

    // Abrir modal de assunto e ementa
    showSubjectEmentaModal((data) => {
        if (!data) return; // Cancelado

        // Modal de confirmação customizado
        const nextNumber = formatNumber(doc);
        const confirmMessage = `Deseja realmente reservar o número?\n\nDocumento: ${doc.name}\nNúmero: ${nextNumber}\nAssunto: ${data.subject}\n\nEmenta:\n${data.ementa}`;

        showConfirmModal(
            '⚠️ Confirmação de Reserva',
            confirmMessage,
            () => {
                // Confirmado - reservar número
                const reservation = {
                    id: generateId(),
                    docId: doc.id,
                    docName: doc.name,
                    number: doc.currentNumber,
                    formattedNumber: formatNumber(doc),
                    subject: data.subject,
                    ementa: data.ementa,
                    userId: state.currentUser.id,
                    userName: state.currentUser.name,
                    userCargo: state.currentUser.cargo || '',
                    userSetor: state.currentUser.setor || '',
                    userSecretaria: state.currentUser.secretaria || '',
                    timestamp: new Date().toISOString()
                };

                doc.currentNumber++;
                state.reservations.unshift(reservation);

                saveData();
                addLog('reserva', `Reservou ${doc.name}`, `Número: ${reservation.formattedNumber} - Assunto: ${data.subject}`);

                renderDocuments();
                renderHistory();
                if (state.currentUser.role === 'admin') {
                    renderAdminDocs();
                    updateStats();
                }

                // Modal de sucesso
                showAlertModal('✅ Sucesso!', `Número reservado com sucesso!\n\n${reservation.formattedNumber}\nAssunto: ${data.subject}`);
            }
        );
    });
}

// Mostrar modal de assunto e ementa
function showSubjectEmentaModal(callback) {
    const modal = document.getElementById('subjectEmentaModal');
    const subjectInput = document.getElementById('reservationSubject');
    const ementaInput = document.getElementById('reservationEmenta');
    const ementaCounter = document.getElementById('ementaCounter');
    const cancelBtn = document.getElementById('cancelSubjectBtn');
    const continueBtn = document.getElementById('continueSubjectBtn');

    // Limpar campos
    subjectInput.value = '';
    ementaInput.value = '';
    ementaCounter.textContent = '0';
    ementaCounter.parentElement.classList.remove('warning', 'limit');

    // Mostrar modal
    modal.classList.add('active');
    subjectInput.focus();

    // Atualizar contador de caracteres
    function updateCounter() {
        const length = ementaInput.value.length;
        ementaCounter.textContent = length;

        const counterEl = ementaCounter.parentElement;
        counterEl.classList.remove('warning', 'limit');

        if (length > 250) {
            counterEl.classList.add('warning');
        }
        if (length >= 290) {
            counterEl.classList.add('limit');
        }
    }

    ementaInput.addEventListener('input', updateCounter);

    // Validar e continuar
    function handleContinue() {
        const subject = subjectInput.value.trim();
        const ementa = ementaInput.value.trim();

        if (!subject) {
            showAlertModal('⚠️ Atenção', 'Por favor, preencha o assunto do documento.');
            subjectInput.focus();
            return;
        }

        if (!ementa) {
            showAlertModal('⚠️ Atenção', 'Por favor, preencha a ementa do documento.');
            ementaInput.focus();
            return;
        }

        if (ementa.length > 300) {
            showAlertModal('⚠️ Atenção', 'A ementa não pode ter mais de 300 caracteres.');
            ementaInput.focus();
            return;
        }

        // Fechar modal e retornar dados
        modal.classList.remove('active');
        cleanup();
        callback({ subject, ementa });
    }

    // Cancelar
    function handleCancel() {
        modal.classList.remove('active');
        cleanup();
        callback(null);
    }

    // Cleanup
    function cleanup() {
        ementaInput.removeEventListener('input', updateCounter);
        cancelBtn.removeEventListener('click', handleCancel);
        continueBtn.removeEventListener('click', handleContinue);
        modal.removeEventListener('click', handleModalClick);
    }

    // Click fora do modal fecha
    function handleModalClick(e) {
        if (e.target === modal) {
            handleCancel();
        }
    }

    // Event listeners
    cancelBtn.addEventListener('click', handleCancel);
    continueBtn.addEventListener('click', handleContinue);
    modal.addEventListener('click', handleModalClick);

    // Enter no subject vai para ementa, Enter na ementa submete
    subjectInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            ementaInput.focus();
        }
    });
}

// Renderizar histórico
function renderHistory() {
    const container = document.getElementById('historyList');
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';

    let filtered = state.reservations.filter(r =>
        r.docName.toLowerCase().includes(search) ||
        r.formattedNumber.toLowerCase().includes(search) ||
        r.userName.toLowerCase().includes(search) ||
        (r.userCargo && r.userCargo.toLowerCase().includes(search)) ||
        (r.userSetor && r.userSetor.toLowerCase().includes(search)) ||
        (r.userSecretaria && r.userSecretaria.toLowerCase().includes(search)) ||
        (r.subject && r.subject.toLowerCase().includes(search)) ||
        (r.ementa && r.ementa.toLowerCase().includes(search))
    );

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhuma reserva encontrada.</p>';
        return;
    }

    container.innerHTML = filtered.slice(0, 50).map(r => {
        const date = new Date(r.timestamp);
        const ementa = r.ementa || 'Sem ementa cadastrada';
        const cargo = r.userCargo || 'N/A';
        const setor = r.userSetor || 'N/A';
        const secretaria = r.userSecretaria || 'N/A';

        return `
            <div class="history-item-detailed">
                <div class="history-header">
                    <div class="history-doc-type">
                        <span class="doc-icon">📄</span>
                        <span>${r.docName}</span>
                    </div>
                    <div class="history-datetime">
                        ${formatDate(date)} ${formatTime(date)}
                    </div>
                </div>
                
                <div class="history-body">
                    <div class="history-subject">
                        <strong>Assunto:</strong> ${r.subject || 'Não informado'}
                    </div>
                    <div class="history-number-box">
                        <strong>Número:</strong> <span class="highlight-number">${r.formattedNumber}</span>
                    </div>
                </div>
                
                <div class="history-ementa">
                    <strong>Ementa:</strong>
                    <p>${ementa}</p>
                </div>
                
                <div class="history-user-info">
                    <span class="user-icon">👤</span>
                    <div class="user-details">
                        <div class="user-name">${r.userName}</div>
                        <div class="user-position">${cargo} - ${setor}</div>
                        <div class="user-dept">${secretaria}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Renderizar documentos admin
function renderAdminDocs() {
    const container = document.getElementById('adminDocsList');
    container.innerHTML = state.documents.map(doc => `
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

// Renderizar usuários admin
function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');
    const search = document.getElementById('usersSearch')?.value.toLowerCase() || '';

    // Filtrar usuários pela busca
    let filteredUsers = state.users;
    if (search) {
        filteredUsers = state.users.filter(user =>
            user.name.toLowerCase().includes(search) ||
            user.username.toLowerCase().includes(search) ||
            (user.cargo && user.cargo.toLowerCase().includes(search)) ||
            (user.setor && user.setor.toLowerCase().includes(search)) ||
            (user.secretaria && user.secretaria.toLowerCase().includes(search)) ||
            PERMISSION_LEVELS[user.role]?.label.toLowerCase().includes(search)
        );
    }

    // Mostrar mensagem se não houver resultados
    if (filteredUsers.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum usuário encontrado.</p>';
        return;
    }

    container.innerHTML = filteredUsers.map(user => {
        const permLabel = PERMISSION_LEVELS[user.role]?.label || user.role;
        const permIcon = user.role === 'admin' ? '🔑' : user.role === 'user_readonly' ? '👁️' : '👤';

        return `
            <div class="admin-doc-item">
                <div class="admin-doc-info">
                    <div class="admin-doc-name">${user.name} ${user.id === state.currentUser.id ? '(Você)' : ''}</div>
                    <div class="admin-doc-details">
                        usuário: ${user.username} | 
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

// Renderizar logs
function renderLogs() {
    const container = document.getElementById('logsList');
    const search = document.getElementById('logsSearch')?.value.toLowerCase() || '';
    const filter = state.currentLogFilter || 'todos';

    // Combinar reservas e logs de sistema
    let allItems = [];

    // Adicionar reservas como tipo 'reserva'
    state.reservations.forEach(r => {
        allItems.push({
            ...r,
            logType: 'reserva',
            timestamp: r.timestamp
        });
    });

    // Adicionar logs de sistema
    state.logs.forEach(log => {
        allItems.push({
            ...log,
            logType: log.type // 'sistema', 'usuario', 'documento', etc
        });
    });

    // Ordenar por data (mais recente primeiro)
    allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Aplicar filtro por tipo
    if (filter !== 'todos') {
        allItems = allItems.filter(item => item.logType === filter);
    }

    // Aplicar busca textual
    if (search) {
        allItems = allItems.filter(item => {
            // Buscar em reservas
            if (item.logType === 'reserva') {
                return item.docName?.toLowerCase().includes(search) ||
                    item.formattedNumber?.toLowerCase().includes(search) ||
                    item.userName?.toLowerCase().includes(search) ||
                    (item.userCargo && item.userCargo.toLowerCase().includes(search)) ||
                    (item.userSetor && item.userSetor.toLowerCase().includes(search)) ||
                    (item.userSecretaria && item.userSecretaria.toLowerCase().includes(search)) ||
                    (item.subject && item.subject.toLowerCase().includes(search)) ||
                    (item.ementa && item.ementa.toLowerCase().includes(search));
            }
            // Buscar em logs de sistema
            else {
                return item.action?.toLowerCase().includes(search) ||
                    item.details?.toLowerCase().includes(search) ||
                    item.userName?.toLowerCase().includes(search);
            }
        });
    }

    if (allItems.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum log encontrado.</p>';
        return;
    }

    // Renderizar items
    container.innerHTML = allItems.map(item => {
        if (item.logType === 'reserva') {
            // Renderizar reserva
            const date = new Date(item.timestamp);
            const ementa = item.ementa || 'Sem ementa cadastrada';
            const cargo = item.userCargo || 'N/A';
            const setor = item.userSetor || 'N/A';
            const secretaria = item.userSecretaria || 'N/A';

            return `
                <div class="history-item-detailed">
                    <div class="history-header">
                        <div class="history-doc-type">
                            <span class="doc-icon">📄</span>
                            <span>${item.docName}</span>
                            <span class="log-badge log-badge-reserva">RESERVA</span>
                        </div>
                        <div class="history-datetime">
                            ${formatDate(date)} ${formatTime(date)}
                        </div>
                    </div>
                    
                    <div class="history-body">
                        <div class="history-subject">
                            <strong>Assunto:</strong> ${item.subject || 'Não informado'}
                        </div>
                        <div class="history-number-box">
                            <strong>Número:</strong> <span class="highlight-number">${item.formattedNumber}</span>
                        </div>
                    </div>
                    
                    <div class="history-ementa">
                        <strong>Ementa:</strong>
                        <p>${ementa}</p>
                    </div>
                    
                    <div class="history-user-info">
                        <span class="user-icon">👤</span>
                        <div class="user-details">
                            <div class="user-name">${item.userName}</div>
                            <div class="user-position">${cargo} - ${setor}</div>
                            <div class="user-dept">${secretaria}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Renderizar log de sistema
            const date = new Date(item.timestamp);
            const iconMap = {
                'sistema': '⚙️',
                'usuario': '👤',
                'documento': '📄'
            };
            const icon = iconMap[item.logType] || '📝';

            const badgeClass = `log-badge log-badge-${item.logType}`;

            return `
                <div class="log-item">
                    <div class="log-header">
                        <div class="log-type">
                            <span class="log-icon">${icon}</span>
                            <span class="log-badge ${badgeClass}">${item.logType.toUpperCase()}</span>
                        </div>
                        <div class="log-datetime">
                            ${formatDate(date)} ${formatTime(date)}
                        </div>
                    </div>
                    <div class="log-body">
                        <div class="log-action"><strong>${item.action}</strong></div>
                        <div class="log-details">${item.details}</div>
                        <div class="log-user">👤 ${item.userName}</div>
                    </div>
                </div>
            `;
        }
    }).join('');
}

// Filtrar logs
function filterLogs(type) {
    state.currentLogFilter = type;
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Adicionar active no botão clicado
    event.target.classList.add('active');

    // Aplicar o filtro real
    renderLogs();
}

// Estatísticas
function updateStats() {
    document.getElementById('totalDocTypes').textContent = state.documents.length;
    document.getElementById('totalReservations').textContent = state.reservations.length;
    document.getElementById('totalUsers').textContent = state.users.length;

    const today = new Date().toISOString().split('T')[0];
    const todayCount = state.reservations.filter(r => r.timestamp.startsWith(today)).length;
    document.getElementById('todayReservations').textContent = todayCount;
}

// Navegação Admin
function showAdminSection(section) {
    // Esconder todos
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    const navSection = document.querySelector('.nav-section');
    if (navSection) navSection.style.display = 'none';

    // Mostrar seção específica
    const sectionEl = document.getElementById(`adminSection${section.charAt(0).toUpperCase() + section.slice(1)}`);
    if (sectionEl) {
        sectionEl.style.display = 'block';

        // Renderizar conteúdo
        if (section === 'documentos') renderAdminDocs();
        if (section === 'usuarios') {
            renderAdminUsers();
            renderDocCheckboxes();
        }
        if (section === 'logs') renderLogs();
    }
}

function hideAdminSections() {
    document.querySelectorAll('.admin-section').forEach(el => {
        el.style.display = 'none';
        // Fechar formulários abertos
        const docForm = document.getElementById('docFormInline');
        const userForm = document.getElementById('userFormInline');
        if (docForm) docForm.style.display = 'none';
        if (userForm) userForm.style.display = 'none';
    });
    const navSection = document.querySelector('.nav-section');
    if (navSection) navSection.style.display = 'block';
}

// Modals - Documento (INLINE)
function toggleDocForm() {
    const form = document.getElementById('docFormInline');
    const isVisible = form.style.display !== 'none';

    if (isVisible) {
        form.style.display = 'none';
        state.editingDocId = null;
    } else {
        form.style.display = 'block';
        document.getElementById('docFormTitle').textContent = 'Adicionar Documento';
        document.getElementById('docForm').reset();
        document.getElementById('docEnabled').checked = true;
    }
}

function openEditDocModal(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;

    state.editingDocId = docId;
    document.getElementById('docFormTitle').textContent = 'Editar Documento';
    document.getElementById('docName').value = doc.name;
    document.getElementById('docPrefix').value = doc.prefix || '';
    document.getElementById('startNumber').value = doc.startNumber;
    document.getElementById('yearlyReset').checked = doc.yearlyReset;
    document.getElementById('docEnabled').checked = doc.enabled;
    document.getElementById('docFormInline').style.display = 'block';

    // Scroll to form
    document.getElementById('docFormInline').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        addLog('documento', 'Editou documento', `${doc.name} foi modificado`);
    } else {
        state.documents.push({
            id: generateId(),
            ...formData,
            currentNumber: formData.startNumber,
            lastResetYear: new Date().getFullYear()
        });
        addLog('documento', 'Criou documento', `Novo tipo: ${formData.name}`);
    }

    saveData();
    renderAdminDocs();
    renderDocuments();
    updateStats();
    toggleDocForm(); // Fecha o formulário inline
}

function toggleDocStatus(docId) {
    const doc = state.documents.find(d => d.id === docId);
    doc.enabled = !doc.enabled;
    saveData();
    addLog('documento', `${doc.enabled ? 'Habilitou' : 'Desabilitou'} documento`, doc.name);
    renderAdminDocs();
    renderDocuments();
}

function deleteDocument(docId) {
    const doc = state.documents.find(d => d.id === docId);
    showConfirmModal(
        '⚠️ Confirmar Exclusão',
        `Tem certeza que deseja excluir o documento "${doc.name}"?`,
        () => {
            state.documents = state.documents.filter(d => d.id !== docId);
            saveData();
            addLog('documento', 'Excluiu documento', `Tipo ${doc.name} foi removido`);
            renderAdminDocs();
            renderDocuments();
            updateStats();
        }
    );
}

// Modals - Usuário (INLINE)
function toggleUserForm() {
    const form = document.getElementById('userFormInline');
    const isVisible = form.style.display !== 'none';

    if (isVisible) {
        form.style.display = 'none';
        state.editingUserId = null;
    } else {
        form.style.display = 'block';
        document.getElementById('userFormTitle').textContent = 'Adicionar Usuário';
        document.getElementById('userForm').reset();
        document.getElementById('userRole').value = 'user_restricted';
        handleRoleChange();
    }
}

function openEditUserModal(userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    state.editingUserId = userId;
    document.getElementById('userFormTitle').textContent = 'Editar Usuário';
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

    document.getElementById('userFormInline').style.display = 'block';

    // Scroll to form
    document.getElementById('userFormInline').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const container = document.querySelector('#userFormInline #documentsList');
    if (!container) return;

    container.innerHTML = state.documents
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(doc => `
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
    const secretaria = document.getElementById('userSecretaria').value;
    let allowedDocuments = [];

    if (role === 'user_restricted' || role === 'user_readonly') {
        // Herdar documentos da secretaria se estiver criando novo usuário
        if (!state.editingUserId) {
            const secretariaDocs = state.secretariaPermissions[secretaria] || [];
            allowedDocuments = [...secretariaDocs]; // Copiar documentos da secretaria
        }

        // Adicionar documentos manualmente selecionados
        const manuallySelected = Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.value);

        // Combinar e remover duplicatas
        if (!state.editingUserId) {
            // Novo usuário: usar secretaria + selecionados manualmente
            allowedDocuments = [...new Set([...allowedDocuments, ...manuallySelected])];
        } else {
            // Editando: usar apenas selecionados manualmente
            allowedDocuments = manuallySelected;
        }

        if (allowedDocuments.length === 0) {
            showAlertModal('⚠️ Aviso', 'Selecione pelo menos um documento!');
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
        showAlertModal('⚠️ Aviso', 'Este nome de usuário já existe!');
        return;
    }

    if (state.editingUserId) {
        const user = state.users.find(u => u.id === state.editingUserId);
        Object.assign(user, formData);
        addLog('usuario', 'Editou usuário', `${formData.name} - ${formData.cargo}`);
    } else {
        state.users.push({
            id: generateId(),
            ...formData,
            createdAt: new Date().toISOString()
        });
        addLog('usuario', 'Criou usuário', `${formData.name} - ${formData.cargo}`);
    }

    saveUsers();
    renderAdminUsers();
    updateStats();
    toggleUserForm(); // Fecha o formulário inline
}

function deleteUser(userId) {
    const user = state.users.find(u => u.id === userId);
    showConfirmModal(
        '⚠️ Confirmar Exclusão',
        `Tem certeza que deseja excluir o usuário "${user.name}"?`,
        () => {
            state.users = state.users.filter(u => u.id !== userId);
            saveUsers();
            addLog('usuario', 'Excluiu usuário', `${user.name} foi removido`);
            renderAdminUsers();
            updateStats();
        }
    );
}

// Configuração de Secretarias
const SECRETARIAS = [
    "Controle Interno",
    "Gabinete",
    "Procuradoria",
    "Secretaria de Administração",
    "Secretaria de Agricultura e Meio Ambiente",
    "Secretaria de Cultura e Turismo",
    "Secretaria de Desenvolvimento Econômico e Gestão Institucional",
    "Secretaria de Desenvolvimento Social",
    "Secretaria de Educação",
    "Secretaria de Esporte",
    "Secretaria de Fazenda",
    "Secretaria da Saúde",
    "Secretaria de Serviços Urbanos"
];

function toggleSecretariaConfig() {
    const area = document.getElementById('secretariaConfigArea');
    const userForm = document.getElementById('userFormInline');
    const isVisible = area.style.display !== 'none';

    if (isVisible) {
        area.style.display = 'none';
    } else {
        // Fechar formulário de usuário se estiver aberto
        userForm.style.display = 'none';
        area.style.display = 'block';
        renderSecretariaConfig();
        // Scroll to form
        area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function renderSecretariaConfig() {
    const container = document.getElementById('secretariaConfigList');

    container.innerHTML = `
        <div class="secretaria-selector">
            <label for="secretariaSelect"><strong>Selecione a Secretaria:</strong></label>
            <select id="secretariaSelect" onchange="renderSecretariaDocuments()">
                <option value="">-- Escolha uma secretaria --</option>
                ${SECRETARIAS.map(sec => `<option value="${sec}">${sec}</option>`).join('')}
            </select>
        </div>
        <div id="secretariaDocumentsArea" style="display: none;">
            <h4 id="selectedSecretariaName"></h4>
            <div id="secretariaDocumentsGrid" class="secretaria-docs-grid"></div>
        </div>
    `;
}

function renderSecretariaDocuments() {
    const select = document.getElementById('secretariaSelect');
    const selectedSecretaria = select.value;
    const documentsArea = document.getElementById('secretariaDocumentsArea');
    const documentsGrid = document.getElementById('secretariaDocumentsGrid');
    const nameDisplay = document.getElementById('selectedSecretariaName');

    if (!selectedSecretaria) {
        documentsArea.style.display = 'none';
        return;
    }

    // Mostrar área de documentos
    documentsArea.style.display = 'block';
    nameDisplay.textContent = selectedSecretaria;

    // Obter configurações já salvas (novo formato)
    const secretariaConfigs = state.secretariaPermissions[selectedSecretaria] || {};

    // Renderizar cards de configuração
    documentsGrid.innerHTML = state.documents.filter(d => d.enabled).map(doc => {
        // Buscar configuração existente ou usar padrões do documento
        const config = secretariaConfigs[doc.id] || {
            enabled: false,
            startNumber: doc.startNumber,
            yearlyReset: doc.yearlyReset
        };

        return `
            <div class="document-config-card">
                <div class="doc-config-header">
                    <label class="checkbox-label">
                        <input type="checkbox" 
                               class="secretaria-doc-checkbox" 
                               data-doc-id="${doc.id}"
                               data-secretaria="${selectedSecretaria}"
                               ${config.enabled ? 'checked' : ''}
                               onchange="toggleDocConfig('${doc.id}')">
                        <span><strong>${doc.name}</strong> ${doc.prefix ? '(' + doc.prefix + ')' : ''}</span>
                    </label>
                </div>
                <div class="doc-config-inputs" id="config-${doc.id}" style="display: ${config.enabled ? 'block' : 'none'};">
                    <div class="config-row">
                        <label>Número Inicial:</label>
                        <input type="number" 
                               class="config-start-number" 
                               data-doc-id="${doc.id}"
                               value="${config.startNumber}" 
                               min="1">
                    </div>
                    <div class="config-row">
                        <label class="checkbox-label">
                            <input type="checkbox" 
                                   class="config-yearly-reset" 
                                   data-doc-id="${doc.id}"
                                   ${config.yearlyReset ? 'checked' : ''}>
                            <span>Reset Anual</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Alternar visibilidade das configurações do documento
function toggleDocConfig(docId) {
    const configArea = document.getElementById(`config-${docId}`);
    const checkbox = document.querySelector(`.secretaria-doc-checkbox[data-doc-id="${docId}"]`);

    if (checkbox.checked) {
        configArea.style.display = 'block';
    } else {
        configArea.style.display = 'none';
    }
}

function saveSecretariaConfig() {
    const select = document.getElementById('secretariaSelect');
    const selectedSecretaria = select.value;

    if (!selectedSecretaria) {
        showAlertModal('⚠️ Aviso', 'Selecione uma secretaria para configurar!');
        return;
    }

    // Inicializar configurações da secretaria
    state.secretariaPermissions[selectedSecretaria] = {};

    // Cole tar todos os documentos marcados
    const checkboxes = document.querySelectorAll('.secretaria-doc-checkbox:checked');

    checkboxes.forEach(checkbox => {
        const docId = checkbox.getAttribute('data-doc-id');

        // Buscar valores dos inputs de configuração
        const startNumberInput = document.querySelector(`.config-start-number[data-doc-id="${docId}"]`);
        const yearlyResetInput = document.querySelector(`.config-yearly-reset[data-doc-id="${docId}"]`);

        // Salvar configuração completa
        state.secretariaPermissions[selectedSecretaria][docId] = {
            enabled: true,
            startNumber: parseInt(startNumberInput.value) || 1,
            yearlyReset: yearlyResetInput.checked
        };
    });

    saveSecretariaPermissions();
    addLog('sistema', 'Atualizou permissões de secretaria', `Configurações da ${selectedSecretaria} foram atualizadas`);

    showAlertModal('✅ Sucesso!', `Configurações da ${selectedSecretaria} salvas com sucesso!`);

    // Limpar seleção e resetar dropdown
    select.value = '';
    document.getElementById('secretariaDocumentsArea').style.display = 'none';
}

// Utilitários
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(date) {
    return date.toLocaleDateString('pt-BR');
}

function formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Custom Modal Functions
function showConfirmModal(title, message, onConfirm, onCancel) {
    const overlay = document.getElementById('customConfirmModal');
    document.getElementById('confirmModalTitle').innerHTML = title;
    document.getElementById('confirmModalMessage').textContent = message;

    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    // Remove event listeners antigos
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // Adicionar novos event listeners
    document.getElementById('confirmBtn').addEventListener('click', () => {
        hideCustomModal();
        if (onConfirm) onConfirm();
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
        hideCustomModal();
        if (onCancel) onCancel();
    });

    overlay.classList.add('active');
}

function showAlertModal(title, message, onOk) {
    const overlay = document.getElementById('customAlertModal');
    document.getElementById('alertModalTitle').innerHTML = title;
    document.getElementById('alertModalMessage').textContent = message;

    const okBtn = document.getElementById('alertOkBtn');

    // Remove event listener antigo
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    // Adicionar novo event listener
    document.getElementById('alertOkBtn').addEventListener('click', () => {
        hideCustomModal();
        if (onOk) onOk();
    });

    overlay.classList.add('active');
}

function hideCustomModal() {
    document.getElementById('customConfirmModal')?.classList.remove('active');
    document.getElementById('customAlertModal')?.classList.remove('active');
}

// Exportar/Importar Dados
function exportData() {
    const dataToExport = {
        documents: state.documents,
        reservations: state.reservations,
        users: state.users,
        logs: state.logs,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };

    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-numeracao-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addLog('cadastro', 'Exportou dados do sistema', `${state.documents.length} documentos, ${state.reservations.length} reservas`);
    showAlertModal('✅ Sucesso!', 'Dados exportados com sucesso!\n\nO arquivo foi baixado para a pasta de Downloads.');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);

                // Validar estrutura
                if (!importedData.documents || !importedData.reservations || !importedData.users) {
                    showAlertModal('❌ Erro', 'Arquivo inválido! O backup não contém os dados necessários.');
                    return;
                }

                showConfirmModal(
                    '⚠️ Confirmar Importação',
                    `Tem certeza que deseja importar os dados?\n\nEsta ação irá SUBSTITUIR todos os dados atuais:\n• ${importedData.documents.length} documentos\n• ${importedData.reservations.length} reservas\n• ${importedData.users.length} usuários\n• ${importedData.logs?.length || 0} logs\n\nBackup de: ${new Date(importedData.exportDate).toLocaleString('pt-BR')}`,
                    () => {
                        // Importar dados
                        state.documents = importedData.documents;
                        state.reservations = importedData.reservations;
                        state.users = importedData.users;
                        state.logs = importedData.logs || [];

                        // Salvar no localStorage
                        saveData();
                        saveUsers();
                        saveLogs();

                        // Verificar se usuário atual ainda existe
                        const currentUserExists = state.users.find(u => u.id === state.currentUser.id);
                        if (!currentUserExists) {
                            showAlertModal('⚠️ Atenção', 'Seu usuário não existe nos dados importados.\n\nVocê será desconectado.', () => {
                                handleLogout();
                            });
                        } else {
                            // Atualizar interface
                            renderDocuments();
                            renderHistory();
                            if (state.currentUser.role === 'admin') {
                                renderAdminDocs();
                                renderAdminUsers();
                                renderLogs();
                                updateStats();
                            }

                            addLog('cadastro', 'Importou dados do sistema', `${importedData.documents.length} documentos, ${importedData.reservations.length} reservas`);
                            showAlertModal('✅ Sucesso!', 'Dados importados com sucesso!\n\nO sistema foi atualizado.');
                        }
                    }
                );
            } catch (error) {
                showAlertModal('❌ Erro', 'Erro ao importar arquivo!\n\nVerifique se o arquivo é um backup válido.');
                console.error('Erro ao importar:', error);
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

// ========== FUNÇÕES DE EXPORTAÇÃO DE HISTÓRICO ==========

// Obter logs filtrados
function getFilteredLogs() {
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

    return filtered;
}

// Exportar para PDF
function exportHistoryToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const logs = getFilteredLogs();

    if (logs.length === 0) {
        showAlertModal('⚠️ Atenção', 'Nenhum registro para exportar!');
        return;
    }

    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Histórico do Sistema', 14, 20);

    // Data de geração
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Gerado em: ${formatDate(new Date())} às ${formatTime(new Date())}`, 14, 28);
    doc.text(`Total de registros: ${logs.length}`, 14, 34);

    // Filtro aplicado
    const filterText = state.currentLogFilter === 'todos' ? 'Todos' :
        state.currentLogFilter === 'cadastro' ? 'Cadastros' : 'Reservas';
    doc.text(`Filtro: ${filterText}`, 14, 40);

    // Tabela
    const tableData = logs.map(log => {
        const date = new Date(log.timestamp);
        return [
            formatDate(date) + ' ' + formatTime(date),
            log.userName,
            log.action,
            log.details || '-'
        ];
    });

    doc.autoTable({
        startY: 48,
        head: [['Data/Hora', 'Usuário', 'Ação', 'Detalhes']],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { top: 48 }
    });

    // Salvar arquivo
    const filename = `historico_${new Date().getTime()}.pdf`;
    doc.save(filename);

    showAlertModal('✅ Sucesso!', `Arquivo ${filename} exportado com sucesso!`);
    addLog('sistema', 'Exportou histórico em PDF', `${logs.length} registros exportados`);
}

// Exportar para Excel
function exportHistoryToExcel() {
    const logs = getFilteredLogs();

    if (logs.length === 0) {
        showAlertModal('⚠️ Atenção', 'Nenhum registro para exportar!');
        return;
    }

    // Preparar dados
    const data = logs.map(log => {
        const date = new Date(log.timestamp);
        return {
            'Data': formatDate(date),
            'Hora': formatTime(date),
            'Usuário': log.userName,
            'Tipo': log.type === 'cadastro' ? 'Cadastro' : 'Reserva',
            'Ação': log.action,
            'Detalhes': log.details || ''
        };
    });

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Ajustar largura das colunas
    ws['!cols'] = [
        { wch: 12 },  // Data
        { wch: 10 },  // Hora
        { wch: 20 },  // Usuário
        { wch: 10 },  // Tipo
        { wch: 30 },  // Ação
        { wch: 50 }   // Detalhes
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Histórico');

    // Salvar arquivo
    const filename = `historico_${new Date().getTime()}.xlsx`;
    XLSX.writeFile(wb, filename);

    showAlertModal('✅ Sucesso!', `Arquivo ${filename} exportado com sucesso!`);
    addLog('sistema', 'Exportou histórico em Excel', `${logs.length} registros exportados`);
}

// Exportar para Word (HTML compatível)
function exportHistoryToWord() {
    const logs = getFilteredLogs();

    if (logs.length === 0) {
        showAlertModal('⚠️ Atenção', 'Nenhum registro para exportar!');
        return;
    }

    // Criar HTML formatado
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
                .info { margin: 20px 0; color: #666; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #2563eb; color: white; padding: 12px; text-align: left; }
                td { padding: 10px; border-bottom: 1px solid #ddd; }
                tr:nth-child(even) { background: #f8fafc; }
                .cadastro { color: #3b82f6; }
                .reserva { color: #10b981; }
            </style>
        </head>
        <body>
            <h1>📊 Histórico do Sistema</h1>
            <div class="info">
                <p><strong>Gerado em:</strong> ${formatDate(new Date())} às ${formatTime(new Date())}</p>
                <p><strong>Total de registros:</strong> ${logs.length}</p>
                <p><strong>Filtro:</strong> ${state.currentLogFilter === 'todos' ? 'Todos' :
            state.currentLogFilter === 'cadastro' ? 'Cadastros' : 'Reservas'}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Data/Hora</th>
                        <th>Usuário</th>
                        <th>Tipo</th>
                        <th>Ação</th>
                        <th>Detalhes</th>
                    </tr>
                </thead>
                <tbody>
    `;

    logs.forEach(log => {
        const date = new Date(log.timestamp);
        const typeClass = log.type === 'cadastro' ? 'cadastro' : 'reserva';
        const typeLabel = log.type === 'cadastro' ? 'Cadastro' : 'Reserva';

        html += `
            <tr>
                <td>${formatDate(date)} ${formatTime(date)}</td>
                <td>${log.userName}</td>
                <td class="${typeClass}">${typeLabel}</td>
                <td>${log.action}</td>
                <td>${log.details || '-'}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </body>
        </html>
    `;

    // Criar blob e baixar
    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const filename = `historico_${new Date().getTime()}.doc`;
    saveAs(blob, filename);

    showAlertModal('✅ Sucesso!', `Arquivo ${filename} exportado com sucesso!`);
    addLog('sistema', 'Exportou histórico em Word', `${logs.length} registros exportados`);
}

// ========== SISTEMA DE ZOOM DE FONTE ==========
let fontZoomLevel = parseInt(localStorage.getItem('fontZoomLevel')) || 100;

function applyFontZoom() {
    const root = document.documentElement;
    const scale = fontZoomLevel / 100;

    // Aplicar escala nas variáveis CSS
    root.style.setProperty('--font-small', `${0.875 * scale}rem`);
    root.style.setProperty('--font-normal', `${1 * scale}rem`);
    root.style.setProperty('--font-datetime', `${0.875 * scale}rem`);
    root.style.setProperty('--font-number', `${1.25 * scale}rem`);
    root.style.setProperty('--font-icon-user', `${1.5 * scale}rem`);

    // Atualizar indicador
    const indicator = document.getElementById('fontZoomIndicator');
    if (indicator) {
        indicator.textContent = `${fontZoomLevel}%`;
    }

    // Salvar preferência
    localStorage.setItem('fontZoomLevel', fontZoomLevel);
}

function increaseFontZoom() {
    if (fontZoomLevel < 150) {
        fontZoomLevel += 10;
        applyFontZoom();
    }
}

function decreaseFontZoom() {
    if (fontZoomLevel > 70) {
        fontZoomLevel -= 10;
        applyFontZoom();
    }
}

function resetFontZoom() {
    fontZoomLevel = 100;
    applyFontZoom();
}

// Aplicar zoom ao carregar
document.addEventListener('DOMContentLoaded', () => {
    applyFontZoom();
});

// ========== ESTATÍSTICAS POR DOCUMENTO ==========
function toggleDocStats() {
    const panel = document.getElementById('docStatsPanel');
    const btn = event.target.closest('.export-stats');

    if (panel.style.display === 'none') {
        // Mostrar painel
        panel.style.display = 'block';
        if (btn) btn.classList.add('active');

        // Renderizar estatísticas
        const container = document.getElementById('docStatsList');
        const docs = state.documents.filter(d => d.enabled);

        const stats = docs.map(doc => {
            const docReservations = state.reservations.filter(r => r.docId === doc.id);
            const lastReservation = docReservations.length > 0
                ? new Date(Math.max(...docReservations.map(r => new Date(r.timestamp))))
                : null;

            return {
                doc,
                count: docReservations.length,
                lastDate: lastReservation
            };
        }).filter(s => s.count > 0)
            .sort((a, b) => b.count - a.count);

        if (stats.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum documento possui reservas</p>';
            return;
        }

        container.innerHTML = stats.map(({ doc, count, lastDate }) => `
            <div class="doc-stat-card">
                <div class="doc-stat-header">
                    <span class="doc-stat-icon">📄</span>
                    <span class="doc-stat-name">${doc.name}</span>
                </div>
                <div class="doc-stat-body">
                    <div class="doc-stat-item">
                        <span class="doc-stat-label">Reservas</span>
                        <span class="doc-stat-value">${count}</span>
                    </div>
                    <div class="doc-stat-item">
                        <span class="doc-stat-label">Última Reserva</span>
                        <span class="doc-stat-value">${formatDate(lastDate)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        // Esconder painel
        panel.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

// Cache buster: 20260112200732
