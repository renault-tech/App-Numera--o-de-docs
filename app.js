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
    loading: false,
    counters: {}, // `${doc_id}|${secretaria}|${year}` -> próximo número (migração 0003)
    secretariats: ['Gabinete', 'Administração', 'Finanças', 'Saúde', 'Educação', 'Obras'], // Default list
    expandedSecretariat: null // secretaria com o painel de "Configurar numeração" aberto
};



// Opção fixa do dropdown de destino para destinatários fora da prefeitura
const DEST_EXTERNO = 'Externo / Outro órgão';

// Níveis de permissão
const PERMISSION_LEVELS = {
    admin: { label: 'Administrador', desc: 'Acesso total' },
    user_full: { label: 'Usuário Completo', desc: 'Todos documentos' },
    user_restricted: { label: 'Usuário Restrito', desc: 'Documentos específicos' },
    user_readonly: { label: 'Somente Leitura', desc: 'Visualizar apenas' }
};

// Escapa texto vindo de usuários antes de inseri-lo via innerHTML
// (nomes, assuntos e cargos são cadastrados livremente — sem isso,
// um valor malicioso executaria script na tela de outros usuários).
function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // Fallback para contextos sem Clipboard API (http, browsers antigos)
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (_) { /* sem suporte */ }
        ta.remove();
        return ok;
    }
}

// ========== NOTIFICAÇÕES E CONFIRMAÇÕES (janelas flutuantes no topo) ==========
// Substituem alert()/confirm() nativos por componentes próprios, consistentes
// e não bloqueantes (exceto a confirmação, que retorna uma Promise<boolean>).

function ensureNotificationRoot() {
    let root = document.getElementById('notificationRoot');
    if (!root) {
        root = document.createElement('div');
        root.id = 'notificationRoot';
        root.className = 'notification-root';
        document.body.appendChild(root);
    }
    return root;
}

const TOAST_ICONS = { success: '✓', error: '✕', warning: '!', info: 'i' };

function showToast(message, type = 'info', duration = 4500, action = null) {
    const root = ensureNotificationRoot();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;

    const text = document.createElement('span');
    text.className = 'toast__message';
    text.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast__close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar aviso');
    closeBtn.innerHTML = '&times;';

    toast.appendChild(icon);
    toast.appendChild(text);
    if (action && action.label && typeof action.onClick === 'function') {
        const actionBtn = document.createElement('button');
        actionBtn.className = 'toast__action';
        actionBtn.type = 'button';
        actionBtn.textContent = action.label;
        actionBtn.onclick = () => action.onClick(actionBtn);
        toast.appendChild(actionBtn);
    }
    toast.appendChild(closeBtn);

    const close = () => {
        toast.classList.add('toast--leaving');
        setTimeout(() => toast.remove(), 200);
    };
    closeBtn.onclick = close;

    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast--visible'));

    if (duration > 0) setTimeout(close, duration);
    return toast;
}

// Quando `input` é informado ({ label, placeholder, maxLength }), o diálogo
// exibe um campo de texto e a Promise resolve { confirmed, value } em vez de boolean.
// Quando `fields` é informado ([{ name, label, type: 'text'|'textarea'|'select',
// options, required, value, placeholder, maxLength }]), o diálogo exibe um
// formulário e resolve { confirmed, values: { name: valor } }. Campos required
// vazios bloqueiam a confirmação com destaque visual no campo.
function showConfirmDialog({ title = 'Confirmar ação', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', variant = 'primary', input = null, fields = null } = {}) {
    return new Promise((resolve) => {
        const root = ensureNotificationRoot();

        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-modal', 'true');

        const titleEl = document.createElement('div');
        titleEl.className = 'confirm-dialog__title';
        titleEl.textContent = title;

        const messageEl = document.createElement('div');
        messageEl.className = 'confirm-dialog__message';
        messageEl.textContent = message;

        let inputEl = null;
        if (input) {
            inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.className = 'confirm-dialog__input';
            inputEl.placeholder = input.placeholder || '';
            inputEl.maxLength = input.maxLength || 200;
            inputEl.setAttribute('aria-label', input.label || input.placeholder || 'Informação adicional');
        }

        // Formulário multi-campos (reserva, edição etc.)
        const fieldEls = {};
        let fieldsWrap = null;
        if (fields && fields.length) {
            fieldsWrap = document.createElement('div');
            fieldsWrap.className = 'confirm-dialog__fields';
            fields.forEach(f => {
                const group = document.createElement('div');
                group.className = 'confirm-dialog__field';

                const label = document.createElement('label');
                label.className = 'confirm-dialog__label';
                label.textContent = f.label + (f.required ? ' *' : '');
                group.appendChild(label);

                let el;
                if (f.type === 'select') {
                    el = document.createElement('select');
                    el.className = 'confirm-dialog__input';
                    const opt0 = document.createElement('option');
                    opt0.value = '';
                    opt0.textContent = f.placeholder || 'Selecione...';
                    el.appendChild(opt0);
                    const opts = [...(f.options || [])];
                    // Valor atual fora da lista (ex.: secretaria removida) continua selecionável
                    if (f.value && !opts.includes(f.value)) opts.push(f.value);
                    opts.forEach(o => {
                        const opt = document.createElement('option');
                        opt.value = o;
                        opt.textContent = o;
                        el.appendChild(opt);
                    });
                } else if (f.type === 'textarea') {
                    el = document.createElement('textarea');
                    el.className = 'confirm-dialog__input confirm-dialog__textarea';
                    el.rows = 3;
                    el.placeholder = f.placeholder || '';
                    el.maxLength = f.maxLength || 500;
                } else {
                    el = document.createElement('input');
                    el.type = 'text';
                    el.className = 'confirm-dialog__input';
                    el.placeholder = f.placeholder || '';
                    el.maxLength = f.maxLength || 200;
                }
                el.id = `dlgField_${f.name}`;
                el.setAttribute('aria-label', f.label);
                if (f.value !== undefined && f.value !== null) el.value = f.value;
                el.addEventListener('input', () => el.classList.remove('confirm-dialog__input--invalid'));
                fieldEls[f.name] = el;
                group.appendChild(el);
                fieldsWrap.appendChild(group);
            });
        }

        const actions = document.createElement('div');
        actions.className = 'confirm-dialog__actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = cancelText;

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = variant === 'danger' ? 'btn-danger' : 'btn-primary';
        confirmBtn.textContent = confirmText;

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(titleEl);
        dialog.appendChild(messageEl);
        if (inputEl) dialog.appendChild(inputEl);
        if (fieldsWrap) dialog.appendChild(fieldsWrap);
        dialog.appendChild(actions);

        const collectValues = () => {
            const values = {};
            Object.keys(fieldEls).forEach(name => { values[name] = fieldEls[name].value.trim(); });
            return values;
        };

        const validateRequired = () => {
            if (!fields) return true;
            let firstInvalid = null;
            fields.forEach(f => {
                if (f.required && !fieldEls[f.name].value.trim()) {
                    fieldEls[f.name].classList.add('confirm-dialog__input--invalid');
                    if (!firstInvalid) firstInvalid = fieldEls[f.name];
                }
            });
            if (firstInvalid) { firstInvalid.focus(); return false; }
            return true;
        };

        const finish = (confirmed) => {
            if (confirmed && fields && !validateRequired()) return; // não fecha
            dialog.classList.add('confirm-dialog--leaving');
            setTimeout(() => dialog.remove(), 200);
            document.removeEventListener('keydown', onKey);
            if (fields) resolve({ confirmed, values: collectValues() });
            else if (input) resolve({ confirmed, value: inputEl.value.trim() });
            else resolve(confirmed);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') finish(false);
            if (e.key === 'Enter' && inputEl && document.activeElement === inputEl) finish(true);
            // Em formulários multi-campos, Enter confirma exceto dentro de textarea
            if (e.key === 'Enter' && fields && dialog.contains(document.activeElement)
                && document.activeElement.tagName !== 'TEXTAREA'
                && document.activeElement !== cancelBtn) {
                e.preventDefault();
                finish(true);
            }
        };

        cancelBtn.onclick = () => finish(false);
        confirmBtn.onclick = () => finish(true);
        document.addEventListener('keydown', onKey);

        root.appendChild(dialog);
        requestAnimationFrame(() => {
            dialog.classList.add('confirm-dialog--visible');
            const firstField = fields && fields.length ? fieldEls[fields[0].name] : null;
            (firstField || inputEl || confirmBtn).focus();
        });
    });
}

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
            perSecretaria: d.per_secretaria || false,
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
                    perSecretaria: d.per_secretaria || false,
                    enabled: d.enabled
                }));
                addLog('sistema', 'Inicialização', 'Documentos padrão criados');
            }
        }

        // 1.2 Carregar contadores por bucket (doc_id|secretaria|year -> próximo número).
        // Fonte da verdade da numeração desde a migração 0003. Se a tabela ainda
        // não existir (migração não aplicada), state.counters fica vazio e o
        // preview cai para startNumber; a reserva falha com aviso claro (ver
        // performReservation) até a migração ser aplicada.
        state.counters = {};
        const { data: counters, error: errCounters } = await supabase
            .from('document_counters')
            .select('doc_id,secretaria,year,current_number');
        if (!errCounters && counters) {
            counters.forEach(c => {
                state.counters[`${c.doc_id}|${c.secretaria}|${c.year}`] = c.current_number;
            });
        }

        // Reset anual: desde a migração 0003 é estrutural (bucket de ano em
        // document_counters), não precisa mais mutar documents.current_number.

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
            email: u.email,
            cargo: u.cargo,
            setor: u.setor,
            secretaria: u.secretaria,
            role: u.role,
            allowedDocuments: u.allowed_documents || [],
            approved: u.approved,
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
                allowed_documents: [],
                approved: true
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

        state.reservations = reservations.map(mapReservationRow);

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
        showToast('Erro ao carregar dados do sistema. Verifique o console.', 'error', 0);
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

