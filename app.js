// Sistema de Numeração de Documentos - Versão Simplificada e Completa
// Com: Campos expandidos, 4 níveis de permissão, seleção de documentos, logs

// Configuração do Supabase
const SUPABASE_URL = 'https://uxdjhdnsnditivvjktzf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VAfgn59xk4fN4e3gPSMmLg_OXx6xAjf';
var supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let state = {
    documents: [],
    reservations: [],
    users: [],
    logs: [],
    // secretariaPermissions agora será derivada dos atributos dos usuários ou tabela dedicada se necessário.
    // Para simplificar a migração com o schema atual, vamos assumir que 'allowed_documents' no usuário resolve,
    // ou manteremos secretariaPermissions apenas em memória se não persistirmos.
    // O schema.sql não tem tabela 'secretaria_permissions', então vamos focar no 'allowed_documents' do usuário.
    secretariaPermissions: {},
    currentUser: null,
    currentView: 'login',
    editingDocId: null,
    editingUserId: null,
    currentLogFilter: 'todos',
    currentLogFilter: 'todos',
    loading: false,
    secretariats: ['Gabinete', 'Administração', 'Finanças', 'Saúde', 'Educação', 'Obras'] // Default list
};



// Níveis de permissão
const PERMISSION_LEVELS = {
    admin: { label: 'Administrador', desc: 'Acesso total' },
    user_full: { label: 'Usuário Completo', desc: 'Todos documentos' },
    user_restricted: { label: 'Usuário Restrito', desc: 'Documentos específicos' },
    user_readonly: { label: 'Somente Leitura', desc: 'Visualizar apenas' }
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('App iniciado');
        if (!window.supabase) {
            // throw new Error('Biblioteca Supabase não carregou!'); 
            // Tentar carregar fallback ou alertar
            console.error('Supabase global not found');
        }

        // Garantir init do cliente
        if (!supabase && window.supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }

        if (!supabase) throw new Error('Falha ao inicializar Supabase Client');

        await loadData();
        await checkAutoLogin();

    } catch (e) {
        console.error('Fatal Error:', e);
        document.body.innerHTML = `<div style="color:red; padding:20px;"><h1>Erro Fatal</h1><p>${e.message}</p></div>`;
    }
});