// Reset anual — obsoleto desde a migração 0003. O reset agora é estrutural:
// cada ano tem seu próprio bucket em document_counters, semeado de start_number
// na primeira reserva. Mantido como no-op para compatibilidade de chamadas antigas.
async function checkYearlyReset() { /* intencionalmente vazio (ver migração 0003) */ }

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
        showToast('Erro ao verificar login: ' + err.message, 'error');
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
        showToast(result.error || 'Erro ao entrar. Verifique suas credenciais.', 'error');
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
        showToast('As senhas não coincidem!', 'warning');
        return;
    }

    if (p1.length < 6) {
        showToast('A senha deve ter pelo menos 6 caracteres.', 'warning');
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
        showToast('Erro no cadastro: ' + result.error, 'error');
        btn.textContent = originalText;
        btn.disabled = false;
    } else {
        showToast(result.message, 'success');
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
                    <img src="./logo-header.png" alt="Prefeitura de Cataguases" class="login-logo-img">
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
            <div class="user-avatar">${esc(userInitials)}</div>
            <div class="user-info-text">
                <span class="user-name">${esc(user.name.split(' ')[0])}</span>
                <span class="user-role">${esc(PERMISSION_LEVELS[user.role]?.label || user.role)}</span>
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

// Regra de bucket — DEVE espelhar a RPC reserve_number (migração 0003).
// per_secretaria ? secretaria do usuário : ''  |  yearly_reset ? ano : 0
function docBucketSecretaria(doc, user) {
    if (!doc.perSecretaria) return '';
    return (user && user.secretaria ? String(user.secretaria).trim() : '');
}

function bucketKey(doc, user) {
    const sec = docBucketSecretaria(doc, user);
    const year = doc.yearlyReset ? new Date().getFullYear() : 0;
    return `${doc.id}|${sec}|${year}`;
}

// Mesma regra de bucketKey, mas para uma secretaria arbitrária (não a do
// usuário logado) — usado no painel de configuração do admin e nas estatísticas.
function bucketKeyFor(doc, secretaria) {
    const sec = doc.perSecretaria ? (secretaria || '') : '';
    const year = doc.yearlyReset ? new Date().getFullYear() : 0;
    return `${doc.id}|${sec}|${year}`;
}

// Próximo número previsto para o usuário logado (do contador do seu bucket).
// Sem bucket ainda → a reserva vai semear de startNumber, então mostramos isso.
function nextNumberFor(doc) {
    const v = state.counters[bucketKey(doc, state.currentUser)];
    return (v !== undefined && v !== null) ? v : doc.startNumber;
}

// true quando o documento é por secretaria mas o usuário não tem secretaria
function blockedBySecretaria(doc) {
    return doc.perSecretaria && !docBucketSecretaria(doc, state.currentUser);
}

function formatNumber(doc) {
    const number = String(nextNumberFor(doc)).padStart(3, '0');
    // Documentos de numeração contínua (ex.: Processo, Protocolo) não levam
    // o ano no número — o ano só faz sentido quando a contagem reinicia nele.
    const yearSuffix = doc.yearlyReset ? `/${new Date().getFullYear()}` : '';
    return doc.prefix ? `${doc.prefix} ${number}${yearSuffix}` : `${number}${yearSuffix}`;
}

// ========== ZOOM & UI ==========

let globalZoomLevel = 100;

function applyGlobalZoom() {
    const savedZoom = localStorage.getItem('globalZoomLevel');
    if (savedZoom) {
        globalZoomLevel = parseInt(savedZoom);
    }
    setContentZoom();
    updateZoomDisplay();
}

function increaseGlobalZoom() {
    if (globalZoomLevel < 150) {
        globalZoomLevel += 10;
        localStorage.setItem('globalZoomLevel', globalZoomLevel);
        setContentZoom();
        updateZoomDisplay();
    }
}

function decreaseGlobalZoom() {
    if (globalZoomLevel > 70) {
        globalZoomLevel -= 10;
        localStorage.setItem('globalZoomLevel', globalZoomLevel);
        setContentZoom();
        updateZoomDisplay();
    }
}

function updateZoomDisplay() {
    const el = document.getElementById('globalZoomIndicator');
    if (el) el.textContent = `${globalZoomLevel}%`;
}

// O zoom é aplicado só via CSS (--content-zoom, usado em main.view),
// nunca em document.body. Assim o header e o botão de zoom nunca são
// escalados e nunca mudam de tamanho/posição, em qualquer nível de zoom.
function setContentZoom() {
    document.documentElement.style.setProperty('--content-zoom', `${globalZoomLevel}%`);
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
                            <div class="history-toolbar">
                                <div class="search-box">
                                    <span class="search-icon">🔍</span>
                                    <input type="text" id="searchInput" placeholder="Buscar por tipo, número, ementa, destinatário ou usuário..." oninput="renderHistory()">
                                </div>
                                <button class="btn-secondary btn-compact" onclick="exportHistoryExcel()" title="Exportar histórico em Excel">📊 Excel</button>
                                <button class="btn-secondary btn-compact" onclick="exportHistoryPdf()" title="Exportar histórico em PDF">📄 PDF</button>
                            </div>
                        </div>
                        <p class="history-scope-note" id="historyScopeNote"></p>
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
                            <label class="checkbox-label">
                                <input type="checkbox" id="docPerSecretaria">
                                <span>Numerar por secretaria (cada secretaria tem sua própria sequência)</span>
                            </label>
                        </div>
                        <p class="form-hint" id="docPerSecretariaHint" style="display:none;">
                            ⚠️ Mudar esta opção em um documento já em uso troca qual contador é lido — use com cuidado.
                        </p>
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
                                <select id="userSecretaria" required onchange="handleUserSecretariaChange()"></select>
                                <p class="help-text" id="secretariaDefaultsHint" style="display:none;"></p>
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
                                <button type="button" class="btn-link" onclick="applySecretariaDefaultsToForm(true)">🏢 Restaurar padrão da secretaria</button>
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
    const doc = state.documents.find(d => d.id === docId);
    // Documento por secretaria exige que o usuário tenha uma secretaria definida
    if (doc && blockedBySecretaria(doc)) return false;
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
            <div class="doc-name">${esc(doc.name)}${doc.perSecretaria ? ' <span class="doc-badge-sec" title="Numeração separada por secretaria">por secretaria</span>' : ''}</div>
            <div class="doc-prefix">${esc(doc.prefix) || 'Sem prefixo'}</div>
            <div class="doc-number">${blockedBySecretaria(doc) ? '—' : esc(formatNumber(doc))}</div>
            ${blockedBySecretaria(doc)
            ? `<button class="reserve-btn" disabled style="opacity:0.5" title="Defina sua secretaria no seu perfil para reservar">🏢 Defina sua secretaria</button>`
            : (canReserve(doc.id)
                ? `<button class="reserve-btn" onclick="reserveNumber('${doc.id}')">Reservar Número</button>`
                : `<button class="reserve-btn" disabled style="opacity:0.5">🔒 Sem Permissão</button>`)
        }
        </div>
    `).join('');
}

// ========== LÓGICA DE RESERVA (SUPABASE) ==========

async function reserveNumber(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc || !canReserve(docId)) return;

    // Número previsto (informativo — o número final é confirmado pelo servidor)
    const formattedNum = formatNumber(doc);

    // CONFIRMAÇÃO: ementa + destinatário (obrigatórios — histórico completo e buscável)
    const result = await showConfirmDialog({
        title: 'Confirmar reserva',
        message: `Documento: ${doc.name}\nPróximo número: ${formattedNum}`,
        confirmText: 'Reservar número',
        cancelText: 'Cancelar',
        fields: [
            { name: 'subject', label: 'Ementa', type: 'textarea', required: true, placeholder: 'Assunto/tema do documento', maxLength: 500 },
            { name: 'destSecretaria', label: 'Secretaria de destino', type: 'select', required: true, options: [...state.secretariats, DEST_EXTERNO] },
            { name: 'destNome', label: 'Nome do destinatário', type: 'text', required: true, placeholder: 'Ex: João da Silva' }
        ]
    });
    if (!result.confirmed) return;
    const { subject, destSecretaria, destNome } = result.values;

    try {
        const reservationRow = await performReservation(doc, formattedNum, subject, destSecretaria, destNome);

        // Sucesso — atualizar estado local com o que o servidor confirmou
        // (bucket vem do próprio servidor: fonte da verdade sobre qual
        // secretaria/ano a reserva usou, evita recalcular e divergir)
        const bucketSec = reservationRow.bucket_secretaria || '';
        const bucketYear = doc.yearlyReset ? new Date().getFullYear() : 0;
        state.counters[`${doc.id}|${bucketSec}|${bucketYear}`] = reservationRow.number + 1;
        state.reservations.unshift(mapReservationRow(reservationRow));

        renderDocuments();
        renderHistory();
        if (state.currentUser.role === 'admin') {
            updateStats();
        }

        const finalNumber = reservationRow.formatted_number;
        showToast(`Número reservado: ${finalNumber}`, 'success', 10000, {
            label: 'Copiar',
            onClick: async (btn) => {
                const ok = await copyToClipboard(finalNumber);
                btn.textContent = ok ? 'Copiado ✓' : 'Falhou';
            }
        });

    } catch (error) {
        console.error('Erro na reserva:', error);
        showToast('Erro ao realizar reserva: ' + error.message, 'error', 0);
    }
}

// Executa a reserva. Sempre via função SQL reserve_number() (atômica no banco,
// imune a corrida entre usuários simultâneos, e a única que conhece a regra de
// bucket por secretaria/ano). Não há mais fallback legado: um insert/update
// direto do cliente não sabe qual bucket usar e corromperia a numeração por
// secretaria — se a RPC estiver ausente, a reserva deve falhar de forma clara
// para o admin aplicar a migração, não seguir silenciosamente com números errados.
async function performReservation(doc, formattedNum, subject, destSecretaria, destNome) {
    const { data, error } = await supabase.rpc('reserve_number', {
        p_doc_id: doc.id,
        p_user_id: state.currentUser.id,
        p_subject: subject,
        p_dest_secretaria: destSecretaria || null,
        p_dest_nome: destNome || null
    });

    if (!error) return data;

    // PGRST202 = função inexistente no schema (migração ainda não aplicada)
    const functionMissing = error.code === 'PGRST202' ||
        /reserve_number/.test(error.message || '') && /not find|não encontrada|schema cache/i.test(error.message || '');
    if (functionMissing) {
        throw new Error('Sistema de reserva não configurado ou desatualizado. Aplique as migrações supabase/migrations/ (até a 0004) no Supabase e recarregue a página.');
    }

    throw error;
}

// Converte a linha crua de reservations (snake_case) para o formato do state.
// Único ponto de mapeamento — usado no loadData e após reservar/editar/anular.
function mapReservationRow(r) {
    return {
        id: r.id,
        docId: r.doc_id,
        docName: r.doc_name,
        number: r.number,
        formattedNumber: r.formatted_number,
        subject: r.subject,
        ementa: r.ementa,
        destSecretaria: r.dest_secretaria || '',
        destNome: r.dest_nome || '',
        status: r.status || 'ativa',
        cancelReason: r.cancel_reason || '',
        canceledByName: r.canceled_by_name || '',
        editedAt: r.edited_at || null,
        userId: r.user_id,
        userName: r.user_name,
        userCargo: r.user_cargo,
        userSetor: r.user_setor,
        userSecretaria: r.user_secretaria,
        bucketSecretaria: r.bucket_secretaria || '',
        timestamp: r.timestamp
    };
}

// ========== HISTÓRICO ==========

// Reservas que o usuário logado pode ver no histórico.
// Admin vê tudo; usuário com secretaria vê as reservas da SUA secretaria;
// usuário sem secretaria vê apenas as próprias.
// Atenção: é um filtro de interface — a proteção real no banco (RLS por
// secretaria) é pendência registrada da Fase 1 (doc 04).
function getVisibleReservations() {
    const user = state.currentUser;
    if (!user) return [];
    if (user.role === 'admin') return state.reservations;
    if (user.secretaria) {
        return state.reservations.filter(r => r.userSecretaria === user.secretaria);
    }
    return state.reservations.filter(r => r.userId === user.id);
}

// Conjunto exibido no histórico após busca — também é o que a exportação usa.
function getFilteredReservations() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    let filtered = getVisibleReservations();
    if (search) {
        filtered = filtered.filter(r =>
            r.docName.toLowerCase().includes(search) ||
            r.formattedNumber.toLowerCase().includes(search) ||
            (r.subject || '').toLowerCase().includes(search) ||
            (r.destNome || '').toLowerCase().includes(search) ||
            (r.destSecretaria || '').toLowerCase().includes(search) ||
            r.userName.toLowerCase().includes(search)
        );
    }
    return filtered;
}

// Editar ementa/destinatário: SOMENTE quem reservou (nem o admin reescreve
// dados de terceiros — a edição fica sempre atribuída ao autor).
function canEditReservation(r) {
    const user = state.currentUser;
    if (!user) return false;
    return r.userId === user.id;
}

// Anular: o dono OU um admin (rede de segurança — permite invalidar um número
// errado mesmo se o autor sair/faltar; sempre com motivo e registro em log).
function canCancelReservation(r) {
    const user = state.currentUser;
    if (!user) return false;
    return user.role === 'admin' || r.userId === user.id;
}

function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;

    // Nota de escopo (transparência sobre o que está sendo listado)
    const note = document.getElementById('historyScopeNote');
    if (note) {
        const user = state.currentUser;
        if (user.role === 'admin') note.textContent = 'Visão de administrador: todas as secretarias.';
        else if (user.secretaria) note.textContent = `Exibindo reservas da secretaria: ${user.secretaria}.`;
        else note.textContent = 'Exibindo apenas as suas reservas (defina sua secretaria para ver as da sua equipe).';
    }

    const filtered = getFilteredReservations();

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhuma reserva encontrada.</p>';
        return;
    }

    // Linha compacta em 3 níveis: cabeçalho (número + tipo + chips),
    // ementa/destinatário, rodapé pequeno (quem/quando).
    container.innerHTML = filtered.slice(0, 50).map(r => {
        const anulada = r.status === 'anulada';
        const canEdit = !anulada && canEditReservation(r);
        const canCancel = !anulada && canCancelReservation(r);
        const actions = (canEdit || canCancel) ? `
            <div class="history-actions">
                ${canEdit ? `<button class="icon-btn icon-btn--sm" onclick="editReservation('${r.id}')" title="Editar ementa/destinatário">✏️</button>` : ''}
                ${canCancel ? `<button class="icon-btn icon-btn--sm delete" onclick="cancelReservation('${r.id}')" title="Anular reserva">🚫</button>` : ''}
            </div>` : '';

        return `
        <div class="history-item ${anulada ? 'history-item--canceled' : ''}">
            <div class="history-row history-row--head">
                <span class="history-number-inline ${anulada ? 'history-number--struck' : ''}">${esc(r.formattedNumber)}</span>
                <span class="history-type-inline">${esc(r.docName)}</span>
                ${r.destSecretaria ? `<span class="history-chip" title="Secretaria de destino">→ ${esc(r.destSecretaria)}</span>` : ''}
                ${anulada ? '<span class="history-chip history-chip--canceled">ANULADA</span>' : ''}
                <span class="history-head-spacer"></span>
                ${actions}
            </div>
            <div class="history-row history-row--body">
                ${r.subject ? `<span class="history-subject">${esc(r.subject)}</span>` : '<span class="history-subject history-subject--empty">Sem ementa</span>'}
                ${r.destNome ? `<span class="history-dest">Para: ${esc(r.destNome)}</span>` : ''}
            </div>
            ${anulada && r.cancelReason ? `<div class="history-row history-cancel-reason">Motivo da anulação: ${esc(r.cancelReason)}${r.canceledByName ? ` — por ${esc(r.canceledByName)}` : ''}</div>` : ''}
            <div class="history-row history-row--foot">
                Reservado por ${esc(r.userName)}${r.userSecretaria ? ` · ${esc(r.userSecretaria)}` : ''} · ${formatDate(r.timestamp)} às ${formatTime(r.timestamp)}${r.editedAt ? ' · (editada)' : ''}
            </div>
        </div>`;
    }).join('');
}

// ========== ANULAÇÃO E EDIÇÃO DE RESERVA ==========

async function cancelReservation(reservationId) {
    const r = state.reservations.find(x => x.id === reservationId);
    if (!r || !canCancelReservation(r) || r.status === 'anulada') return;

    const result = await showConfirmDialog({
        title: 'Anular reserva',
        message: `Anular o número ${r.formattedNumber} (${r.docName})?\nO número permanecerá no histórico como anulado e NÃO poderá ser reutilizado — será preciso reservar um novo número.`,
        confirmText: 'Anular número',
        cancelText: 'Voltar',
        variant: 'danger',
        fields: [
            { name: 'reason', label: 'Motivo da anulação', type: 'textarea', required: true, placeholder: 'Ex: documento emitido em duplicidade', maxLength: 300 }
        ]
    });
    if (!result.confirmed) return;

    try {
        const { data, error } = await supabase.rpc('cancel_reservation', {
            p_reservation_id: reservationId,
            p_user_id: state.currentUser.id,
            p_reason: result.values.reason
        });
        if (error) throw error;

        const idx = state.reservations.findIndex(x => x.id === reservationId);
        if (idx >= 0) state.reservations[idx] = mapReservationRow(data);
        renderHistory();
        if (state.currentUser.role === 'admin') updateStats();
        showToast(`Reserva ${r.formattedNumber} anulada.`, 'success');

    } catch (err) {
        console.error('Erro ao anular reserva:', err);
        showToast('Erro ao anular: ' + err.message, 'error', 0);
    }
}

async function editReservation(reservationId) {
    const r = state.reservations.find(x => x.id === reservationId);
    if (!r || !canEditReservation(r) || r.status === 'anulada') return;

    const result = await showConfirmDialog({
        title: 'Editar reserva',
        message: `${r.formattedNumber} (${r.docName}) — o número não muda, apenas os dados abaixo.`,
        confirmText: 'Salvar alterações',
        cancelText: 'Cancelar',
        fields: [
            { name: 'subject', label: 'Ementa', type: 'textarea', required: true, value: r.subject || '', maxLength: 500 },
            { name: 'destSecretaria', label: 'Secretaria de destino', type: 'select', required: true, options: [...state.secretariats, DEST_EXTERNO], value: r.destSecretaria || '' },
            { name: 'destNome', label: 'Nome do destinatário', type: 'text', required: true, value: r.destNome || '' }
        ]
    });
    if (!result.confirmed) return;

    try {
        const { data, error } = await supabase.rpc('update_reservation', {
            p_reservation_id: reservationId,
            p_user_id: state.currentUser.id,
            p_subject: result.values.subject,
            p_dest_secretaria: result.values.destSecretaria,
            p_dest_nome: result.values.destNome
        });
        if (error) throw error;

        const idx = state.reservations.findIndex(x => x.id === reservationId);
        if (idx >= 0) state.reservations[idx] = mapReservationRow(data);
        renderHistory();
        showToast('Reserva atualizada.', 'success');

    } catch (err) {
        console.error('Erro ao editar reserva:', err);
        showToast('Erro ao editar: ' + err.message, 'error', 0);
    }
}

// ========== EXPORTAÇÃO DO HISTÓRICO (Excel / PDF) ==========
// As bibliotecas (~1MB) são carregadas do CDN apenas no primeiro clique,
// para não pesar o carregamento normal da página (decisão do doc 06 §3).

const _loadedScripts = {};
function loadScriptOnce(url) {
    if (!_loadedScripts[url]) {
        _loadedScripts[url] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = resolve;
            s.onerror = () => { delete _loadedScripts[url]; reject(new Error('Falha ao carregar biblioteca: ' + url)); };
            document.head.appendChild(s);
        });
    }
    return _loadedScripts[url];
}

// Linhas exportadas = exatamente o que o usuário vê (visibilidade + busca)
function exportRows() {
    return getFilteredReservations().map(r => ({
        'Número': r.formattedNumber,
        'Documento': r.docName,
        'Ementa': r.subject || '',
        'Destinatário': r.destNome || '',
        'Secretaria destino': r.destSecretaria || '',
        'Reservado por': r.userName,
        'Secretaria origem': r.userSecretaria || '',
        'Data/hora': `${formatDate(r.timestamp)} ${formatTime(r.timestamp)}`,
        'Status': r.status === 'anulada' ? `Anulada — ${r.cancelReason || 'sem motivo'}` : 'Ativa'
    }));
}

function exportFileName(ext) {
    const d = new Date().toISOString().slice(0, 10);
    return `historico-reservas-${d}.${ext}`;
}

async function exportHistoryExcel() {
    const rows = exportRows();
    if (rows.length === 0) return showToast('Nada para exportar com o filtro atual.', 'warning');

    try {
        showToast('Preparando exportação...', 'info', 2000);
        await loadScriptOnce('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');

        const ws = XLSX.utils.json_to_sheet(rows);
        // Larguras aproximadas por coluna para abrir legível no Excel
        ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 45 }, { wch: 24 }, { wch: 22 }, { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 28 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
        XLSX.writeFile(wb, exportFileName('xlsx'));

        addLog('sistema', 'Exportou histórico (Excel)', `${rows.length} linhas`);
    } catch (err) {
        console.error('Erro na exportação Excel:', err);
        showToast('Erro ao exportar Excel: ' + err.message, 'error', 0);
    }
}

async function exportHistoryPdf() {
    const rows = exportRows();
    if (rows.length === 0) return showToast('Nada para exportar com o filtro atual.', 'warning');

    try {
        showToast('Preparando exportação...', 'info', 2000);
        await loadScriptOnce('https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js');
        await loadScriptOnce('https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');

        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(14);
        doc.text('Histórico de Reservas — Sistema de Numeração de Documentos', 14, 14);
        doc.setFontSize(9);
        doc.setTextColor(100);
        const scope = state.currentUser.role === 'admin' ? 'todas as secretarias' : (state.currentUser.secretaria || 'minhas reservas');
        doc.text(`Gerado em ${formatDate(new Date())} ${formatTime(new Date())} — escopo: ${scope} — ${rows.length} registro(s)`, 14, 20);

        const headers = Object.keys(rows[0]);
        doc.autoTable({
            startY: 25,
            head: [headers],
            body: rows.map(r => headers.map(h => r[h])),
            styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
            headStyles: { fillColor: [37, 99, 235] },
            columnStyles: { 2: { cellWidth: 60 } }, // Ementa mais larga
            didParseCell: (data) => {
                // Linhas anuladas em vermelho suave
                if (data.section === 'body' && String(rows[data.row.index]['Status']).startsWith('Anulada')) {
                    data.cell.styles.textColor = [185, 28, 28];
                }
            }
        });

        doc.save(exportFileName('pdf'));
        addLog('sistema', 'Exportou histórico (PDF)', `${rows.length} linhas`);
    } catch (err) {
        console.error('Erro na exportação PDF:', err);
        showToast('Erro ao exportar PDF: ' + err.message, 'error', 0);
    }
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
                        <div class="admin-nav-card" onclick="showAdminSubView('secStats')">
                            <div class="stat-icon"><span style="font-size:32px">📈</span></div>
                            <div>
                                <div class="stat-label" style="font-size: 1.125rem; font-weight: 600;">Numeração por Secretaria</div>
                                <div class="help-text">Visão global de contadores e reservas por secretaria</div>
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
                <div class="admin-toolbar">
                    <button class="btn-primary" onclick="openAddDocModal()">➕ Adicionar Documento</button>
                    <div class="search-box">
                        <span class="search-icon">🔍</span>
                        <input type="text" id="adminDocsSearch" placeholder="Buscar documento..." oninput="renderAdminDocs()">
                    </div>
                </div>
                <div id="adminDocsList" class="admin-docs-list"></div>
            </div>

            <div id="usersView" class="admin-sub-view" style="display: none;">
                <button class="back-btn" onclick="showAdminSubView('stats')">← Voltar</button>
                <div class="view-header">
                    <h2>👥 Gerenciar Usuários</h2>
                    <p>Cadastrar usuários e configurar permissões</p>
                </div>
                <div class="admin-toolbar">
                    <button class="btn-primary" onclick="openAddUserModal()">➕ Adicionar Usuário</button>
                    <div class="search-box">
                        <span class="search-icon">🔍</span>
                        <input type="text" id="adminUsersSearch" placeholder="Buscar por nome, login ou secretaria..." oninput="renderAdminUsers()">
                    </div>
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

            <div id="secStatsView" class="admin-sub-view" style="display: none;">
                <button class="back-btn" onclick="showAdminSubView('stats')">← Voltar</button>
                <div class="view-header">
                    <h2>📈 Numeração por Secretaria</h2>
                    <p>Próximo número e total de reservas de cada secretaria, para os tipos de documento configurados como "por secretaria"</p>
                </div>
                <div id="secStatsList"></div>
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
    if (view === 'secStats') renderSecStats();
}

function updateStats() {
    if (!document.getElementById('totalDocTypes')) return;

    const ativas = state.reservations.filter(r => r.status !== 'anulada').length;
    const anuladas = state.reservations.length - ativas;

    document.getElementById('totalDocTypes').textContent = state.documents.length;
    document.getElementById('totalReservations').textContent = ativas;
    const resLabel = document.getElementById('totalReservations').nextElementSibling;
    if (resLabel) resLabel.textContent = anuladas > 0 ? `Reservas ativas (${anuladas} anulada${anuladas > 1 ? 's' : ''})` : 'Total de Reservas';
    document.getElementById('totalUsers').textContent = state.users.length;

    const today = new Date().toISOString().split('T')[0];
    const todayCount = state.reservations.filter(r => r.timestamp.startsWith(today)).length;
    document.getElementById('todayReservations').textContent = todayCount;
}

// Visão global do admin: para cada tipo "por secretaria", o próximo número e
// total de reservas de cada secretaria — só o admin vê todas juntas (RN de
// bloqueio impede o usuário comum de ver contadores de outra secretaria).
function renderSecStats() {
    const container = document.getElementById('secStatsList');
    if (!container) return;

    const perSecDocs = state.documents.filter(d => d.perSecretaria);
    if (perSecDocs.length === 0) {
        container.innerHTML = '<p class="text-secondary">Nenhum tipo de documento está configurado como "por secretaria" ainda. Ative essa opção ao editar um documento em Documentos.</p>';
        return;
    }

    // Inclui secretarias cadastradas + quaisquer outras que já tenham reservas/contadores
    // (ex.: secretaria removida da lista depois de já ter numeração própria)
    const secSet = new Set(state.secretariats);
    state.reservations.forEach(r => { if (r.bucketSecretaria) secSet.add(r.bucketSecretaria); });
    Object.keys(state.counters).forEach(key => {
        const sec = key.split('|')[1];
        if (sec) secSet.add(sec);
    });
    const allSecs = [...secSet].sort();

    container.innerHTML = perSecDocs.map(doc => {
        const rows = allSecs.map(sec => {
            const next = state.counters[bucketKeyFor(doc, sec)];
            const nextNumber = (next !== undefined && next !== null) ? next : doc.startNumber;
            const total = state.reservations.filter(r => r.docId === doc.id && r.bucketSecretaria === sec).length;
            return `
                <tr>
                    <td>${esc(sec)}</td>
                    <td>${nextNumber}</td>
                    <td>${total}</td>
                </tr>`;
        }).join('');

        return `
            <div class="stats-section" style="margin-bottom: 1.5rem;">
                <h3>${esc(doc.name)}${doc.prefix ? ` (${esc(doc.prefix)})` : ''}</h3>
                <table class="sec-stats-table">
                    <thead><tr><th>Secretaria</th><th>Próximo número</th><th>Total reservado</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }).join('');
}

// ========== GERENCIAR DOCUMENTOS (ADMIN) ==========

function renderAdminDocs() {
    const container = document.getElementById('adminDocsList');
    if (!container) return;

    const search = document.getElementById('adminDocsSearch')?.value.toLowerCase() || '';
    let docs = [...state.documents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (search) {
        docs = docs.filter(d =>
            d.name.toLowerCase().includes(search) ||
            (d.prefix || '').toLowerCase().includes(search)
        );
    }

    if (docs.length === 0) {
        container.innerHTML = '<p class="text-secondary" style="text-align:center; padding:2rem;">Nenhum documento encontrado.</p>';
        return;
    }

    container.innerHTML = docs.map(doc => {
        const totalRes = state.reservations.filter(r => r.docId === doc.id).length;
        const nextInfo = doc.perSecretaria
            ? `<a href="javascript:void(0)" onclick="switchView('admin'); showAdminSubView('secretariats')" title="Configurar na tela Secretarias">configurar por secretaria</a>`
            : `próximo: <strong>${doc.currentNumber}</strong>`;

        return `
        <div class="admin-doc-item" style="opacity: ${doc.enabled ? '1' : '0.55'}">
            <div class="admin-doc-info">
                <div class="admin-doc-name">
                    ${esc(doc.name)} ${doc.prefix ? `<span class="meta-chip" title="Prefixo">${esc(doc.prefix)}</span>` : ''}
                    ${!doc.enabled ? '<span class="meta-chip meta-chip--danger">desabilitado</span>' : ''}
                </div>
                <div class="admin-doc-details">
                    ${doc.perSecretaria ? '<span class="meta-chip meta-chip--accent">🏢 por secretaria</span>' : ''}
                    ${doc.yearlyReset ? '<span class="meta-chip">📅 reinicia a cada ano</span>' : '<span class="meta-chip">∞ numeração contínua</span>'}
                    <span class="meta-chip" title="Total de reservas deste tipo">🔢 ${totalRes} reserva(s)</span>
                    <span class="meta-chip">${nextInfo}</span>
                </div>
            </div>
            <div class="admin-doc-actions">
                <button class="icon-btn" onclick="toggleDocStatus('${doc.id}')" title="${doc.enabled ? 'Desabilitar' : 'Habilitar'}">${doc.enabled ? '👁️' : '🚫'}</button>
                <button class="icon-btn" onclick="openEditDocModal('${doc.id}')" title="Editar">✏️</button>
                <button class="icon-btn delete" onclick="deleteDocument('${doc.id}')" title="Excluir">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function openAddDocModal() {
    state.editingDocId = null;
    document.getElementById('modalTitle').textContent = 'Adicionar Documento';
    document.getElementById('docForm').reset();
    document.getElementById('docPerSecretariaHint').style.display = 'none';
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
    document.getElementById('docPerSecretaria').checked = doc.perSecretaria;
    document.getElementById('docPerSecretariaHint').style.display = 'block';
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
        per_secretaria: document.getElementById('docPerSecretaria').checked,
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
                enabled: formData.enabled,
                perSecretaria: formData.per_secretaria
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
                enabled: data.enabled,
                perSecretaria: data.per_secretaria || false
            });
            // Bucket global (secretaria '') semeado pela migração 0003 só para
            // docs já existentes; para um doc novo o primeiro reserve_number()
            // faz o find-or-create sozinho, então nenhum contador local é
            // necessário aqui além do que já é usado como fallback em nextNumberFor.

            addLog('cadastro', 'Criou documento', formData.name);
        }

        renderAdminDocs();
        renderDocuments();
        updateStats();
        closeDocModal();

    } catch (err) {
        console.error('Erro ao salvar documento:', err);
        showToast('Erro ao salvar: ' + err.message, 'error');
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
        showToast('Erro ao alterar status', 'error');
    }
}

async function deleteDocument(docId) {
    const confirmed = await showConfirmDialog({
        title: 'Excluir documento',
        message: 'Excluir este documento? Isso pode afetar o histórico.',
        confirmText: 'Excluir',
        variant: 'danger'
    });
    if (!confirmed) return;

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
        showToast('Erro ao excluir: ' + err.message, 'error');
    }
}

// ========== GERENCIAR USUÁRIOS (ADMIN) ==========

// Iniciais para o avatar (ex.: "João da Silva" -> "JS")
function userInitials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    const first = parts[0]?.[0] || '?';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
}

function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');
    if (!container) return;

    const search = document.getElementById('adminUsersSearch')?.value.toLowerCase() || '';
    let users = state.users;
    if (search) {
        users = users.filter(u =>
            (u.name || '').toLowerCase().includes(search) ||
            (u.username || '').toLowerCase().includes(search) ||
            (u.secretaria || '').toLowerCase().includes(search)
        );
    }

    // Pendentes de aprovação primeiro (precisam de ação), depois por nome
    users = [...users].sort((a, b) => {
        if (!a.approved !== !b.approved) return a.approved ? 1 : -1;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    });

    if (users.length === 0) {
        container.innerHTML = '<p class="text-secondary" style="text-align:center; padding:2rem;">Nenhum usuário encontrado.</p>';
        return;
    }

    const roleChipClass = { admin: 'role-chip--admin', user_full: 'role-chip--full', user_restricted: 'role-chip--restricted', user_readonly: 'role-chip--readonly' };

    container.innerHTML = users.map(user => {
        const permLabel = PERMISSION_LEVELS[user.role]?.label || user.role;
        const docCount = (user.role === 'user_restricted' || user.role === 'user_readonly')
            ? `<span class="meta-chip" title="Documentos permitidos">📄 ${(user.allowedDocuments || []).length} doc(s)</span>` : '';

        return `
            <div class="admin-doc-item ${!user.approved ? 'admin-doc-item--pending' : ''}">
                <div class="user-avatar" aria-hidden="true">${esc(userInitials(user.name))}</div>
                <div class="admin-doc-info">
                    <div class="admin-doc-name">
                        ${esc(user.name)} ${user.id === state.currentUser.id ? '<span class="meta-chip">Você</span>' : ''}
                        ${!user.approved ? '<span class="meta-chip meta-chip--warning">⏳ Pendente de aprovação</span>' : ''}
                    </div>
                    <div class="admin-doc-details">
                        <span class="role-chip ${roleChipClass[user.role] || ''}">${esc(permLabel)}</span>
                        ${user.secretaria ? `<span class="meta-chip">🏢 ${esc(user.secretaria)}</span>` : '<span class="meta-chip meta-chip--warning">sem secretaria</span>'}
                        ${docCount}
                        <span class="meta-chip" title="Login">@${esc(user.username)}</span>
                        ${user.cargo ? `<span class="meta-chip">${esc(user.cargo)}</span>` : ''}
                    </div>
                </div>
                <div class="admin-doc-actions">
                    ${!user.approved ? `<button class="icon-btn icon-btn--approve" onclick="approveUser('${user.id}')" title="Aprovar usuário">✅ Aprovar</button>` : ''}
                    ${user.id !== state.currentUser.id ? `
                        <button class="icon-btn" onclick="openEditUserModal('${user.id}')" title="Editar">✏️</button>
                        <button class="icon-btn delete" onclick="deleteUser('${user.id}')" title="Excluir">🗑️</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Preenche o select de secretaria do modal de usuário. Se o usuário tiver uma
// secretaria fora da lista atual (removida depois), ela entra como opção extra
// para não ser silenciosamente apagada ao salvar.
function fillUserSecretariaSelect(currentValue) {
    const secSelect = document.getElementById('userSecretaria');
    const options = [...state.secretariats];
    if (currentValue && !options.includes(currentValue)) options.push(currentValue);
    secSelect.innerHTML = '<option value="">Selecione...</option>' +
        options.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    secSelect.value = currentValue || '';
}

// Documentos padrão configurados para uma secretaria (tela Secretarias)
function getSecretariaDefaults(sec) {
    const perms = state.secretariaPermissions || {};
    return Array.isArray(perms[sec]) ? perms[sec] : [];
}

// Marca no formulário os documentos padrão da secretaria selecionada.
// fromButton=true quando o admin clica em "Restaurar padrão" (avisa se não houver).
function applySecretariaDefaultsToForm(fromButton = false) {
    const sec = document.getElementById('userSecretaria').value;
    const defaults = getSecretariaDefaults(sec);
    const hint = document.getElementById('secretariaDefaultsHint');

    if (!sec || defaults.length === 0) {
        if (hint) hint.style.display = 'none';
        if (fromButton) showToast(sec ? `A secretaria "${sec}" não tem documentos padrão configurados (tela Secretarias).` : 'Selecione uma secretaria primeiro.', 'warning');
        return;
    }

    document.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.checked = defaults.includes(cb.value) && !cb.disabled;
    });
    if (hint) {
        hint.textContent = `Padrão da secretaria aplicado (${defaults.length} documento(s)) — ajuste se necessário.`;
        hint.style.display = 'block';
    }
}

// Ao trocar a secretaria no modal: aplica o padrão dela automaticamente
// (só para papéis com lista de documentos — restrito/leitura).
function handleUserSecretariaChange() {
    const role = document.getElementById('userRole').value;
    if (role === 'user_restricted' || role === 'user_readonly') {
        applySecretariaDefaultsToForm(false);
    }
}

function openAddUserModal() {
    state.editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Adicionar Usuário';
    document.getElementById('userForm').reset();
    document.getElementById('userRole').value = 'user_restricted';
    document.getElementById('secretariaDefaultsHint').style.display = 'none';

    fillUserSecretariaSelect('');
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
    document.getElementById('secretariaDefaultsHint').style.display = 'none';

    fillUserSecretariaSelect(user.secretaria || '');
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = user.password;
    document.getElementById('userRole').value = user.role;

    handleRoleChange();

    // Na edição, mostra as permissões ATUAIS do usuário (override individual),
    // não o padrão da secretaria — o padrão só entra via botão "Restaurar".
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
            showToast('Selecione pelo menos um documento!', 'warning');
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
        showToast('Erro ao salvar usuário: ' + err.message, 'error');
    }
}

async function deleteUser(userId) {
    const confirmed = await showConfirmDialog({
        title: 'Excluir usuário',
        message: 'Excluir este usuário?',
        confirmText: 'Excluir',
        variant: 'danger'
    });
    if (!confirmed) return;

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
        showToast('Erro ao excluir usuário', 'error');
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
            (l.action || '').toLowerCase().includes(search) ||
            (l.details || '').toLowerCase().includes(search) ||
            (l.userName || '').toLowerCase().includes(search)
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
                    <span class="log-user">${esc(log.userName)}</span>
                    <span class="log-time">${formatDate(date)} às ${formatTime(date)}</span>
                </div>
                <div class="log-action">${esc(log.action)}</div>
                ${log.details ? `<div class="log-details">${esc(log.details)}</div>` : ''}
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

    const perSecDocs = state.documents.filter(d => d.perSecretaria);

    container.innerHTML = state.secretariats.sort().map(sec => {
        const userCount = state.users.filter(u => u.secretaria === sec).length;
        const defaultsCount = getSecretariaDefaults(sec).length;
        const expanded = state.expandedSecretariat === sec;
        return `
        <div class="admin-doc-item admin-doc-item--stack">
            <div class="admin-doc-row">
                <div class="admin-doc-info">
                    <div class="admin-doc-name">🏢 ${esc(sec)}</div>
                    <div class="admin-doc-details">
                        <span class="meta-chip">👥 ${userCount} usuário(s)</span>
                        <span class="meta-chip">📄 ${defaultsCount ? `${defaultsCount} doc(s) padrão` : 'sem padrão definido'}</span>
                    </div>
                </div>
                <div class="admin-doc-actions">
                    <button class="icon-btn" onclick="toggleSecretariatConfig('${esc(sec)}')" title="Configurar documentos padrão e numeração">${expanded ? '▴ Fechar' : '⚙️ Configurar'}</button>
                    <button class="icon-btn delete" onclick="removeSecretariat('${sec}')" title="Remover">🗑️</button>
                </div>
            </div>
            ${expanded ? renderSecretariatConfigPanel(sec, perSecDocs) : ''}
        </div>`;
    }).join('');
}

function toggleSecretariatConfig(sec) {
    state.expandedSecretariat = state.expandedSecretariat === sec ? null : sec;
    renderAdminSecretariats();
}

// Painel inline de configuração da secretaria, em 2 seções:
// 1) Documentos padrão — herdados pelos usuários da secretaria (override individual continua);
// 2) Numeração — próximo número por tipo "por secretaria" (RPC set_secretaria_counter).
function renderSecretariatConfigPanel(sec, perSecDocs) {
    const defaults = getSecretariaDefaults(sec);
    const secId = sec.replace(/[^a-zA-Z0-9]/g, '_');
    const sortedDocs = [...state.documents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const defaultsSection = `
        <div class="sec-config-section">
            <h4 class="sec-config-title">📄 Documentos padrão desta secretaria</h4>
            <p class="help-text">Novos usuários (e aprovações) desta secretaria começam com estes documentos. As permissões de cada usuário continuam ajustáveis individualmente.</p>
            <div class="documents-checkboxes sec-defaults-grid">
                ${sortedDocs.map(doc => `
                    <label class="checkbox-label document-checkbox">
                        <input type="checkbox" class="sec-default-checkbox-${secId}" value="${doc.id}" ${defaults.includes(doc.id) ? 'checked' : ''} ${doc.enabled ? '' : 'disabled'}>
                        <span>${esc(doc.name)} ${doc.prefix ? `(${esc(doc.prefix)})` : ''}</span>
                    </label>
                `).join('')}
            </div>
            <div class="sec-config-actions">
                <button class="btn-primary btn-compact" onclick="saveSecretariaDefaults('${esc(sec)}')">Salvar padrão</button>
                <button class="btn-secondary btn-compact" onclick="applyDefaultsToUsers('${esc(sec)}')" title="Substitui as permissões dos usuários restritos desta secretaria pelo padrão salvo">Aplicar aos usuários existentes</button>
            </div>
        </div>`;

    const numberingSection = perSecDocs.length === 0
        ? `<div class="sec-config-section">
               <h4 class="sec-config-title">🔢 Numeração própria</h4>
               <p class="help-text">Nenhum tipo de documento está marcado como "Numerar por secretaria". Ative essa opção ao editar um documento para esta secretaria ter sequência própria.</p>
           </div>`
        : `<div class="sec-config-section">
               <h4 class="sec-config-title">🔢 Numeração própria — próximo número</h4>
               ${perSecDocs.map(doc => {
                   const next = state.counters[bucketKeyFor(doc, sec)];
                   const nextNumber = (next !== undefined && next !== null) ? next : doc.startNumber;
                   const inputId = `secCounter_${doc.id}_${secId}`;
                   return `
                   <div class="form-row sec-counter-row">
                       <div class="form-group" style="margin-bottom: 0; flex: 1;">
                           <label>${esc(doc.name)} ${esc(doc.prefix) ? `(${esc(doc.prefix)})` : ''}</label>
                           <input type="number" min="1" id="${inputId}" value="${nextNumber}">
                       </div>
                       <button class="btn-secondary btn-compact" onclick="saveSecretariatCounter('${doc.id}', '${esc(sec)}', '${inputId}')">Salvar</button>
                   </div>`;
               }).join('')}
           </div>`;

    return `<div class="sec-config-panel">${defaultsSection}${numberingSection}</div>`;
}

// Grava os documentos padrão da secretaria em app_config.secretariaPermissions
// (a mesma chave que approveUser/modal de usuário leem para a herança).
async function saveSecretariaDefaults(sec) {
    const secId = sec.replace(/[^a-zA-Z0-9]/g, '_');
    const selected = Array.from(document.querySelectorAll(`.sec-default-checkbox-${secId}:checked`)).map(cb => cb.value);

    try {
        const newPerms = { ...(state.secretariaPermissions || {}) };
        newPerms[sec] = selected;

        const { error } = await supabase
            .from('app_config')
            .upsert({ key: 'secretariaPermissions', value: newPerms });
        if (error) throw error;

        state.secretariaPermissions = newPerms;
        renderAdminSecretariats();
        showToast(`Padrão de "${sec}" salvo: ${selected.length} documento(s).`, 'success');
        addLog('cadastro', `Definiu documentos padrão de ${sec}`, `${selected.length} documento(s)`);

    } catch (err) {
        console.error('Erro ao salvar padrão da secretaria:', err);
        showToast('Erro ao salvar: ' + err.message, 'error');
    }
}

// Aplica o padrão salvo aos usuários RESTRITOS já existentes da secretaria
// (substitui as permissões individuais deles — por isso pede confirmação).
async function applyDefaultsToUsers(sec) {
    const defaults = getSecretariaDefaults(sec);
    if (defaults.length === 0) {
        return showToast('Salve um padrão com pelo menos um documento antes de aplicar.', 'warning');
    }

    const targets = state.users.filter(u => u.secretaria === sec && (u.role === 'user_restricted' || u.role === 'user_readonly'));
    if (targets.length === 0) {
        return showToast(`Nenhum usuário restrito/leitura vinculado a "${sec}".`, 'info');
    }

    const confirmed = await showConfirmDialog({
        title: 'Aplicar padrão aos usuários',
        message: `Substituir as permissões de ${targets.length} usuário(s) de "${sec}" pelo padrão salvo (${defaults.length} documento(s))?\nPersonalizações individuais serão sobrescritas.`,
        confirmText: 'Aplicar',
        variant: 'danger'
    });
    if (!confirmed) return;

    try {
        for (const u of targets) {
            const { error } = await supabase
                .from('users')
                .update({ allowed_documents: defaults })
                .eq('id', u.id);
            if (error) throw error;
            u.allowedDocuments = defaults;
        }
        renderAdminUsers();
        showToast(`Padrão aplicado a ${targets.length} usuário(s) de "${sec}".`, 'success');
        addLog('cadastro', `Aplicou padrão de ${sec} aos usuários`, `${targets.length} usuário(s)`);

    } catch (err) {
        console.error('Erro ao aplicar padrão:', err);
        showToast('Erro ao aplicar: ' + err.message, 'error');
    }
}

async function saveSecretariatCounter(docId, secretaria, inputId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;

    const input = document.getElementById(inputId);
    const nextNumber = parseInt(input.value, 10);
    if (!nextNumber || nextNumber < 1) {
        return showToast('Informe um número inicial válido.', 'warning');
    }

    try {
        const { data, error } = await supabase.rpc('set_secretaria_counter', {
            p_doc_id: docId,
            p_secretaria: secretaria,
            p_next_number: nextNumber
        });

        if (error) throw error;

        state.counters[`${data.doc_id}|${data.secretaria}|${data.year}`] = data.current_number;
        renderDocuments();
        renderAdminSecretariats();
        showToast(`Próximo número de ${doc.name} em ${secretaria} definido para ${nextNumber}.`, 'success');
        addLog('cadastro', `Definiu numeração de ${doc.name} para ${secretaria}`, `Próximo número: ${nextNumber}`);

    } catch (err) {
        console.error('Erro ao configurar contador:', err);
        showToast('Erro ao salvar: ' + err.message, 'error');
    }
}

async function addSecretariat() {
    const input = document.getElementById('newSecretariatName');
    const name = input.value.trim();

    if (!name) return showToast('Digite o nome da secretaria.', 'warning');
    if (state.secretariats.includes(name)) return showToast('Secretaria já existe.', 'warning');

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
        showToast('Erro ao salvar: ' + err.message, 'error');
    }
}

async function removeSecretariat(name) {
    const linkedUsers = state.users.filter(u => u.secretaria === name).length;
    const confirmed = await showConfirmDialog({
        title: 'Remover secretaria',
        message: `Remover "${name}"?` +
            (linkedUsers > 0
                ? `\n⚠️ ${linkedUsers} usuário(s) estão vinculados a ela — manterão o nome no cadastro, mas a secretaria sumirá das listas.`
                : '\nNenhum usuário está vinculado a ela.'),
        confirmText: 'Remover',
        variant: 'danger'
    });
    if (!confirmed) return;

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
        showToast('Erro ao remover: ' + err.message, 'error');
    }
}

async function approveUser(userId) {
    const confirmed = await showConfirmDialog({
        title: 'Aprovar usuário',
        message: 'Aprovar este usuário? Ele terá acesso imediato com o nível "Usuário Restrito".',
        confirmText: 'Aprovar'
    });
    if (!confirmed) return;

    try {
        const user = state.users.find(u => u.id === userId);

        // Update approved status
        const updates = { approved: true };

        // Herança do padrão da secretaria — apenas quando o usuário ainda não
        // tem permissões individuais (não sobrescreve personalização do admin)
        const hasCustomPerms = Array.isArray(user.allowedDocuments) && user.allowedDocuments.length > 0;
        const defaults = getSecretariaDefaults(user.secretaria);
        if (!hasCustomPerms && defaults.length > 0) {
            updates.allowed_documents = defaults;
            user.allowedDocuments = defaults;
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
        showToast('Usuário aprovado com sucesso!', 'success');

    } catch (err) {
        console.error(err);
        showToast('Erro ao aprovar: ' + err.message, 'error');
    }
}