// Carregar dados do Supabase
async function loadData() {
    if (!supabase) {
        console.error('Supabase client not initialized');
        return;
    }

    try {
        state.loading = true;

        // 1. Carregar Documentos
        const { data: docs, error: errDocs } = await supabase
            .from('documents')
            .select('*')
            .order('name');

        if (errDocs) throw errDocs;

        // Mapeamento para formato do state (convert snake_case to camelCase)
        state.documents = docs.map(d => ({
            id: d.id,
            name: d.name,
            prefix: d.prefix,
            startNumber: d.start_number,
            currentNumber: d.current_number,
            yearlyReset: d.yearly_reset,
            lastResetYear: d.last_reset_year,
            enabled: d.enabled
        }));

        // Se não houver documentos, semear padrões
        if (state.documents.length === 0) {
            const defaultDocs = [
                { name: 'Ofício', prefix: 'Of.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Memorando', prefix: 'Mem.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Resolução', prefix: 'Res.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Contrato', prefix: 'Contr.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Decreto', prefix: 'Dec.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Portaria', prefix: 'Port.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Ata', prefix: '', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Edital', prefix: 'Ed.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Parecer', prefix: 'Par.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Circular', prefix: 'Circ.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Processo', prefix: 'Proc.', start_number: 1, current_number: 1, yearly_reset: false, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Protocolo', prefix: 'Prot.', start_number: 1000, current_number: 1000, yearly_reset: false, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Lei', prefix: 'L.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Lei Complementar', prefix: 'LC', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Medida Provisória', prefix: 'MP', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Instrução Normativa', prefix: 'IN', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Exposição de Motivos', prefix: 'EM', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Folha', prefix: 'fl.', start_number: 1, current_number: 1, yearly_reset: false, last_reset_year: new Date().getFullYear(), enabled: true }
            ];

            const { data: newDocs, error: seedError } = await supabase
                .from('documents')
                .insert(defaultDocs)
                .select();

            if (!seedError && newDocs) {
                state.documents = newDocs.map(d => ({
                    id: d.id,
                    name: d.name,
                    prefix: d.prefix,
                    startNumber: d.start_number,
                    currentNumber: d.current_number,
                    yearlyReset: d.yearly_reset,
                    lastResetYear: d.last_reset_year,
                    enabled: d.enabled
                }));
                addLog('sistema', 'Inicialização', 'Documentos padrão criados');
            }
        }

        // Reset anual (lógica mantida, mas precisa salvar no banco se mudar)
        await checkYearlyReset();

        // 1.1 Carregar Configurações (Secretarias)
        const { data: configs, error: errConfig } = await supabase
            .from('app_config')
            .select('*');

        if (!errConfig && configs) {
            const secConfig = configs.find(c => c.key === 'secretariaPermissions');
            if (secConfig) state.secretariaPermissions = secConfig.value;

            const secList = configs.find(c => c.key === 'secretaria_list');
            if (secList && Array.isArray(secList.value)) {
                state.secretariats = secList.value.sort();
            }
        }

        // 2. Carregar Usuários
        const { data: users, error: errUsers } = await supabase
            .from('users')
            .select('*');

        if (errUsers) throw errUsers;

        state.users = users.map(u => ({
            id: u.id,
            username: u.username,
            password: u.password,
            name: u.name,
            cargo: u.cargo,
            setor: u.setor,
            secretaria: u.secretaria,
            role: u.role,
            allowedDocuments: u.allowed_documents || [],
            createdAt: u.created_at
        }));

        // Se não houver usuários, criar admin padrão (apenas na primeira vez/migração)
        if (state.users.length === 0) {
            // Criar usuário admin localmente para permitir login inicial e salvar
            // Idealmente, você inseriria isso direto no banco ou teria um seed.
            const adminUser = {
                username: 'admin',
                password: 'admin123',
                name: 'Administrador',
                cargo: 'Administrador do Sistema',
                setor: 'TI',
                secretaria: 'Administrativa',
                role: 'admin',
                allowed_documents: []
            };

            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert([adminUser])
                .select()
                .single();

            if (!createError && newUser) {
                state.users.push({
                    ...newUser,
                    allowedDocuments: newUser.allowed_documents
                });
                addLog('usuario', 'Criou usuário inicial', 'Sistema criou admin padrão');
            }
        }

        // 3. Carregar Reservas
        const { data: reservations, error: errRes } = await supabase
            .from('reservations')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(1000); // Limite inicial para performance

        if (errRes) throw errRes;

        state.reservations = reservations.map(r => ({
            id: r.id,
            docId: r.doc_id,
            docName: r.doc_name,
            number: r.number,
            formattedNumber: r.formatted_number,
            subject: r.subject,
            ementa: r.ementa,
            userId: r.user_id,
            userName: r.user_name,
            userCargo: r.user_cargo,
            userSetor: r.user_setor,
            userSecretaria: r.user_secretaria,
            timestamp: r.timestamp
        }));

        // 4. Carregar Logs
        const { data: logs, error: errLogs } = await supabase
            .from('logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(500);

        if (errLogs) throw errLogs;

        state.logs = logs.map(l => ({
            id: l.id,
            type: l.type,
            action: l.action,
            details: l.details,
            userId: l.user_id,
            userName: l.user_name,
            timestamp: l.timestamp
        }));

        // Renderizar se a view estiver ativa
        if (typeof syncAllViews === 'function') syncAllViews();

    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert('Erro ao carregar dados do sistema. Verifique o console.');
    } finally {
        state.loading = false;
    }
}

// Funções de salvamento agora são específicas ou deprecadas em favor de chamadas diretas
// Mantendo as assinaturas para não quebrar chamadas existentes, mas elas não farão nada globalmente.
// As alterações de estado devem chamar o Supabase diretamente.

function saveData() {
    console.log('saveData: Operação global desativada. Use funções específicas do Supabase.');
    if (typeof syncAllViews === 'function') syncAllViews();
}

function saveUsers() {
    console.log('saveUsers: Operação global desativada.');
    if (typeof syncAllViews === 'function') syncAllViews();
}

function saveLogs() {
    console.log('saveLogs: Operação global desativada.');
}

function saveSecretariaPermissions() {
    console.log('saveSecretariaPermissions: Implementação pendente no Supabase.');
    // localStorage.setItem('secretariaPermissions', JSON.stringify(state.secretariaPermissions)); 
}

// Adicionar log (Async)
async function addLog(type, action, details) {
    // Atualizar estado local (otimista)
    const logItem = {
        type: type,
        action: action,
        details: details,
        user_id: state.currentUser?.id,
        user_name: state.currentUser?.name || 'Sistema',
        timestamp: new Date().toISOString()
    };

    // state.logs.unshift(logItem); // Atualizar via fetch é mais seguro para garantir IDs

    try {
        const { error } = await supabase
            .from('logs')
            .insert([logItem]);

        if (error) console.error('Erro ao salvar Log:', error);

        // Recarregar logs discretamente
        // Ou adicionar ao state local manualmente se tiver ID
    } catch (e) {
        console.error('Exceção ao salvar log:', e);
    }
}

// Reset anual
async function checkYearlyReset() {
    const currentYear = new Date().getFullYear();
    let hasChanges = false;

    // Iterar e atualizar documentos necessários
    for (const doc of state.documents) {
        if (doc.yearlyReset && doc.lastResetYear !== currentYear) {
            // Atualizar no banco
            try {
                const { error } = await supabase
                    .from('documents')
                    .update({
                        current_number: doc.startNumber,
                        last_reset_year: currentYear
                    })
                    .eq('id', doc.id);

                if (!error) {
                    doc.currentNumber = doc.startNumber;
                    doc.lastResetYear = currentYear;
                    hasChanges = true;
                }
            } catch (e) {
                console.error('Erro no reset anual:', e);
            }
        }
    }

    if (hasChanges) console.log('Reset anual aplicado');
}

// Auto login
async function checkAutoLogin() {
    try {
        state.loading = true;
        // console.log('Verificando login...');
        const user = await authService.getCurrentUser();

        if (user) {
            // console.log('Usuário encontrado:', user.username);
            state.currentUser = user;
            showMainApp();
        } else {
            // console.log('Nenhum usuário logado active');
            showLoginView();
        }
    } catch (err) {
        console.error('Erro no AutoLogin:', err);
        alert('Erro ao verificar login: ' + err.message);
        showLoginView(); // Fallback
    } finally {
        state.loading = false;
    }
}

// Login Handler
async function handleLogin(e) {
    e.preventDefault();
    const emailOrUsername = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const btn = e.target.querySelector('button');

    // UI Feedback
    const originalText = btn.textContent;
    btn.textContent = 'Entrando...';
    btn.disabled = true;

    const result = await authService.signIn(emailOrUsername, password);

    if (result.user) {
        state.currentUser = result.user;
        addLog('sistema', 'Login realizado', `${result.user.name} acessou o sistema`);
        showMainApp();
    } else {
        alert(result.error || 'Erro ao entrar. Verifique suas credenciais.');
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Register Handler
async function handleRegister(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');

    // Validar senhas
    const p1 = document.getElementById('regPassword').value;
    const p2 = document.getElementById('regConfirmPassword').value;

    if (p1 !== p2) {
        alert('As senhas não coincidem!');
        return;
    }

    if (p1.length < 6) {
        alert('A senha deve ter pelo menos 6 caracteres.');
        return;
    }

    // UI Feedback
    const originalText = btn.textContent;
    btn.textContent = 'Cadastrando...';
    btn.disabled = true;

    const userData = {
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        username: document.getElementById('regUsername').value,
        password: p1,
        cargo: document.getElementById('regCargo').value,
        setor: document.getElementById('regSetor').value,
        secretaria: document.getElementById('regSecretaria').value
    };

    const result = await authService.signUp(userData);

    if (result.error) {
        alert('Erro no cadastro: ' + result.error);
        btn.textContent = originalText;
        btn.disabled = false;
    } else {
        alert(result.message);
        // Limpar form e mudar para aba de login
        e.target.reset();
        switchAuthTab('login');
        // Preencher usuário criado
        document.getElementById('loginUsername').value = userData.email;
    }
}

// Logout
async function handleLogout() {
    if (state.currentUser) {
        addLog('sistema', 'Logout realizado', `${state.currentUser.name} saiu do sistema`);
    }
    await authService.signOut();
    state.currentUser = null;
    showLoginView();
}

// Switch Tabs
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`form-${tab}`).classList.add('active');
}

// Tela de login e cadastro
function showLoginView() {
    document.body.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <img src="./logo-prefeitura.png" alt="Logo Prefeitura" class="login-logo-img">
                    <h3>Sistema de Numeração</h3>
                </div>
                
                <div class="auth-tabs">
                    <button id="tab-login" class="auth-tab active" onclick="switchAuthTab('login')">Entrar</button>
                    <button id="tab-register" class="auth-tab" onclick="switchAuthTab('register')">Criar Conta</button>
                </div>

                <!-- LOGIN FORM -->
                <form id="form-login" class="auth-form active">
                    <div class="form-group">
                        <label>Email ou Usuário</label>
                        <input type="text" id="loginUsername" required autofocus placeholder="ex: joao.silva">
                    </div>
                    <div class="form-group">
                        <label>Senha</label>
                        <input type="password" id="loginPassword" required placeholder="Sua senha">
                    </div>
                    <button type="submit" class="btn-primary btn-block">Acessar Sistema</button>
                </form>

                <!-- REGISTER FORM -->
                <form id="form-register" class="auth-form">
                    <div class="form-group">
                        <label>Nome Completo</label>
                        <input type="text" id="regName" required placeholder="Ex: Maria Souza">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="regEmail" required placeholder="maria@exemplo.com">
                        </div>
                        <div class="form-group">
                            <label>Usuário (Login)</label>
                            <input type="text" id="regUsername" required placeholder="maria.souza">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Senha</label>
                            <input type="password" id="regPassword" required minlength="6">
                        </div>
                        <div class="form-group">
                            <label>Confirmar</label>
                            <input type="password" id="regConfirmPassword" required minlength="6">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Cargo</label>
                            <input type="text" id="regCargo" required>
                        </div>
                        <div class="form-group">
                            <label>Setor</label>
                            <input type="text" id="regSetor" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Secretaria</label>
                        <select id="regSecretaria" required>
                            <option value="">Selecione...</option>
                            ${state.secretariats.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <button type="submit" class="btn-primary btn-block">Cadastrar</button>
                </form>

            </div>
        </div>
    `;

    // Bind events manually because inline onclick logic might not see global scope immediately
    document.getElementById('form-login').addEventListener('submit', handleLogin);
    document.getElementById('form-register').addEventListener('submit', handleRegister);

    // Expose switchAuthTab to global scope for inline onclick
    window.switchAuthTab = switchAuthTab;
}

// ========== HEADER MODERNO ==========
function renderAppHeader() {
    const header = document.querySelector('.app-header');
    if (!header) return;

    // Limpar conteúdo atual
    header.innerHTML = '';

    const user = state.currentUser || { name: 'Visitante', role: 'Acesso Restrito' };
    const userInitials = user.name ? user.name.substring(0, 2).toUpperCase() : 'VS';

    const container = document.createElement('div');
    container.className = 'header-content';

    const brand = document.createElement('a');
    brand.href = '#';
    brand.className = 'header-brand';
    brand.onclick = (e) => { e.preventDefault(); showMainApp(); };

    brand.innerHTML = `
        <img src="./logo-header.png" alt="Prefeitura de Cataguases" class="header-logo-img">
        <div class="header-title-wrapper">
            <span class="header-title-main">Sistema de Numeração</span>
            <span class="header-title-sub">de Documentos</span>
        </div>
    `;

    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'header-actions-wrapper';

    if (state.currentUser) {
        const userWidget = document.createElement('div');
        userWidget.className = 'user-profile-widget';
        userWidget.title = `Logado como: ${user.name}`;
        userWidget.innerHTML = `
            <div class="user-avatar">${userInitials}</div>
            <div class="user-info-text">
                <span class="user-name">${user.name.split(' ')[0]}</span>
                <span class="user-role">${PERMISSION_LEVELS[user.role]?.label || user.role}</span>
            </div>
        `;

        const navMenu = document.createElement('nav');
        navMenu.className = 'header-nav';
        navMenu.innerHTML = `
            <button class="nav-btn ${state.currentView !== 'admin' ? 'active' : ''}" onclick="switchView('main')" data-view="main">
                <span>📋</span> Principal
            </button>
            ${user.role === 'admin' ? `
            <button class="nav-btn ${state.currentView === 'admin' ? 'active' : ''}" onclick="switchView('admin')" data-view="admin">
                <span>⚙️</span> Administração
            </button>
            ` : ''}
        `;

        const toolbar = document.createElement('div');
        toolbar.className = 'header-toolbar';

        const zoomControls = document.createElement('div');
        zoomControls.className = 'header-zoom-controls';
        zoomControls.innerHTML = `
            <button class="header-zoom-btn" onclick="decreaseGlobalZoom()" title="Diminuir Zoom">A-</button>
            <span id="globalZoomIndicator" class="header-zoom-value">${globalZoomLevel}%</span>
            <button class="header-zoom-btn" onclick="increaseGlobalZoom()" title="Aumentar Zoom">A+</button>
        `;

        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'btn-logout-header';
        logoutBtn.onclick = handleLogout;
        logoutBtn.innerHTML = `<span>Sair</span>`;

        toolbar.appendChild(zoomControls);
        toolbar.appendChild(logoutBtn);

        actionsWrapper.appendChild(navMenu);
        actionsWrapper.appendChild(userWidget);
        actionsWrapper.appendChild(toolbar);
    }

    container.appendChild(brand);
    container.appendChild(actionsWrapper);
    header.appendChild(container);

    lockHeaderZoom();
}

// Inicializar Header e Zoom
document.addEventListener('DOMContentLoaded', () => {
    applyGlobalZoom();
    renderAppHeader();
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




// ========== FUNÇÕES AUXILIARES ==========

function generateId() {
    return crypto.randomUUID();
}

function formatDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR');
}

function formatTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatNumber(doc) {
    const year = new Date().getFullYear();
    const number = String(doc.currentNumber).padStart(3, '0');
    return doc.prefix ? `${doc.prefix} ${number}/${year}` : `${number}/${year}`;
}

// ========== ZOOM & UI ==========

let globalZoomLevel = 100;

function applyGlobalZoom() {
    const savedZoom = localStorage.getItem('globalZoomLevel');
    if (savedZoom) {
        globalZoomLevel = parseInt(savedZoom);
    }
    document.body.style.zoom = `${globalZoomLevel}%`;
    updateZoomDisplay();
    lockHeaderZoom();
}

function increaseGlobalZoom() {
    if (globalZoomLevel < 150) {
        globalZoomLevel += 10;
        document.body.style.zoom = `${globalZoomLevel}%`;
        localStorage.setItem('globalZoomLevel', globalZoomLevel);
        updateZoomDisplay();
        lockHeaderZoom();
    }
}

function decreaseGlobalZoom() {
    if (globalZoomLevel > 70) {
        globalZoomLevel -= 10;
        document.body.style.zoom = `${globalZoomLevel}%`;
        localStorage.setItem('globalZoomLevel', globalZoomLevel);
        updateZoomDisplay();
        lockHeaderZoom();
    }
}

function updateZoomDisplay() {
    const el = document.getElementById('globalZoomIndicator');
    if (el) el.textContent = `${globalZoomLevel}%`;
}

// O header aplica um zoom inverso ao do body para cancelar o efeito:
// assim ele (e o botão de zoom dentro dele) sempre renderiza em tamanho
// real e nunca muda de posição/tamanho quando o zoom do conteúdo muda.
function lockHeaderZoom() {
    const header = document.querySelector('.app-header');
    if (header) {
        header.style.zoom = `${10000 / globalZoomLevel}%`;
    }
}

// ========== RENDERIZAÇÃO PRINCIPAL ==========

function syncAllViews() {
    // Função helper para garantir atualização da interface após carga de dados
    if (state.currentUser) {
        showMainApp();
    } else {
        // Se estiver na tela de login, nada a fazer além de esperar login
    }
}

function showMainApp() {
    // Garantir que currentUser existe
    if (!state.currentUser) {
        if (typeof showLoginView === 'function') showLoginView();
        return;
    }

    const isAdmin = state.currentUser.role === 'admin';

    // Body structure
    document.body.innerHTML = `
        <div class="app-container">
            <header class="app-header">
                <!-- Header será renderizado via renderAppHeader() -->
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
                    
                    <div class="documents-stats-panel" id="docStatsPanel" style="display: none;">
                        <h3>Estatísticas de Uso</h3>
                        <div id="docStatsList" class="stats-list-grid"></div>
                    </div>

                    <div class="export-actions" style="margin: 1rem 0; text-align: right;">
                        <button class="btn-secondary export-stats" onclick="toggleDocStats()">📊 Ver Estatísticas</button>
                    </div>

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
                <div class="admin-content"></div>
            </main>
            ` : ''}

            <!-- DATA MODALS -->
            <div id="docModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalTitle">Adicionar Documento</h3>
                        <button class="close-btn" onclick="closeDocModal()">&times;</button>
                    </div>
                    <form id="docForm" onsubmit="handleDocFormSubmit(event)">
                        <div class="form-group">
                            <label for="docName">Nome do Documento *</label>
                            <input type="text" id="docName" required placeholder="Ex: Ofício">
                        </div>
                        <div class="form-group">
                            <label for="docPrefix">Prefixo</label>
                            <input type="text" id="docPrefix" placeholder="Ex: Of.">
                        </div>
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
                        <div class="form-actions">
                            <button type="button" class="btn-secondary" onclick="closeDocModal()">Cancelar</button>
                            <button type="submit" class="btn-primary">Salvar</button>
                        </div>
                    </form>
                </div>
            </div>

            <div id="userModal" class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3 id="userModalTitle">Adicionar Usuário</h3>
                        <button class="close-btn" onclick="closeUserModal()">&times;</button>
                    </div>
                    <form id="userForm" onsubmit="handleUserFormSubmit(event)">
                        <div class="form-section">
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
                                <input type="text" id="userSecretaria" required>
                            </div>
                        </div>
                        <div class="form-section">
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
                        <div class="form-section">
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
                        <div class="form-section" id="documentsSection">
                            <h4>📄 Documentos Permitidos</h4>
                            <div class="checkbox-actions">
                                <button type="button" class="btn-link" onclick="selectAllDocs()">☑ Todos</button>
                                <button type="button" class="btn-link" onclick="deselectAllDocs()">☐ Nenhum</button>
                            </div>
                            <div id="documentsListCheckboxes" class="documents-checkboxes"></div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-secondary" onclick="closeUserModal()">Cancelar</button>
                            <button type="submit" class="btn-primary">Salvar Usuário</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Renderizar Header e Interface Inicial
    if (typeof renderAppHeader === 'function') {
        renderAppHeader();
    }

    renderDocuments();
    renderHistory();

    if (isAdmin) {
        renderAdminInterface();
    }
}

// ========== LÓGICA DE DOCUMENTOS ==========

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

function canReserve(docId) {
    const user = state.currentUser;
    if (user.role === 'user_readonly') return false;
    if (user.role === 'admin' || user.role === 'user_full') return true;
    return user.allowedDocuments && user.allowedDocuments.includes(docId);
}

function renderDocuments() {
    const container = document.getElementById('documentsList');
    if (!container) return;

    let docs = getVisibleDocuments();

    // ORDEM ALFABÉTICA
    docs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    if (docs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum documento disponível.</p>';
        return;
    }

    container.innerHTML = docs.map(doc => `
        <div class="doc-card">
            <div class="doc-card-header">
                <div class="doc-icon">📄</div>
            </div>
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

// ========== LÓGICA DE RESERVA (SUPABASE) ==========

async function reserveNumber(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc || !canReserve(docId)) return;

    // Recalcular number localmente para UI otimista
    const formattedNum = formatNumber(doc);

    // CONFIRMAÇÃO
    if (!confirm(`Confirma a reserva do número:\n\n${formattedNum}\n\nDocumento: ${doc.name}`)) {
        return;
    }

    try {
        const numberToReserve = doc.currentNumber;

        // Inserir Reserva
        const reservation = {
            doc_id: doc.id,
            doc_name: doc.name,
            number: numberToReserve,
            formatted_number: formattedNum,
            user_id: state.currentUser.id,
            user_name: state.currentUser.name,
            user_cargo: state.currentUser.cargo,
            user_setor: state.currentUser.setor,
            user_secretaria: state.currentUser.secretaria,
            timestamp: new Date().toISOString()
        };

        const { data: resData, error: resError } = await supabase
            .from('reservations')
            .insert([reservation])
            .select()
            .single();

        if (resError) throw resError;

        // Atualizar documento (Incrementar)
        const { error: docError } = await supabase
            .from('documents')
            .update({ current_number: numberToReserve + 1 })
            .eq('id', doc.id);

        if (docError) {
            console.error('Erro ao incrementar documento:', docError);
            alert('Erro crítico: Reserva criada mas falha ao incrementar número. Contate suporte.');
        }

        // Sucesso
        doc.currentNumber++;
        state.reservations.unshift({
            id: resData.id,
            docId: resData.doc_id,
            docName: resData.doc_name,
            number: resData.number,
            formattedNumber: resData.formatted_number,
            userId: resData.user_id,
            userName: resData.user_name,
            timestamp: resData.timestamp
        });

        addLog('reserva', `Reservou ${doc.name}`, `Número: ${formattedNum}`);

        renderDocuments();
        renderHistory();
        if (state.currentUser.role === 'admin') {
            updateStats();
        }

        alert(`Número reservado com sucesso!\n\n${formattedNum}`);

    } catch (error) {
        console.error('Erro na reserva:', error);
        alert('Erro ao realizar reserva: ' + error.message);
    }
}

// ========== HISTÓRICO ==========

function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;

    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';

    let filtered = state.reservations;

    // Filtrar por busca
    if (search) {
        filtered = filtered.filter(r =>
            r.docName.toLowerCase().includes(search) ||
            r.formattedNumber.toLowerCase().includes(search) ||
            r.userName.toLowerCase().includes(search)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhuma reserva encontrada.</p>';
        return;
    }

    container.innerHTML = filtered.slice(0, 50).map(r => `
        <div class="history-item">
            <div class="history-info">
                <div class="history-type">${r.docName}</div>
                <div class="history-details">${formatDate(r.timestamp)} às ${formatTime(r.timestamp)} - ${r.userName}</div>
            </div>
            <div class="history-number">${r.formattedNumber}</div>
        </div>
    `).join('');
}

// ========== INTERFACE ADMIN ==========

function renderAdminInterface() {
    const adminContent = document.querySelector('.admin-content');
    if (!adminContent) return;

    if (!adminContent.innerHTML) {
        const icons = {
            chart: '<span style="font-size:24px">📊</span>',
            counter: '<span style="font-size:24px">🔢</span>',
            calendar: '<span style="font-size:24px">📅</span>',
            users: '<span style="font-size:24px">👥</span>',
            documents: '<span style="font-size:32px">📄</span>',
            usersNav: '<span style="font-size:32px">👤</span>',
            logs: '<span style="font-size:32px">📋</span>'
        };

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
                        <div class="admin-nav-card" onclick="showAdminSubView('secretariats')">
                            <div class="stat-icon"><span style="font-size:32px">🏢</span></div>
                            <div>
                                <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Secretarias</div>
                                <div class="help-text">Gerenciar lista de secretarias</div>
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

            <div id="secretariatsView" class="admin-sub-view" style="display: none;">
                <button class="back-btn" onclick="showAdminSubView('stats')">← Voltar</button>
                <div class="view-header">
                    <h2>🏢 Gerenciar Secretarias</h2>
                    <p>Adicionar ou remover secretarias disponíveis no sistema</p>
                </div>
                <div class="form-row" style="margin-bottom: 2rem; gap: 1rem; align-items: flex-end;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <label>Nova Secretaria</label>
                        <input type="text" id="newSecretariatName" placeholder="Ex: Secretaria de Cultura">
                    </div>
                    <button class="btn-primary" onclick="addSecretariat()">➕ Adicionar</button>
                </div>
                <div id="adminSecretariatsList" class="admin-docs-list"></div>
            </div>
        `;
    }

    updateStats();
    renderAdminDocs();
    renderAdminUsers();
    renderLogs();
}

function showAdminSubView(view) {
    document.querySelectorAll('.admin-sub-view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(view + 'View');
    if (target) target.style.display = 'block';

    if (view === 'stats') updateStats();
    if (view === 'documents') renderAdminDocs();
    if (view === 'users') renderAdminUsers();
    if (view === 'logs') renderLogs();
    if (view === 'secretariats') renderAdminSecretariats();
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

// ========== GERENCIAR DOCUMENTOS (ADMIN) ==========

function renderAdminDocs() {
    const container = document.getElementById('adminDocsList');
    if (!container) return;

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

async function handleDocFormSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('docName').value,
        prefix: document.getElementById('docPrefix').value,
        start_number: parseInt(document.getElementById('startNumber').value),
        yearly_reset: document.getElementById('yearlyReset').checked,
        enabled: document.getElementById('docEnabled').checked,
        // current_number deve ser definido apenas na criação
    };

    try {
        if (state.editingDocId) {
            // Update
            const { error } = await supabase
                .from('documents')
                .update(formData)
                .eq('id', state.editingDocId);

            if (error) throw error;

            // Update local state
            const doc = state.documents.find(d => d.id === state.editingDocId);
            Object.assign(doc, {
                name: formData.name,
                prefix: formData.prefix,
                startNumber: formData.start_number,
                yearlyReset: formData.yearly_reset,
                enabled: formData.enabled
            });

            addLog('cadastro', 'Editou documento', doc.name);

        } else {
            // Create
            formData.current_number = formData.start_number;
            formData.last_reset_year = new Date().getFullYear();

            const { data, error } = await supabase
                .from('documents')
                .insert([formData])
                .select()
                .single();

            if (error) throw error;

            state.documents.push({
                id: data.id,
                name: data.name,
                prefix: data.prefix,
                startNumber: data.start_number,
                currentNumber: data.current_number,
                yearlyReset: data.yearly_reset,
                lastResetYear: data.last_reset_year,
                enabled: data.enabled
            });

            addLog('cadastro', 'Criou documento', formData.name);
        }

        renderAdminDocs();
        renderDocuments();
        updateStats();
        closeDocModal();

    } catch (err) {
        console.error('Erro ao salvar documento:', err);
        alert('Erro ao salvar: ' + err.message);
    }
}

async function toggleDocStatus(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;

    try {
        const newVal = !doc.enabled;
        const { error } = await supabase
            .from('documents')
            .update({ enabled: newVal })
            .eq('id', docId);

        if (error) throw error;

        doc.enabled = newVal;
        addLog('cadastro', `${newVal ? 'Habilitou' : 'Desabilitou'} documento`, doc.name);
        renderAdminDocs();
        renderDocuments();

    } catch (err) {
        console.error(err);
        alert('Erro ao alterar status');
    }
}

async function deleteDocument(docId) {
    if (!confirm('Excluir este documento? Isso pode afetar o histórico.')) return;

    try {
        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', docId);

        if (error) throw error;

        state.documents = state.documents.filter(d => d.id !== docId);

        // Também precisaria excluir reservas, mas Supabase pode ter cascade
        // Por ora, assume cascade ou mantém orfãos

        addLog('cadastro', 'Excluiu documento', 'ID: ' + docId);
        renderAdminDocs();
        renderDocuments();
        updateStats();

    } catch (err) {
        console.error(err);
        alert('Erro ao excluir: ' + err.message);
    }
}

// ========== GERENCIAR USUÁRIOS (ADMIN) ==========

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
                        Setor: ${user.setor || 'N/A'}
                        ${!user.approved ? '<br><span class="badge-disabled" style="background:#f59e0b; color:white">Pendente de Aprovação</span>' : ''}
                    </div>
                    <div class="admin-doc-details">
                        ${permIcon} ${permLabel}
                    </div>
                </div>
                <div class="admin-doc-actions">
                    ${!user.approved ? `<button class="icon-btn" onclick="approveUser('${user.id}')" title="Aprovar" style="color:green">✅</button>` : ''}
                    ${user.id !== state.currentUser.id ? `
                        <button class="icon-btn" onclick="openEditUserModal('${user.id}')">✏️</button>
                        <button class="icon-btn delete" onclick="deleteUser('${user.id}')">🗑️</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function openAddUserModal() {
    state.editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Adicionar Usuário';
    document.getElementById('userForm').reset();
    document.getElementById('userRole').value = 'user_restricted';

    // Populate Secretariats
    const secSelect = document.getElementById('userSecretaria');
    secSelect.innerHTML = '<option value="">Selecione...</option>' +
        state.secretariats.map(s => `<option value="${s}">${s}</option>`).join('');

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
    document.getElementById('userSetor').value = user.setor || '';

    // Update Select options before setting value
    const secSelect = document.getElementById('userSecretaria');
    secSelect.innerHTML = '<option value="">Selecione...</option>' +
        state.secretariats.map(s => `<option value="${s}">${s}</option>`).join('');
    secSelect.value = user.secretaria || '';

    // document.getElementById('userSecretaria').value = user.secretaria || ''; // Replaced by above
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

    if (PERMISSION_LEVELS[role]) {
        desc.textContent = PERMISSION_LEVELS[role].desc;
    }

    if (role === 'user_restricted' || role === 'user_readonly') {
        section.style.display = 'block';
        renderDocCheckboxes();
    } else {
        section.style.display = 'none';
    }
}

function renderDocCheckboxes() {
    const container = document.getElementById('documentsListCheckboxes');
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

async function handleUserFormSubmit(e) {
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
        allowed_documents: allowedDocuments
    };

    try {
        if (state.editingUserId) {
            // Update
            const { error } = await supabase
                .from('users')
                .update(formData)
                .eq('id', state.editingUserId);

            if (error) throw error;

            // Local Update
            const user = state.users.find(u => u.id === state.editingUserId);
            Object.assign(user, {
                name: formData.name,
                cargo: formData.cargo,
                setor: formData.setor,
                secretaria: formData.secretaria,
                username: formData.username,
                password: formData.password,
                role: formData.role,
                allowedDocuments: formData.allowed_documents
            });

            addLog('cadastro', 'Editou usuário', user.name);
        } else {
            // Create
            const { data, error } = await supabase
                .from('users')
                .insert([formData])
                .select()
                .single();

            if (error) throw error;

            state.users.push({
                id: data.id,
                name: data.name,
                cargo: data.cargo,
                setor: data.setor,
                secretaria: data.secretaria,
                username: data.username,
                password: data.password,
                role: data.role,
                allowedDocuments: data.allowed_documents,
                createdAt: data.created_at
            });

            addLog('cadastro', 'Criou usuário', formData.name);
        }

        renderAdminUsers();
        updateStats();
        closeUserModal();

    } catch (err) {
        console.error(err);
        alert('Erro ao salvar usuário: ' + err.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('Excluir este usuário?')) return;

    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) throw error;

        state.users = state.users.filter(u => u.id !== userId);
        renderAdminUsers();
        updateStats();
        addLog('cadastro', 'Excluiu usuário', 'ID: ' + userId);

    } catch (err) {
        console.error(err);
        alert('Erro ao excluir usuário');
    }
}

// ========== LOGS (ADMIN) ==========

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

// ========== VIEW SWITCHING ==========

function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    if (view === 'main') {
        const mainView = document.getElementById('mainView');
        if (mainView) mainView.classList.add('active');
        const btn = document.querySelector('.nav-btn:first-child');
        if (btn) btn.classList.add('active');
    } else {
        const adminView = document.getElementById('adminView');
        if (adminView) adminView.classList.add('active');
        // Find second nav btn (admin)
        const navs = document.querySelectorAll('.nav-btn');
        if (navs.length > 1) navs[1].classList.add('active');
        updateStats();
    }
}

// ========== GERENCIAR SECRETARIAS (ADMIN) ==========

function renderAdminSecretariats() {
    const container = document.getElementById('adminSecretariatsList');
    if (!container) return;

    if (state.secretariats.length === 0) {
        container.innerHTML = '<p class="text-secondary">Nenhuma secretaria cadastrada.</p>';
        return;
    }

    container.innerHTML = state.secretariats.sort().map(sec => `
        <div class="admin-doc-item">
            <div class="admin-doc-info">
                <div class="admin-doc-name">${sec}</div>
            </div>
            <div class="admin-doc-actions">
                <button class="icon-btn delete" onclick="removeSecretariat('${sec}')" title="Remover">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function addSecretariat() {
    const input = document.getElementById('newSecretariatName');
    const name = input.value.trim();

    if (!name) return alert('Digite o nome da secretaria.');
    if (state.secretariats.includes(name)) return alert('Secretaria já existe.');

    try {
        const newList = [...state.secretariats, name];

        // Save to Supabase (app_config)
        const { error } = await supabase
            .from('app_config')
            .upsert({ key: 'secretaria_list', value: newList });

        if (error) throw error;

        state.secretariats = newList;
        input.value = '';
        renderAdminSecretariats();
        addLog('sistema', 'Adicionou secretaria', name);

    } catch (err) {
        console.error(err);
        alert('Erro ao salvar: ' + err.message);
    }
}

async function removeSecretariat(name) {
    if (!confirm(`Remover "${name}"? Usuários vinculados manterão o nome, mas ele sumirá da lista.`)) return;

    try {
        const newList = state.secretariats.filter(s => s !== name);

        const { error } = await supabase
            .from('app_config')
            .upsert({ key: 'secretaria_list', value: newList });

        if (error) throw error;

        state.secretariats = newList;
        renderAdminSecretariats();
        addLog('sistema', 'Removeu secretaria', name);

    } catch (err) {
        console.error(err);
        alert('Erro ao remover: ' + err.message);
    }
}

async function approveUser(userId) {
    if (!confirm('Aprovar este usuário? Ele terá acesso imediato com o nível "Usuário Restrito".')) return;

    try {
        const user = state.users.find(u => u.id === userId);

        // Update approved status
        const updates = { approved: true };

        // Logica de Herança de Permissões da Secretaria
        if (user.secretaria && state.secretariaPermissions && state.secretariaPermissions[user.secretaria]) {
            const permissions = state.secretariaPermissions[user.secretaria];
            if (Array.isArray(permissions) && permissions.length > 0) {
                updates.allowed_documents = permissions;
                // Também atualiza o objeto local para refletir na UI imediatamente
                user.allowedDocuments = permissions;
                console.log(`Aplicando permissões da secretaria ${user.secretaria}:`, permissions);
            }
        }

        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);

        if (error) throw error;

        // Update local
        if (user) user.approved = true;

        renderAdminUsers();
        addLog('cadastro', 'Aprovou usuário', user ? user.name : userId);
        alert('Usuário aprovado com sucesso!');

    } catch (err) {
        console.error(err);
        alert('Erro ao aprovar: ' + err.message);
    }
}
