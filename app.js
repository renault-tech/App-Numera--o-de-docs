// ============================================================
// Numera — Sistema de Numeração de Documentos (Prefeitura de Cataguases)
// Redesign Apple/glass (sidebar + dashboard) sobre Supabase.
// Vanilla JS, sem build. A lógica de negócio (numeração por secretaria,
// destinatário, anulação/edição, permissões) é preservada; muda a interface.
// ============================================================

const SUPABASE_URL = 'https://uxdjhdnsnditivvjktzf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VAfgn59xk4fN4e3gPSMmLg_OXx6xAjf';
var supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const DEST_EXTERNO = 'Externo / Outro órgão';

const PERMISSION_LEVELS = {
    admin: { label: 'Administrador', desc: 'Acesso total' },
    user_full: { label: 'Usuário Completo', desc: 'Todos os documentos' },
    user_restricted: { label: 'Usuário Restrito', desc: 'Documentos específicos' },
    user_readonly: { label: 'Somente Leitura', desc: 'Apenas consulta' }
};

// Matiz (HSL hue) por tipo de documento — base das cores dos chips/barras
const HUES = {
    'Ofício': 210, 'Portaria': 265, 'Memorando': 190, 'Decreto': 145, 'Contrato': 30,
    'Circular': 320, 'Resolução': 250, 'Edital': 12, 'Parecer': 170, 'Ata': 285,
    'Instrução Normativa': 55, 'Lei': 220, 'Exposição de Motivos': 300,
    'Lei Complementar': 235, 'Medida Provisória': 340, 'Processo': 200,
    'Protocolo': 160, 'Folha': 40
};

const DEFAULT_SECRETARIATS = ['Gabinete', 'Administração', 'Fazenda', 'Saúde', 'Educação', 'Obras'];

let state = {
    view: 'inicio',
    collapsed: false,
    zoom: 100,
    currentUser: null,
    documents: [],
    counters: {},              // `${doc_id}|${secretaria}|${year}` -> próximo número
    reservations: [],
    users: [],
    logs: [],
    secretariats: [...DEFAULT_SECRETARIATS],
    secretariaPermissions: {}, // { secretaria: [docIds] }
    filters: { search: '', tipo: '', sec: '', from: '', to: '' },
    reportFilters: { tipo: '', sec: '', from: '', to: '', status: '' },
    logFilter: 'todos',
    prefs: { yearlyReset: true, notify: true, autoBackup: false },
    loading: false
};

// ============================================================
// Utilidades
// ============================================================
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(d) {
    if (!d) return '-';
    return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function brDate(iso) {
    if (!iso) return '-';
    const s = String(iso).slice(0, 10);
    const [y, m, dd] = s.split('-');
    return dd && m ? `${dd}/${m}` : formatDate(iso);
}
function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }

function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function docHue(name) { return HUES[name] !== undefined ? HUES[name] : 210; }
function chipStyle(name) { const h = docHue(name); return `background:hsl(${h} 80% 94%);color:hsl(${h} 72% 42%);`; }
function docAbbr(doc) {
    const base = (doc.prefix || doc.name || '').replace(/\./g, '').trim();
    return (base || doc.name.slice(0, 2)).slice(0, 4).toUpperCase();
}

// Ícones SVG line (stroke currentColor)
function icon(name, size = 18, stroke = 1.9) {
    const P = {
        inicio: ['M3 12l9-9 9 9', 'M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10'],
        gerar: ['M12 5v14', 'M5 12h14'],
        historico: ['M3 3v5h5', 'M3.05 13A9 9 0 1 0 6 5.3L3 8', 'M12 7v5l4 2'],
        tipos: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
        relatorios: ['M3 3v18h18', 'M18 9l-5 5-3-3-4 4'],
        config: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 11 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.91 9H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
        plus: ['M12 5v14', 'M5 12h14'],
        search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-4.35-4.35'],
        edit: ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z'],
        trash: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
        ban: ['M4.9 4.9l14.2 14.2', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
        eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
        eyeOff: ['M17.94 17.94A10 10 0 0 1 12 20c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.06-5.06', 'M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.16 3.19', 'M1 1l22 22'],
        check: ['M20 6L9 17l-5-5'],
        logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
        chevron: ['M15 18l-6-6 6-6'],
        users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
        building: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 9h.01', 'M9 13h.01', 'M9 17h.01', 'M15 9h.01', 'M15 13h.01', 'M15 17h.01'],
        list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
        grip: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01']
    };
    const paths = (P[name] || []).map(d => `<path d="${d}"></path>`).join('');
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${paths}</svg>`;
}

// ============================================================
// Notificações e diálogos (glass, no topo)
// ============================================================
function overlayRoot() {
    let r = document.getElementById('overlay-root');
    if (!r) { r = document.createElement('div'); r.id = 'overlay-root'; document.body.appendChild(r); }
    return r;
}
function notifRoot() {
    let r = document.getElementById('notification-root');
    if (!r) { r = document.createElement('div'); r.id = 'notification-root'; r.className = 'notification-root'; document.body.appendChild(r); }
    return r;
}

const TOAST_ICONS = { success: '✓', error: '✕', warning: '!', info: 'i' };
function showToast(message, type = 'info', duration = 3600, action = null) {
    const root = notifRoot();
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    const ic = document.createElement('span'); ic.className = 'toast__icon'; ic.textContent = TOAST_ICONS[type] || 'i';
    const tx = document.createElement('span'); tx.className = 'toast__message'; tx.textContent = message;
    toast.appendChild(ic); toast.appendChild(tx);
    if (action && action.label) {
        const b = document.createElement('button'); b.className = 'toast__action'; b.textContent = action.label;
        b.onclick = () => action.onClick(b); toast.appendChild(b);
    }
    const close = document.createElement('button'); close.className = 'toast__close'; close.innerHTML = '&times;';
    const dismiss = () => { toast.classList.add('toast--leaving'); setTimeout(() => toast.remove(), 200); };
    close.onclick = dismiss; toast.appendChild(close);
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
    if (duration > 0) setTimeout(dismiss, duration);
    return toast;
}

// Diálogo com campos (text/textarea/select). Resolve { confirmed, values }.
function showConfirmDialog({ title = 'Confirmar', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', variant = 'primary', fields = null } = {}) {
    return new Promise((resolve) => {
        const root = notifRoot();
        const back = document.createElement('div'); back.className = 'dialog-backdrop';
        const dlg = document.createElement('div'); dlg.className = 'confirm-dialog';
        dlg.innerHTML = `<div class="confirm-dialog__title">${esc(title)}</div>` +
            (message ? `<div class="confirm-dialog__message">${esc(message)}</div>` : '');
        const fieldEls = {};
        if (fields && fields.length) {
            const wrap = document.createElement('div'); wrap.className = 'confirm-dialog__fields';
            fields.forEach(f => {
                const g = document.createElement('div'); g.className = 'confirm-dialog__field';
                const lb = document.createElement('label'); lb.className = 'confirm-dialog__label'; lb.textContent = f.label + (f.required ? ' *' : '');
                g.appendChild(lb);
                let el;
                if (f.type === 'select') {
                    el = document.createElement('select');
                    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = f.placeholder || 'Selecione...'; el.appendChild(o0);
                    const opts = [...(f.options || [])]; if (f.value && !opts.includes(f.value)) opts.push(f.value);
                    opts.forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = o; el.appendChild(op); });
                } else if (f.type === 'textarea') {
                    el = document.createElement('textarea'); el.rows = 3; el.placeholder = f.placeholder || '';
                } else {
                    el = document.createElement('input'); el.type = f.type || 'text'; el.placeholder = f.placeholder || '';
                }
                el.className = 'field-input';
                if (f.value !== undefined && f.value !== null) el.value = f.value;
                el.addEventListener('input', () => el.classList.remove('field-input--invalid'));
                fieldEls[f.name] = el; g.appendChild(el); wrap.appendChild(g);
            });
            dlg.appendChild(wrap);
        }
        const actions = document.createElement('div'); actions.className = 'confirm-dialog__actions';
        const cancel = document.createElement('button'); cancel.className = 'btn btn-ghost'; cancel.textContent = cancelText;
        const ok = document.createElement('button'); ok.className = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary'; ok.textContent = confirmText;
        actions.appendChild(cancel); actions.appendChild(ok); dlg.appendChild(actions);
        back.appendChild(dlg); root.appendChild(back);
        requestAnimationFrame(() => back.classList.add('dialog-backdrop--visible'));

        const valid = () => {
            if (!fields) return true;
            let first = null;
            fields.forEach(f => { if (f.required && !fieldEls[f.name].value.trim()) { fieldEls[f.name].classList.add('field-input--invalid'); if (!first) first = fieldEls[f.name]; } });
            if (first) { first.focus(); return false; } return true;
        };
        const finish = (confirmed) => {
            if (confirmed && fields && !valid()) return;
            back.classList.remove('dialog-backdrop--visible');
            setTimeout(() => back.remove(), 180);
            document.removeEventListener('keydown', onKey);
            const values = {}; Object.keys(fieldEls).forEach(k => values[k] = fieldEls[k].value.trim());
            resolve({ confirmed, values });
        };
        const onKey = (e) => { if (e.key === 'Escape') finish(false); };
        cancel.onclick = () => finish(false);
        ok.onclick = () => finish(true);
        back.onclick = (e) => { if (e.target === back) finish(false); };
        document.addEventListener('keydown', onKey);
        const firstField = fields && fields.length ? fieldEls[fields[0].name] : ok;
        requestAnimationFrame(() => firstField.focus());
    });
}

async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { }
        ta.remove(); return ok;
    }
}

// Modal genérico (overlay-root) para formulários ricos (admin).
// sheet:true força o formato de bottom-sheet (usado no menu "Mais" do celular);
// no celular, qualquer modal já vira bottom-sheet pelo CSS.
function openModal(innerHtml, { width = 460, sheet = false } = {}) {
    const root = overlayRoot();
    root.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal-card ${sheet ? 'modal-card--sheet' : ''}" style="width:${width}px" onclick="event.stopPropagation()">${innerHtml}</div></div>`;
    const back = document.getElementById('modalBackdrop');
    back.onclick = closeModal;
    requestAnimationFrame(() => back.classList.add('modal-backdrop--visible'));
}
function closeModal() {
    const root = overlayRoot();
    const back = document.getElementById('modalBackdrop');
    if (back) { back.classList.remove('modal-backdrop--visible'); setTimeout(() => { root.innerHTML = ''; }, 180); }
    else root.innerHTML = '';
}

// ============================================================
// Carregamento de dados (Supabase)
// ============================================================
function mapReservationRow(r) {
    return {
        id: r.id, docId: r.doc_id, docName: r.doc_name, number: r.number,
        formattedNumber: r.formatted_number, subject: r.subject, ementa: r.ementa,
        destSecretaria: r.dest_secretaria || '', destNome: r.dest_nome || '',
        destSetor: r.dest_setor || '', observacoes: r.observacoes || '',
        status: r.status || 'ativa', cancelReason: r.cancel_reason || '',
        canceledByName: r.canceled_by_name || '', editedAt: r.edited_at || null,
        userId: r.user_id, userName: r.user_name, userCargo: r.user_cargo,
        userSetor: r.user_setor, userSecretaria: r.user_secretaria,
        bucketSecretaria: r.bucket_secretaria || '', timestamp: r.timestamp
    };
}

function mapDoc(d) {
    return {
        id: d.id, name: d.name, prefix: d.prefix, startNumber: d.start_number,
        currentNumber: d.current_number, yearlyReset: d.yearly_reset,
        lastResetYear: d.last_reset_year, perSecretaria: d.per_secretaria || false, enabled: d.enabled
    };
}

async function loadData() {
    if (!supabase) return;
    state.loading = true;
    try {
        const { data: docs, error: e1 } = await supabase.from('documents').select('*').order('name');
        if (e1) throw e1;
        state.documents = (docs || []).map(mapDoc);

        if (state.documents.length === 0) {
            const yr = new Date().getFullYear();
            const seed = [
                ['Ofício', 'Of.', true], ['Memorando', 'Mem.', true], ['Portaria', 'Port.', true],
                ['Decreto', 'Dec.', true], ['Contrato', 'Contr.', true], ['Resolução', 'Res.', true],
                ['Circular', 'Circ.', true], ['Edital', 'Ed.', true], ['Parecer', 'Par.', true],
                ['Ata', '', true], ['Lei', 'L.', true], ['Processo', 'Proc.', false], ['Protocolo', 'Prot.', false]
            ].map(([name, prefix, yearly]) => ({ name, prefix, start_number: 1, current_number: 1, yearly_reset: yearly, last_reset_year: yr, enabled: true }));
            const { data: nd } = await supabase.from('documents').insert(seed).select();
            if (nd) state.documents = nd.map(mapDoc);
        }

        // Contadores por bucket (migração 0003)
        state.counters = {};
        const { data: counters } = await supabase.from('document_counters').select('doc_id,secretaria,year,current_number');
        if (counters) counters.forEach(c => { state.counters[`${c.doc_id}|${c.secretaria}|${c.year}`] = c.current_number; });

        // Config (secretarias + permissões padrão)
        const { data: configs } = await supabase.from('app_config').select('*');
        if (configs) {
            const secList = configs.find(c => c.key === 'secretaria_list');
            if (secList && Array.isArray(secList.value)) state.secretariats = [...secList.value].sort();
            const perms = configs.find(c => c.key === 'secretariaPermissions');
            if (perms && perms.value) state.secretariaPermissions = perms.value;
        }

        // Usuários
        const { data: users } = await supabase.from('users').select('*');
        if (users) state.users = users.map(u => ({
            id: u.id, name: u.name, username: u.username, email: u.email, password: u.password,
            cargo: u.cargo, setor: u.setor, secretaria: u.secretaria, role: u.role,
            allowedDocuments: u.allowed_documents || [], approved: u.approved, createdAt: u.created_at
        }));

        // Reservas
        const { data: reservations } = await supabase.from('reservations').select('*').order('timestamp', { ascending: false }).limit(1000);
        if (reservations) state.reservations = reservations.map(mapReservationRow);

        // Logs
        const { data: logs } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(500);
        if (logs) state.logs = logs.map(l => ({ id: l.id, type: l.type, action: l.action, details: l.details, userId: l.user_id, userName: l.user_name, timestamp: l.timestamp }));
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
        showToast('Erro ao carregar dados. Verifique o console.', 'error', 0);
    } finally {
        state.loading = false;
    }
}

async function addLog(type, action, details) {
    try {
        await supabase.from('logs').insert([{ type, action, details, user_id: state.currentUser?.id, user_name: state.currentUser?.name || 'Sistema', timestamp: new Date().toISOString() }]);
    } catch (e) { console.error('log:', e); }
}

async function refreshLogs() {
    try {
        const { data } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(500);
        if (data) {
            state.logs = data.map(l => ({ id: l.id, type: l.type, action: l.action, details: l.details, userId: l.user_id, userName: l.user_name, timestamp: l.timestamp }));
            if (state.view === 'config' && document.getElementById('logsList')) renderLogsList();
        }
    } catch (e) { }
}

// ============================================================
// Regras de negócio (numeração, visibilidade, permissões)
// ============================================================
function docBucketSecretaria(doc, user) {
    if (!doc.perSecretaria) return '';
    return (user && user.secretaria ? String(user.secretaria).trim() : '');
}
function bucketKey(doc, user) {
    const sec = docBucketSecretaria(doc, user);
    const year = doc.yearlyReset ? new Date().getFullYear() : 0;
    return `${doc.id}|${sec}|${year}`;
}
function bucketKeyFor(doc, secretaria) {
    const sec = doc.perSecretaria ? (secretaria || '') : '';
    const year = doc.yearlyReset ? new Date().getFullYear() : 0;
    return `${doc.id}|${sec}|${year}`;
}
function nextNumberFor(doc) {
    const v = state.counters[bucketKey(doc, state.currentUser)];
    return (v !== undefined && v !== null) ? v : doc.startNumber;
}
function blockedBySecretaria(doc) {
    return doc.perSecretaria && !docBucketSecretaria(doc, state.currentUser);
}
function formatNumber(doc, num) {
    const n = (num !== undefined ? num : nextNumberFor(doc));
    const padded = String(n).padStart(3, '0');
    const yearSuffix = doc.yearlyReset ? `/${new Date().getFullYear()}` : '';
    return doc.prefix ? `${doc.prefix} ${padded}${yearSuffix}` : `${padded}${yearSuffix}`;
}

function getVisibleDocuments() {
    const u = state.currentUser;
    let docs = state.documents.filter(d => d.enabled);
    if (u.role === 'admin' || u.role === 'user_full') return docs;
    if (!u.allowedDocuments || u.allowedDocuments.length === 0) return [];
    return docs.filter(d => u.allowedDocuments.includes(d.id));
}
function canReserve(docId) {
    const u = state.currentUser;
    if (u.role === 'user_readonly') return false;
    const doc = state.documents.find(d => d.id === docId);
    if (doc && blockedBySecretaria(doc)) return false;
    if (u.role === 'admin' || u.role === 'user_full') return true;
    return u.allowedDocuments && u.allowedDocuments.includes(docId);
}

// Histórico: admin vê tudo; documento geral (não per_secretaria) é público;
// documento por secretaria fica restrito à secretaria (sem secretaria: só as próprias).
function getVisibleReservations() {
    const u = state.currentUser;
    if (!u) return [];
    if (u.role === 'admin') return state.reservations;
    return state.reservations.filter(r => {
        const doc = state.documents.find(d => d.id === r.docId);
        if (doc && !doc.perSecretaria) return true;
        if (u.secretaria) return r.userSecretaria === u.secretaria;
        return r.userId === u.id;
    });
}
function canEditReservation(r) { return state.currentUser && r.userId === state.currentUser.id; }
function canCancelReservation(r) { const u = state.currentUser; return u && (u.role === 'admin' || r.userId === u.id); }

function getFilteredReservations() {
    const f = state.filters;
    let list = getVisibleReservations();
    if (f.tipo) list = list.filter(r => r.docName === f.tipo);
    if (f.sec) list = list.filter(r => (r.userSecretaria || '') === f.sec);
    if (f.from) list = list.filter(r => isoDate(r.timestamp) >= f.from);
    if (f.to) list = list.filter(r => isoDate(r.timestamp) <= f.to);
    if (f.search) {
        const q = f.search.toLowerCase();
        list = list.filter(r => `${r.formattedNumber} ${r.subject || ''} ${r.userName} ${r.docName} ${r.userSecretaria || ''} ${r.destNome || ''} ${r.destSecretaria || ''} ${r.destSetor || ''} ${r.observacoes || ''}`.toLowerCase().includes(q));
    }
    return list;
}

// ============================================================
// Autenticação / bootstrap
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (!supabase && window.supabase) supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        if (!supabase) throw new Error('Falha ao inicializar Supabase');
        const savedZoom = parseInt(localStorage.getItem('zoomLevel') || '100', 10);
        if (savedZoom >= 80 && savedZoom <= 150) state.zoom = savedZoom;
        await loadData();
        await checkAutoLogin();
    } catch (e) {
        console.error('Fatal:', e);
        document.getElementById('app-root').innerHTML = `<div style="padding:40px;color:#b91c1c;font-family:sans-serif;">Erro ao iniciar: ${esc(e.message)}</div>`;
    }
});

async function checkAutoLogin() {
    try {
        const user = await authService.getCurrentUser();
        if (user) { state.currentUser = user; await ensureCardOrderSynced(); render(); }
        else showLoginView();
    } catch (e) { console.error(e); showLoginView(); }
}

async function handleLogin(e) {
    e.preventDefault();
    const id = document.getElementById('loginUsername').value;
    const pw = document.getElementById('loginPassword').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.textContent; btn.textContent = 'Entrando...'; btn.disabled = true;
    const result = await authService.signIn(id, pw);
    if (result.user) {
        state.currentUser = result.user;
        addLog('sistema', 'Login realizado', `${result.user.name} acessou o sistema`);
        await loadData();
        await ensureCardOrderSynced();
        state.view = 'inicio';
        render();
    } else {
        showToast(result.error || 'Credenciais inválidas.', 'error');
        btn.textContent = original; btn.disabled = false;
    }
}

async function handleLogout() {
    if (state.currentUser) addLog('sistema', 'Logout realizado', `${state.currentUser.name} saiu`);
    await authService.signOut();
    state.currentUser = null;
    showLoginView();
}

function showLoginView() {
    document.getElementById('app-root').innerHTML = `
      <div class="login-wrap">
        <div class="login-blob login-blob--1"></div>
        <div class="login-blob login-blob--2"></div>
        <div class="login-card">
          <img src="logo.png" alt="Prefeitura de Cataguases" class="login-logo">
          <div class="login-title brand-wordmark">Numera</div>
          <div class="login-tagline">Numeração oficial de documentos</div>
          <div class="login-sub">Prefeitura de Cataguases</div>
          <form onsubmit="handleLogin(event)" class="login-form">
            <label class="field-label">Usuário ou e-mail</label>
            <input id="loginUsername" class="field-input" required autocomplete="username" placeholder="seu.usuario">
            <label class="field-label">Senha</label>
            <input id="loginPassword" type="password" class="field-input" required autocomplete="current-password" placeholder="••••••••">
            <button type="submit" class="btn btn-primary btn-block" style="margin-top:14px;">Entrar</button>
          </form>
          <button type="button" class="login-link" onclick="openRegisterModal()">Não tem conta? <b>Criar conta</b></button>
        </div>
      </div>`;
}

// ============================================================
// Cadastro de novo usuário (a partir da tela de login)
// ============================================================
async function openRegisterModal() {
    // Busca a lista real de secretarias mesmo sem sessão (best-effort;
    // sem isso o formulário mostraria só a lista padrão de fallback).
    try {
        const { data } = await supabase.from('app_config').select('*').eq('key', 'secretaria_list').single();
        if (data && Array.isArray(data.value) && data.value.length) state.secretariats = [...data.value].sort();
    } catch (e) { /* mantém o fallback em state.secretariats */ }
    renderRegisterModal();
}

function renderRegisterModal() {
    const secOptions = state.secretariats.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    openModal(`
      <div class="reserve-modal">
        <div class="reserve-eyebrow brand-wordmark" style="font-weight:800;">Numera</div>
        <div class="reserve-name">Criar conta</div>
        <div class="field"><label class="field-label">Nome completo *</label>
          <input id="regName" class="field-input" placeholder="Ex: Maria Souza"></div>
        <div class="grid-2-mini">
          <div class="field"><label class="field-label">E-mail *</label>
            <input id="regEmail" type="email" class="field-input" placeholder="maria@exemplo.com"></div>
          <div class="field"><label class="field-label">Usuário *</label>
            <input id="regUsername" class="field-input" placeholder="maria.souza"></div>
        </div>
        <div class="grid-2-mini">
          <div class="field"><label class="field-label">Senha *</label>
            <input id="regPassword" type="password" class="field-input" placeholder="Mínimo 6 caracteres"></div>
          <div class="field"><label class="field-label">Confirmar senha *</label>
            <input id="regPassword2" type="password" class="field-input" placeholder="Repita a senha"></div>
        </div>
        <div class="grid-2-mini">
          <div class="field"><label class="field-label">Cargo *</label>
            <input id="regCargo" class="field-input" placeholder="Ex: Assistente Administrativo"></div>
          <div class="field"><label class="field-label">Setor *</label>
            <input id="regSetor" class="field-input" placeholder="Ex: Protocolo"></div>
        </div>
        <div class="field"><label class="field-label">Secretaria *</label>
          <select id="regSecretaria" class="field-input"><option value="">Selecione...</option>${secOptions}</select></div>
        <div class="reserve-actions">
          <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" style="flex:1.4" onclick="confirmRegister()">Criar conta</button>
        </div>
      </div>`, { width: 460 });
}

async function confirmRegister() {
    const val = (id) => document.getElementById(id).value.trim();
    const name = val('regName'), email = val('regEmail'), username = val('regUsername');
    const p1 = document.getElementById('regPassword').value, p2 = document.getElementById('regPassword2').value;
    const cargo = val('regCargo'), setor = val('regSetor'), secretaria = document.getElementById('regSecretaria').value;
    const invalid = (id) => document.getElementById(id).classList.add('field-input--invalid');
    let bad = false;
    [['regName', name], ['regEmail', email], ['regUsername', username], ['regCargo', cargo], ['regSetor', setor]]
        .forEach(([id, v]) => { if (!v) { invalid(id); bad = true; } });
    if (!secretaria) { invalid('regSecretaria'); bad = true; }
    if (!p1) invalid('regPassword');
    if (!p2) invalid('regPassword2');
    if (!p1 || !p2) bad = true;
    if (bad) { showToast('Preencha todos os campos.', 'warning'); return; }
    if (p1 !== p2) { invalid('regPassword'); invalid('regPassword2'); showToast('As senhas não coincidem.', 'warning'); return; }
    if (p1.length < 6) { invalid('regPassword'); showToast('A senha deve ter pelo menos 6 caracteres.', 'warning'); return; }

    const btn = document.querySelector('#overlay-root .reserve-actions .btn-primary');
    const original = btn.textContent; btn.textContent = 'Cadastrando...'; btn.disabled = true;

    // Já nasce com os documentos padrão da secretaria escolhida (editável
    // depois pelo admin em Configurações → Usuários).
    const allowedDocuments = state.secretariaPermissions[secretaria] || [];
    const result = await authService.signUp({ name, email, username, password: p1, cargo, setor, secretaria, allowedDocuments });
    if (result.error) {
        showToast('Erro no cadastro: ' + result.error, 'error', 0);
        btn.textContent = original; btn.disabled = false;
    } else {
        closeModal();
        showToast(result.message || 'Cadastro realizado! Aguarde aprovação do administrador.', 'success', 6000);
        const loginField = document.getElementById('loginUsername');
        if (loginField) loginField.value = email;
    }
}

// ============================================================
// Shell (sidebar + main) e navegação
// ============================================================
function setView(v) { state.view = v; render(); }
function toggleCollapse() { state.collapsed = !state.collapsed; render(); }
function setZoom(delta) {
    state.zoom = Math.max(80, Math.min(150, state.zoom + delta));
    localStorage.setItem('zoomLevel', String(state.zoom));
    applyZoom();
}
function resetZoom() { state.zoom = 100; localStorage.setItem('zoomLevel', '100'); applyZoom(); }
function applyZoom() {
    const wrap = document.getElementById('content-zoom');
    if (wrap) wrap.style.zoom = state.zoom / 100;
    document.querySelectorAll('[data-zoom-label]').forEach(el => { el.textContent = state.zoom + '%'; });
}

function navItemsFor(user) {
    const items = [
        { id: 'inicio', label: 'Início' },
        { id: 'gerar', label: 'Gerar Número' },
        { id: 'historico', label: 'Histórico' },
        { id: 'tipos', label: 'Tipos' },
        { id: 'relatorios', label: 'Relatórios' },
        { id: 'config', label: 'Configurações' }
    ];
    return items;
}

function render() {
    if (!state.currentUser) { showLoginView(); return; }
    const u = state.currentUser;
    const collapsed = state.collapsed;
    const asideW = collapsed ? 78 : 236;

    const nav = navItemsFor(u).map(it => {
        const active = state.view === it.id;
        return `<button class="nav-item ${active ? 'nav-item--active' : ''} ${collapsed ? 'nav-item--collapsed' : ''}" title="${esc(it.label)}" onclick="setView('${it.id}')">
            ${icon(it.id)}${collapsed ? '' : `<span>${esc(it.label)}</span>`}
        </button>`;
    }).join('');

    const viewHtml = ({
        inicio: renderInicio, gerar: renderGerar, historico: renderHistorico,
        tipos: renderTipos, relatorios: renderRelatorios, config: renderConfig
    }[state.view] || renderInicio)();

    document.getElementById('app-root').innerHTML = `
      <div class="app-shell">
        <div class="blob blob--1"></div><div class="blob blob--2"></div><div class="blob blob--3"></div>

        <aside class="sidebar ${collapsed ? 'sidebar--collapsed' : ''}" style="width:${asideW}px">
          <div class="brand ${collapsed ? 'brand--center' : ''}">
            <img src="logo.png" alt="Prefeitura" class="brand-logo">
            ${collapsed ? '' : `<div class="brand-text"><div class="brand-name brand-wordmark">Numera</div><div class="brand-sub">Prefeitura de Cataguases</div></div>`}
          </div>
          <button class="collapse-btn ${collapsed ? 'collapse-btn--center' : ''}" onclick="toggleCollapse()" title="Recolher menu">
            <span class="collapse-chevron ${collapsed ? 'collapse-chevron--flip' : ''}">${icon('chevron', 18, 2)}</span>${collapsed ? '' : '<span>Recolher</span>'}
          </button>
          <nav class="nav">${nav}</nav>
          <div class="user-chip ${collapsed ? 'user-chip--center' : ''}" title="${esc(u.name)}">
            <div class="avatar">${esc(initials(u.name))}</div>
            ${collapsed ? '' : `<div class="user-meta"><div class="user-name">${esc(u.name)}</div><div class="user-role">${esc(u.secretaria || PERMISSION_LEVELS[u.role]?.label || '')}</div></div>
            <button class="logout-btn" onclick="handleLogout()" title="Sair">${icon('logout', 16, 2)}</button>`}
          </div>
        </aside>

        <main class="main" style="left:${asideW}px">
          <div id="content-zoom" style="zoom:${state.zoom / 100}">${viewHtml}</div>
        </main>

        <div class="zoom-pill">
          <button onclick="setZoom(-10)" title="Diminuir">A−</button>
          <button id="zoomLabel" data-zoom-label onclick="resetZoom()" title="Redefinir zoom">${state.zoom}%</button>
          <button onclick="setZoom(10)" title="Aumentar">A+</button>
        </div>

        <nav class="tabbar">
          ${tabButton('inicio', 'Início', state.view === 'inicio')}
          ${tabButton('gerar', 'Gerar', state.view === 'gerar')}
          ${tabButton('historico', 'Histórico', state.view === 'historico')}
          <button class="tab ${['tipos', 'relatorios', 'config'].includes(state.view) ? 'tab--active' : ''}" onclick="openMoreSheet()">
            ${icon('list', 23, 2)}<span>Mais</span></button>
        </nav>
      </div>`;
}

function tabButton(id, label, active) {
    return `<button class="tab ${active ? 'tab--active' : ''}" onclick="setView('${id}')">${icon(id, 23, 2)}<span>${esc(label)}</span></button>`;
}

// Bottom sheet "Mais" (mobile) — acesso a todas as telas + zoom + sair.
function openMoreSheet() {
    const u = state.currentUser;
    const link = (id, label) => `<button class="sheet-item ${state.view === id ? 'sheet-item--active' : ''}" onclick="closeModal(); setView('${id}')">${icon(id, 20, 1.9)}<span>${esc(label)}</span></button>`;
    openModal(`
      <div class="sheet-head">
        <div class="avatar avatar--lg">${esc(initials(u.name))}</div>
        <div><div class="sheet-name">${esc(u.name)}</div><div class="sheet-sub">${esc(u.secretaria || PERMISSION_LEVELS[u.role]?.label || '')}</div></div>
      </div>
      <div class="sheet-nav">
        ${link('inicio', 'Início')}${link('gerar', 'Gerar Número')}${link('historico', 'Histórico')}
        ${link('tipos', 'Tipos')}${link('relatorios', 'Relatórios')}${link('config', 'Configurações')}
      </div>
      <div class="sheet-zoom"><span>Tamanho do texto</span>
        <div class="zoom-inline"><button onclick="setZoom(-10)">A−</button><span data-zoom-label>${state.zoom}%</span><button onclick="setZoom(10)">A+</button></div>
      </div>
      <button class="btn btn-ghost btn-block" onclick="closeModal(); handleLogout()">${icon('logout', 15, 2)} Sair</button>
    `, { width: 460, sheet: true });
}

// ============================================================
// View: Início (Dashboard) — estatísticas reais
// ============================================================
function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
function dataExtenso() {
    return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function renderInicio() {
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    const visible = getVisibleReservations();
    const ativas = visible.filter(r => r.status !== 'anulada');
    const noAno = ativas.filter(r => new Date(r.timestamp).getFullYear() === year);
    const noMes = noAno.filter(r => new Date(r.timestamp).getMonth() === month);
    const dayOfYear = Math.max(1, Math.ceil((Date.now() - new Date(year, 0, 0)) / 86400000));
    const media = (noAno.length / dayOfYear).toFixed(1).replace('.', ',');
    const tiposAtivos = state.documents.filter(d => d.enabled).length;

    const stat = (label, value, sub, hue, ic) => `
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-label">${esc(label)}</span>
          <span class="stat-icon" style="background:hsl(${hue} 85% 93%);color:hsl(${hue} 72% 45%)">${ic}</span></div>
        <div class="stat-value">${esc(value)}</div>
        <div class="stat-sub">${esc(sub)}</div>
      </div>`;

    const stats = `<div class="grid-4">
      ${stat('Total em ' + year, noAno.length.toLocaleString('pt-BR'), 'documentos numerados', 210, icon('tipos', 16, 2))}
      ${stat('Este mês', noMes.length.toLocaleString('pt-BR'), 'no mês atual', 265, icon('historico', 16, 2))}
      ${stat('Média por dia', media, 'documentos / dia', 145, icon('relatorios', 16, 2))}
      ${stat('Tipos ativos', tiposAtivos, 'categorias de documento', 35, icon('list', 16, 2))}
    </div>`;

    // Documentos por mês (ano atual)
    const monthsPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const byMonth = Array(month + 1).fill(0);
    noAno.forEach(r => { const m = new Date(r.timestamp).getMonth(); if (m <= month) byMonth[m]++; });
    const maxM = Math.max(1, ...byMonth);
    const bars = byMonth.map((v, i) => {
        const h = (28 + (v / maxM) * 72);
        const fill = i === month ? 'linear-gradient(180deg,#1a86ff,#0071e3)' : 'linear-gradient(180deg,#8fc3ff,#4a9dff)';
        return `<div class="bar-col"><div class="bar-val">${v}</div><div class="bar" style="height:${h}%;background:${fill}"></div><div class="bar-label">${monthsPt[i]}</div></div>`;
    }).join('');

    // Por tipo
    const tipoCount = {};
    ativas.forEach(r => { tipoCount[r.docName] = (tipoCount[r.docName] || 0) + 1; });
    const porTipo = Object.entries(tipoCount).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const maxT = Math.max(1, ...porTipo.map(t => t[1]));
    const tipoBars = porTipo.length ? porTipo.map(([name, v]) => {
        const h = docHue(name);
        return `<div><div class="hbar-head"><span>${esc(name)}</span><span class="hbar-v">${v}</span></div>
          <div class="hbar-track"><div class="hbar-fill" style="width:${v / maxT * 100}%;background:linear-gradient(90deg,hsl(${h} 78% 62%),hsl(${h} 74% 50%))"></div></div></div>`;
    }).join('') : '<div class="empty-mini">Sem reservas ainda.</div>';

    // Por secretaria
    const secCount = {};
    ativas.forEach(r => { const s = r.userSecretaria || '(sem secretaria)'; secCount[s] = (secCount[s] || 0) + 1; });
    const porSec = Object.entries(secCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxS = Math.max(1, ...porSec.map(s => s[1]));
    const secBars = porSec.length ? porSec.map(([name, v]) => `
      <div><div class="hbar-head"><span>${esc(name)}</span><span class="hbar-v">${v}</span></div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${v / maxS * 100}%;background:linear-gradient(90deg,#5856d6,#7d7bff)"></div></div></div>`).join('') : '<div class="empty-mini">Sem reservas ainda.</div>';

    // Últimos gerados
    const recent = visible.slice(0, 5).map(r => `
      <div class="recent-row">
        <div class="chip" style="${chipStyle(r.docName)}">${esc(docAbbr({ prefix: '', name: r.docName }))}</div>
        <div class="recent-mid"><div class="recent-num ${r.status === 'anulada' ? 'struck' : ''}">${esc(r.formattedNumber)}</div>
          <div class="recent-sub">${esc(r.subject || 'Sem assunto')}</div></div>
        <div class="recent-right"><div class="recent-sec">${esc(r.userSecretaria || '—')}</div><div class="recent-date">${brDate(r.timestamp)}</div></div>
      </div>`).join('') || '<div class="empty-mini">Nenhuma reserva ainda.</div>';

    return `<div class="view">
      <div class="page-head">
        <div>
          <div class="page-eyebrow">${esc(dataExtenso())}</div>
          <div class="greeting">${saudacao()}, ${esc((state.currentUser.name || '').split(' ')[0])}</div>
          <div class="page-sub">Visão geral da numeração de documentos oficiais</div>
        </div>
        <button class="btn btn-primary btn-pill" onclick="setView('gerar')">${icon('plus', 17, 2.4)} Gerar Número</button>
      </div>
      ${stats}
      <div class="grid-chart">
        <div class="card">
          <div class="card-head"><div class="card-title">Documentos por mês</div><div class="card-note">${year}</div></div>
          <div class="bars">${bars}</div>
        </div>
        <div class="card">
          <div class="card-title" style="margin-bottom:16px;">Por tipo de documento</div>
          <div class="hbars">${tipoBars}</div>
        </div>
      </div>
      <div class="grid-bottom">
        <div class="card">
          <div class="card-title" style="margin-bottom:16px;">Por secretaria</div>
          <div class="hbars">${secBars}</div>
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">Últimos números gerados</div>
            <button class="link-btn" onclick="setView('historico')">Ver histórico</button></div>
          <div class="recent">${recent}</div>
        </div>
      </div>
    </div>`;
}

// ============================================================
// View: Gerar Número
// ============================================================
// Ordem dos cards personalizada por usuário. Fonte da verdade: coluna
// users.card_order (migração 0007) — a preferência acompanha a conta em
// qualquer dispositivo. Fallback para localStorage enquanto a migração não
// estiver aplicada (ou se a gravação no banco falhar).
function cardOrderKey() { return 'cardOrder:' + (state.currentUser?.id || 'anon'); }
function getCardOrder() {
    const dbOrder = (state.currentUser && Array.isArray(state.currentUser.cardOrder)) ? state.currentUser.cardOrder : [];
    if (dbOrder.length) return dbOrder;
    try { return JSON.parse(localStorage.getItem(cardOrderKey())) || []; } catch (e) { return []; }
}
function hasCustomOrder() { return getCardOrder().length > 0; }

// Salva a ordem no banco (users.card_order). Atualiza o estado local na hora
// e, se o banco falhar (coluna ausente antes da 0007), cai no localStorage.
async function saveCardOrder(ids) {
    if (state.currentUser) state.currentUser.cardOrder = ids;
    try {
        if (!state.currentUser) throw new Error('sem usuário');
        const { error } = await supabase.from('users').update({ card_order: ids }).eq('id', state.currentUser.id);
        if (error) throw error;
        localStorage.removeItem(cardOrderKey()); // fonte agora é o banco
    } catch (e) {
        console.warn('Ordem dos cards salva localmente (aplique a migração 0007):', e.message);
        localStorage.setItem(cardOrderKey(), JSON.stringify(ids));
    }
}

// Migração suave: se o usuário já tinha uma ordem só no localStorage (versão
// anterior) e o banco está vazio, sobe essa ordem para o banco uma vez.
async function ensureCardOrderSynced() {
    if (!state.currentUser) return;
    const dbEmpty = !Array.isArray(state.currentUser.cardOrder) || state.currentUser.cardOrder.length === 0;
    let local = [];
    try { local = JSON.parse(localStorage.getItem(cardOrderKey())) || []; } catch (e) { }
    if (dbEmpty && local.length) await saveCardOrder(local);
}
// Documentos visíveis reordenados pela preferência do usuário; novos tipos
// (ainda sem posição salva) entram no fim, em ordem alfabética (padrão).
function orderedGerarDocs() {
    const docs = getVisibleDocuments();
    const order = getCardOrder();
    const byId = {}; docs.forEach(d => { byId[d.id] = d; });
    const result = [];
    order.forEach(id => { if (byId[id]) { result.push(byId[id]); delete byId[id]; } });
    Object.values(byId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).forEach(d => result.push(d));
    return result;
}

// Reordenação por ponteiro (mouse + toque) iniciada por uma alça dedicada,
// para funcionar bem no celular sem conflitar com a rolagem.
let _drag = null;
function cardHandleDown(e, id) {
    e.preventDefault(); e.stopPropagation();
    const grid = document.getElementById('docGrid');
    const card = grid && grid.querySelector(`.doc-card[data-docid="${id}"]`);
    if (!card) return;
    _drag = { card, handle: e.currentTarget };
    card.classList.add('dragging');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { }
    e.currentTarget.addEventListener('pointermove', cardHandleMove);
    e.currentTarget.addEventListener('pointerup', cardHandleUp);
    e.currentTarget.addEventListener('pointercancel', cardHandleUp);
}
function cardHandleMove(e) {
    if (!_drag) return;
    e.preventDefault();
    const grid = document.getElementById('docGrid');
    if (!grid) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const target = under && under.closest('.doc-card');
    if (!target || target === _drag.card || target.parentElement !== grid) return;
    const box = target.getBoundingClientRect();
    const before = e.clientY < box.top + box.height / 2
        || (Math.abs(e.clientY - (box.top + box.height / 2)) < box.height / 2 && e.clientX < box.left + box.width / 2);
    grid.insertBefore(_drag.card, before ? target : target.nextSibling);
}
function cardHandleUp() {
    const h = _drag && _drag.handle;
    if (h) { h.removeEventListener('pointermove', cardHandleMove); h.removeEventListener('pointerup', cardHandleUp); h.removeEventListener('pointercancel', cardHandleUp); }
    if (!_drag) return;
    _drag.card.classList.remove('dragging');
    _drag = null;
    const grid = document.getElementById('docGrid');
    if (!grid) return;
    const ids = [...grid.querySelectorAll('.doc-card[data-docid]')].map(el => el.getAttribute('data-docid'));
    saveCardOrder(ids);  // persiste no banco (users.card_order)
    render();            // reflete a nova ordem + mostra o botão de restaurar
}
function resetCardOrder() {
    saveCardOrder([]);   // ordem padrão = vazio no banco
    showToast('Ordem padrão restaurada.', 'success', 2000);
    render();
}

function renderGerar() {
    const docs = orderedGerarDocs();
    const cards = docs.map(d => {
        const blocked = blockedBySecretaria(d);
        const display = blocked ? '—' : formatNumber(d);
        let btn;
        if (blocked) btn = `<button class="reserve-btn reserve-btn--off" disabled title="Defina sua secretaria no perfil">${icon('building', 15, 2)} Defina sua secretaria</button>`;
        else if (canReserve(d.id)) btn = `<button class="reserve-btn" onclick="openReserve('${d.id}')">${icon('plus', 15, 2.3)} Reservar</button>`;
        else btn = `<button class="reserve-btn reserve-btn--off" disabled>🔒 Sem permissão</button>`;
        return `<div class="doc-card" data-docid="${d.id}">
          <div class="doc-card-top">
            <div class="doc-tags">
              <span class="doc-chip-mini" style="${chipStyle(d.name)}">${esc(docAbbr(d))}</span>
              ${d.perSecretaria ? '<span class="tag-persec">por secretaria</span>' : ''}
            </div>
            <button class="drag-handle" aria-label="Reordenar" title="Arraste para reordenar" onpointerdown="cardHandleDown(event,'${d.id}')" onclick="event.preventDefault()">${icon('grip', 16, 2.6)}</button>
          </div>
          <div class="doc-info">
            <div class="doc-name">${esc(d.name)}</div>
            <div class="doc-number">${esc(display)}</div>
          </div>
          ${btn}
        </div>`;
    }).join('') || '<div class="empty">Nenhum documento disponível para você.</div>';

    const resetBtn = hasCustomOrder()
        ? `<button class="btn-reset-order" onclick="resetCardOrder()" title="Voltar à ordem padrão (alfabética)">↺ Ordem padrão</button>`
        : '';

    return `<div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">Gerar Número</div>
          <div class="page-sub">Selecione um tipo de documento para reservar · arraste os cards para reorganizar</div>
        </div>
        ${resetBtn}
      </div>
      <div class="doc-grid" id="docGrid">${cards}</div>
    </div>`;
}

// ============================================================
// Reserva (modal com destinatário obrigatório)
// ============================================================
function openReserve(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc || !canReserve(docId)) return;
    const next = formatNumber(doc);
    const secOptions = [...state.secretariats, DEST_EXTERNO].map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    openModal(`
      <div class="reserve-modal">
        <div class="reserve-head">
          <div class="chip chip--xl" style="${chipStyle(doc.name)}">${esc(docAbbr(doc))}</div>
          <div><div class="reserve-eyebrow">Reservar número</div><div class="reserve-name">${esc(doc.name)}</div></div>
        </div>
        <div class="reserve-next"><div class="reserve-next-label">Próximo número</div><div class="reserve-next-val">${esc(next)}</div></div>
        <div class="field"><label class="field-label">Ementa *</label>
          <textarea id="rvSubject" class="field-input" rows="2" placeholder="Descreva o assunto do documento"></textarea></div>
        <div class="field"><label class="field-label">Secretaria de destino *</label>
          <select id="rvDestSec" class="field-input"><option value="">Selecione...</option>${secOptions}</select></div>
        <div class="field"><label class="field-label">Setor (opcional)</label>
          <input id="rvDestSetor" class="field-input" placeholder="Ex: Departamento Financeiro"></div>
        <div class="field"><label class="field-label">Nome do destinatário *</label>
          <input id="rvDestNome" class="field-input" placeholder="Ex: João da Silva"></div>
        <div class="field"><label class="field-label">Observações (opcional)</label>
          <textarea id="rvObs" class="field-input" rows="2" placeholder="Alguma observação sobre este documento"></textarea></div>
        <div class="reserve-actions">
          <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" style="flex:1.4" onclick="confirmReserve('${doc.id}')">Confirmar reserva</button>
        </div>
      </div>`, { width: 430 });
}

async function confirmReserve(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;
    const subject = document.getElementById('rvSubject').value.trim();
    const destSec = document.getElementById('rvDestSec').value;
    const destSetor = document.getElementById('rvDestSetor').value.trim();
    const destNome = document.getElementById('rvDestNome').value.trim();
    const observacoes = document.getElementById('rvObs').value.trim();
    const invalid = (el) => el.classList.add('field-input--invalid');
    let bad = false;
    if (!subject) { invalid(document.getElementById('rvSubject')); bad = true; }
    if (!destSec) { invalid(document.getElementById('rvDestSec')); bad = true; }
    if (!destNome) { invalid(document.getElementById('rvDestNome')); bad = true; }
    if (bad) { showToast('Preencha ementa, secretaria de destino e destinatário.', 'warning'); return; }

    try {
        const { data, error } = await supabase.rpc('reserve_number', {
            p_doc_id: doc.id, p_user_id: state.currentUser.id,
            p_subject: subject, p_dest_secretaria: destSec, p_dest_nome: destNome,
            p_dest_setor: destSetor, p_observacoes: observacoes
        });
        if (error) {
            const missing = error.code === 'PGRST202' || (/reserve_number/.test(error.message || '') && /not find|schema cache/i.test(error.message || ''));
            throw new Error(missing ? 'Sistema de reserva desatualizado. Aplique as migrações no Supabase.' : error.message);
        }
        const row = mapReservationRow(data);
        const bucketYear = doc.yearlyReset ? new Date().getFullYear() : 0;
        state.counters[`${doc.id}|${row.bucketSecretaria}|${bucketYear}`] = row.number + 1;
        state.reservations.unshift(row);
        closeModal();
        state.view = 'historico';
        render();
        refreshLogs();
        showToast(`Número reservado — ${row.formattedNumber}`, 'success', 6000, {
            label: 'Copiar', onClick: async (b) => { const ok = await copyToClipboard(row.formattedNumber); b.textContent = ok ? 'Copiado ✓' : 'Falhou'; }
        });
    } catch (err) {
        console.error('Reserva:', err);
        showToast('Erro ao reservar: ' + err.message, 'error', 0);
    }
}

// ============================================================
// View: Histórico
// ============================================================
function renderHistorico() {
    const f = state.filters;
    const typeOpts = state.documents.map(d => d.name).sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map(n => `<option value="${esc(n)}" ${f.tipo === n ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const secOpts = state.secretariats.map(s => `<option value="${esc(s)}" ${f.sec === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const u = state.currentUser;
    const scope = u.role === 'admin' ? 'Todas as secretarias'
        : u.secretaria ? `Documentos gerais + secretaria ${u.secretaria}` : 'Documentos gerais + suas reservas';

    return `<div class="view">
      <div class="page-head">
        <div><div class="page-title">Histórico</div><div class="page-sub" id="histLabel">${scope}</div></div>
        <div class="head-actions">
          <button class="btn btn-ghost btn-sm filters-toggle" id="filtersToggleBtn" onclick="toggleFilters()">${icon('list', 15, 2)} Filtros</button>
          <button class="btn btn-ghost btn-pill" onclick="clearFilters()">Limpar</button>
        </div>
      </div>
      <div class="card filter-bar" id="filterBar">
        <div class="field field--search"><label class="field-label">Buscar</label>
          <div class="search-box">${icon('search', 15, 2)}<input id="fSearch" value="${esc(f.search)}" oninput="onFilter('search',this.value)" placeholder="Número, assunto, usuário"></div></div>
        <div class="field filter-adv"><label class="field-label">Tipo</label>
          <select class="field-input" onchange="onFilter('tipo',this.value)"><option value="">Todos os tipos</option>${typeOpts}</select></div>
        <div class="field filter-adv"><label class="field-label">Secretaria</label>
          <select class="field-input" onchange="onFilter('sec',this.value)"><option value="">Todas</option>${secOpts}</select></div>
        <div class="field filter-adv"><label class="field-label">De</label>
          <input type="date" class="field-input" value="${esc(f.from)}" oninput="onFilter('from',this.value)"></div>
        <div class="field filter-adv"><label class="field-label">Até</label>
          <input type="date" class="field-input" value="${esc(f.to)}" oninput="onFilter('to',this.value)"></div>
      </div>
      <div class="card table-card">
        <div class="table-head">
          <span>Número</span><span>Assunto</span><span>Secretaria</span><span>Usuário</span><span style="text-align:right;">Data</span>
        </div>
        <div id="histRows">${renderHistRows()}</div>
      </div>
    </div>`;
}

function renderHistRows() {
    const list = getFilteredReservations().slice(0, 200);
    const lbl = document.getElementById('histLabel');
    if (lbl) { /* label kept as scope; count shown in page-sub is optional */ }
    if (list.length === 0) return '<div class="table-empty">Nenhum documento encontrado para os filtros aplicados.</div>';
    return list.map(r => {
        const anulada = r.status === 'anulada';
        const canEdit = !anulada && canEditReservation(r);
        const canCancel = !anulada && canCancelReservation(r);
        const actions = (canEdit || canCancel) ? `<span class="row-actions">
            ${canEdit ? `<button class="icon-btn-sm" title="Editar" onclick="event.stopPropagation();editReservation('${r.id}')">${icon('edit', 14, 2)}</button>` : ''}
            ${canCancel ? `<button class="icon-btn-sm danger" title="Anular" onclick="event.stopPropagation();cancelReservation('${r.id}')">${icon('ban', 14, 2)}</button>` : ''}
          </span>` : '';
        return `<div class="table-row table-row--clickable ${anulada ? 'table-row--anulada' : ''}" onclick="showReservationDetail('${r.id}')" title="Ver detalhes">
          <span class="cell-num ${anulada ? 'struck' : ''}">${esc(r.formattedNumber)}${anulada ? ' <span class="mini-anulada">ANULADA</span>' : ''}</span>
          <span class="cell-ell" title="${esc(r.subject || '')}${r.destNome ? ' — Para: ' + esc(r.destNome) : ''}">${esc(r.subject || '—')}</span>
          <span class="cell-soft" data-label="Secretaria">${esc(r.userSecretaria || '—')}</span>
          <span class="cell-soft" data-label="Usuário">${esc(r.userName)}</span>
          <span class="cell-date">${brDate(r.timestamp)}${r.editedAt ? ' <span class="mini-editada">(ed.)</span>' : ''}${actions}</span>
        </div>`;
    }).join('');
}

function showReservationDetail(id) {
    const r = state.reservations.find(x => x.id === id);
    if (!r) return;
    const row = (label, value) => value ? `<div class="detail-row"><div class="detail-label">${esc(label)}</div><div class="detail-value">${esc(value)}</div></div>` : '';
    openModal(`
      <div class="reserve-modal">
        <div class="reserve-head">
          <div class="chip chip--xl" style="${chipStyle(r.docName)}">${esc(docAbbr({ name: r.docName, prefix: '' }))}</div>
          <div><div class="reserve-eyebrow">${esc(r.docName)}</div><div class="reserve-name">${esc(r.formattedNumber)}</div></div>
        </div>
        ${r.status === 'anulada' ? `<div class="detail-banner detail-banner--danger">Anulada${r.cancelReason ? ': ' + esc(r.cancelReason) : ''}</div>` : ''}
        ${row('Ementa', r.subject)}
        ${row('Secretaria de destino', r.destSecretaria)}
        ${row('Setor', r.destSetor)}
        ${row('Destinatário', r.destNome)}
        ${row('Observações', r.observacoes)}
        ${row('Reservado por', r.userName + (r.userSecretaria ? ' — ' + r.userSecretaria : ''))}
        ${row('Data', `${brDate(r.timestamp)} ${formatTime(r.timestamp)}`)}
        ${r.editedAt ? row('Editado em', `${brDate(r.editedAt)} ${formatTime(r.editedAt)}`) : ''}
        <div class="reserve-actions"><button class="btn btn-primary" style="flex:1" onclick="closeModal()">Fechar</button></div>
      </div>`, { width: 430 });
}

function onFilter(key, value) {
    state.filters[key] = value;
    const rows = document.getElementById('histRows');
    if (rows) rows.innerHTML = renderHistRows();
}
function clearFilters() {
    state.filters = { search: '', tipo: '', sec: '', from: '', to: '' };
    if (state.view === 'historico') render();
}
// Mostra/esconde os filtros avançados no celular (search fica sempre visível)
function toggleFilters() {
    const el = document.getElementById('filterBar');
    if (el) el.classList.toggle('filter-bar--open');
    const b = document.getElementById('filtersToggleBtn');
    if (b) b.classList.toggle('active');
}

async function cancelReservation(id) {
    const r = state.reservations.find(x => x.id === id);
    if (!r || !canCancelReservation(r) || r.status === 'anulada') return;
    const res = await showConfirmDialog({
        title: 'Anular reserva', variant: 'danger', confirmText: 'Anular número', cancelText: 'Voltar',
        message: `Anular ${r.formattedNumber} (${r.docName})? O número permanece no histórico como anulado e não será reutilizado.`,
        fields: [{ name: 'reason', label: 'Motivo da anulação', type: 'textarea', required: true, placeholder: 'Ex: documento emitido em duplicidade' }]
    });
    if (!res.confirmed) return;
    try {
        const { data, error } = await supabase.rpc('cancel_reservation', { p_reservation_id: id, p_user_id: state.currentUser.id, p_reason: res.values.reason });
        if (error) throw error;
        const i = state.reservations.findIndex(x => x.id === id);
        if (i >= 0) state.reservations[i] = mapReservationRow(data);
        const rows = document.getElementById('histRows'); if (rows) rows.innerHTML = renderHistRows();
        refreshLogs();
        showToast(`Reserva ${r.formattedNumber} anulada.`, 'success');
    } catch (err) { showToast('Erro ao anular: ' + err.message, 'error', 0); }
}

async function editReservation(id) {
    const r = state.reservations.find(x => x.id === id);
    if (!r || !canEditReservation(r) || r.status === 'anulada') return;
    const res = await showConfirmDialog({
        title: 'Editar reserva', confirmText: 'Salvar', message: `${r.formattedNumber} — o número não muda, apenas os dados abaixo.`,
        fields: [
            { name: 'subject', label: 'Ementa', type: 'textarea', required: true, value: r.subject || '' },
            { name: 'destSecretaria', label: 'Secretaria de destino', type: 'select', required: true, options: [...state.secretariats, DEST_EXTERNO], value: r.destSecretaria || '' },
            { name: 'destSetor', label: 'Setor (opcional)', type: 'text', required: false, value: r.destSetor || '' },
            { name: 'destNome', label: 'Nome do destinatário', type: 'text', required: true, value: r.destNome || '' },
            { name: 'observacoes', label: 'Observações (opcional)', type: 'textarea', required: false, value: r.observacoes || '' }
        ]
    });
    if (!res.confirmed) return;
    try {
        const { data, error } = await supabase.rpc('update_reservation', {
            p_reservation_id: id, p_user_id: state.currentUser.id,
            p_subject: res.values.subject, p_dest_secretaria: res.values.destSecretaria, p_dest_nome: res.values.destNome,
            p_dest_setor: res.values.destSetor, p_observacoes: res.values.observacoes
        });
        if (error) throw error;
        const i = state.reservations.findIndex(x => x.id === id);
        if (i >= 0) state.reservations[i] = mapReservationRow(data);
        const rows = document.getElementById('histRows'); if (rows) rows.innerHTML = renderHistRows();
        refreshLogs();
        showToast('Reserva atualizada.', 'success');
    } catch (err) { showToast('Erro ao editar: ' + err.message, 'error', 0); }
}

// ============================================================
// View: Tipos de Documento
// ============================================================
function renderTipos() {
    const isAdmin = state.currentUser.role === 'admin';
    const docs = [...state.documents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const rows = docs.map(d => {
        const resetBadge = d.yearly ? '' : '';
        const badge = d.yearlyReset ? '<span class="badge badge--blue">Reinicia anual</span>' : '<span class="badge badge--gray">Sequencial</span>';
        const perSec = d.perSecretaria ? '<span class="badge badge--purple">por secretaria</span>' : '';
        const display = d.perSecretaria
            ? `<a class="link-btn" onclick="setView('config')">por secretaria</a>`
            : formatNumber(d, nextNumberFor(d));
        const adminActions = isAdmin ? `<div class="row-actions">
            <button class="icon-btn-sm" title="${d.enabled ? 'Desativar' : 'Ativar'}" onclick="toggleDoc('${d.id}')">${icon(d.enabled ? 'eye' : 'eyeOff', 15, 2)}</button>
            <button class="icon-btn-sm" title="Editar" onclick="openDocModal('${d.id}')">${icon('edit', 15, 2)}</button>
            <button class="icon-btn-sm danger" title="Excluir" onclick="deleteDoc('${d.id}')">${icon('trash', 15, 2)}</button>
          </div>` : '';
        return `<div class="type-row ${d.enabled ? '' : 'type-row--off'}">
          <div class="chip" style="${chipStyle(d.name)}">${esc(docAbbr(d))}</div>
          <div class="type-mid"><div class="type-name">${esc(d.name)}${d.enabled ? '' : ' <span class="mini-anulada">off</span>'}</div>
            <div class="type-prefix">Prefixo: ${esc(d.prefix) || 'Nenhum'}</div></div>
          <div class="type-badges">${perSec}${badge}</div>
          <div class="type-num"><div class="type-num-label">Atual</div><div class="type-num-val">${display}</div></div>
          ${adminActions}
        </div>`;
    }).join('');

    return `<div class="view">
      <div class="page-head">
        <div><div class="page-title">Tipos de Documento</div>
          <div class="page-sub">${state.documents.length} tipos configurados · prefixo e numeração</div></div>
        ${isAdmin ? `<button class="btn btn-primary btn-pill" onclick="openDocModal()">${icon('plus', 16, 2.3)} Novo tipo</button>` : ''}
      </div>
      <div class="card table-card">${rows}</div>
    </div>`;
}

function openDocModal(docId) {
    const editing = !!docId;
    const d = editing ? state.documents.find(x => x.id === docId) : { name: '', prefix: '', startNumber: 1, yearlyReset: true, enabled: true, perSecretaria: false };
    state.editingDocId = docId || null;
    openModal(`
      <div class="modal-title">${editing ? 'Editar' : 'Novo'} tipo de documento</div>
      <div class="field"><label class="field-label">Nome *</label><input id="dfName" class="field-input" value="${esc(d.name)}" placeholder="Ex: Ofício"></div>
      <div class="field"><label class="field-label">Prefixo</label><input id="dfPrefix" class="field-input" value="${esc(d.prefix || '')}" placeholder="Ex: Of."></div>
      <div class="field"><label class="field-label">Número inicial *</label><input id="dfStart" type="number" min="1" class="field-input" value="${d.startNumber || 1}"></div>
      <label class="check-row"><input type="checkbox" id="dfYearly" ${d.yearlyReset ? 'checked' : ''}> <span>Reiniciar numeração a cada ano</span></label>
      <label class="check-row"><input type="checkbox" id="dfPerSec" ${d.perSecretaria ? 'checked' : ''}> <span>Numerar por secretaria (sequência própria por secretaria)</span></label>
      <label class="check-row"><input type="checkbox" id="dfEnabled" ${d.enabled ? 'checked' : ''}> <span>Documento habilitado</span></label>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveDoc()">Salvar</button></div>`, { width: 440 });
}

async function saveDoc() {
    const payload = {
        name: document.getElementById('dfName').value.trim(),
        prefix: document.getElementById('dfPrefix').value.trim(),
        start_number: parseInt(document.getElementById('dfStart').value, 10) || 1,
        yearly_reset: document.getElementById('dfYearly').checked,
        per_secretaria: document.getElementById('dfPerSec').checked,
        enabled: document.getElementById('dfEnabled').checked
    };
    if (!payload.name) { showToast('Informe o nome do documento.', 'warning'); return; }
    try {
        if (state.editingDocId) {
            const { error } = await supabase.from('documents').update(payload).eq('id', state.editingDocId);
            if (error) throw error;
            Object.assign(state.documents.find(d => d.id === state.editingDocId), {
                name: payload.name, prefix: payload.prefix, startNumber: payload.start_number,
                yearlyReset: payload.yearly_reset, perSecretaria: payload.per_secretaria, enabled: payload.enabled
            });
            addLog('cadastro', 'Editou documento', payload.name);
        } else {
            payload.current_number = payload.start_number;
            payload.last_reset_year = new Date().getFullYear();
            const { data, error } = await supabase.from('documents').insert([payload]).select().single();
            if (error) throw error;
            state.documents.push(mapDoc(data));
            addLog('cadastro', 'Criou documento', payload.name);
        }
        closeModal(); render();
        showToast('Documento salvo.', 'success');
    } catch (err) { showToast('Erro ao salvar: ' + err.message, 'error', 0); }
}

async function toggleDoc(id) {
    const d = state.documents.find(x => x.id === id); if (!d) return;
    try {
        const { error } = await supabase.from('documents').update({ enabled: !d.enabled }).eq('id', id);
        if (error) throw error;
        d.enabled = !d.enabled; render();
        addLog('cadastro', `${d.enabled ? 'Ativou' : 'Desativou'} documento`, d.name);
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

async function deleteDoc(id) {
    const d = state.documents.find(x => x.id === id); if (!d) return;
    const res = await showConfirmDialog({ title: 'Excluir tipo', variant: 'danger', confirmText: 'Excluir', message: `Excluir "${d.name}"? As reservas já feitas permanecem no histórico.` });
    if (!res.confirmed) return;
    try {
        const { error } = await supabase.from('documents').delete().eq('id', id);
        if (error) throw error;
        state.documents = state.documents.filter(x => x.id !== id); render();
        addLog('cadastro', 'Excluiu documento', d.name);
    } catch (err) { showToast('Erro ao excluir: ' + err.message, 'error'); }
}

// ============================================================
// View: Relatórios (exportação)
// ============================================================
const _loadedScripts = {};
function loadScriptOnce(url) {
    if (!_loadedScripts[url]) _loadedScripts[url] = new Promise((resolve, reject) => {
        const s = document.createElement('script'); s.src = url; s.onload = resolve;
        s.onerror = () => { delete _loadedScripts[url]; reject(new Error('Falha ao carregar ' + url)); };
        document.head.appendChild(s);
    });
    return _loadedScripts[url];
}
// Reservas do relatório após aplicar os parâmetros escolhidos pelo usuário
// (tipo, secretaria, período e status), sempre dentro do que ele pode ver.
function getReportReservations() {
    const f = state.reportFilters || {};
    let list = getVisibleReservations();
    if (f.tipo) list = list.filter(r => r.docName === f.tipo);
    if (f.sec) list = list.filter(r => (r.userSecretaria || '') === f.sec);
    if (f.from) list = list.filter(r => isoDate(r.timestamp) >= f.from);
    if (f.to) list = list.filter(r => isoDate(r.timestamp) <= f.to);
    if (f.status === 'ativa') list = list.filter(r => r.status !== 'anulada');
    else if (f.status === 'anulada') list = list.filter(r => r.status === 'anulada');
    return list;
}
// Descrição legível dos filtros aplicados (para o cabeçalho do PDF/toast)
function reportFilterDescription() {
    const f = state.reportFilters || {};
    const parts = [];
    if (f.tipo) parts.push(`Tipo: ${f.tipo}`);
    if (f.sec) parts.push(`Secretaria: ${f.sec}`);
    if (f.from || f.to) parts.push(`Período: ${f.from ? formatDate(f.from) : '…'} a ${f.to ? formatDate(f.to) : '…'}`);
    if (f.status === 'ativa') parts.push('Somente ativas');
    else if (f.status === 'anulada') parts.push('Somente anuladas');
    return parts.length ? parts.join(' · ') : 'Todos os registros';
}
function exportRows() {
    return getReportReservations().map(r => ({
        'Número': r.formattedNumber, 'Documento': r.docName, 'Ementa': r.subject || '',
        'Destinatário': r.destNome || '', 'Secretaria destino': r.destSecretaria || '', 'Setor destino': r.destSetor || '',
        'Observações': r.observacoes || '',
        'Reservado por': r.userName, 'Secretaria origem': r.userSecretaria || '',
        'Data/hora': `${formatDate(r.timestamp)} ${formatTime(r.timestamp)}`,
        'Status': r.status === 'anulada' ? `Anulada — ${r.cancelReason || ''}` : 'Ativa'
    }));
}
function exportFileName(ext) { return `relatorio-numeracao-${new Date().toISOString().slice(0, 10)}.${ext}`; }

async function exportExcel() {
    const rows = exportRows();
    if (!rows.length) return showToast('Nada para exportar.', 'warning');
    try {
        showToast('Preparando Excel...', 'info', 2000);
        await loadScriptOnce('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 45 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 35 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 26 }];
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
        XLSX.writeFile(wb, exportFileName('xlsx'));
        addLog('sistema', 'Exportou histórico (Excel)', `${rows.length} linhas`);
    } catch (err) { showToast('Erro no Excel: ' + err.message, 'error', 0); }
}

async function exportPdf() {
    const rows = exportRows();
    if (!rows.length) return showToast('Nada para exportar.', 'warning');
    try {
        showToast('Preparando PDF...', 'info', 2000);
        await loadScriptOnce('https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js');
        await loadScriptOnce('https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(14); doc.text('Numera — Relatório de Numeração — Prefeitura de Cataguases', 14, 14);
        doc.setFontSize(9); doc.setTextColor(120);
        const scope = state.currentUser.role === 'admin' ? 'todas as secretarias' : (state.currentUser.secretaria || 'minhas reservas');
        doc.text(`Gerado em ${formatDate(new Date())} ${formatTime(new Date())} — ${scope} — ${rows.length} registro(s)`, 14, 20);
        doc.text(`Filtros: ${reportFilterDescription()}`, 14, 25);
        const headers = Object.keys(rows[0]);
        doc.autoTable({
            startY: 30, head: [headers], body: rows.map(r => headers.map(h => r[h])),
            styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' }, headStyles: { fillColor: [0, 113, 227] },
            columnStyles: { 2: { cellWidth: 60 } },
            didParseCell: (data) => { if (data.section === 'body' && String(rows[data.row.index]['Status']).startsWith('Anulada')) data.cell.styles.textColor = [185, 28, 28]; }
        });
        doc.save(exportFileName('pdf'));
        addLog('sistema', 'Exportou histórico (PDF)', `${rows.length} linhas`);
    } catch (err) { showToast('Erro no PDF: ' + err.message, 'error', 0); }
}

function exportBackup() {
    try {
        const backup = {
            geradoEm: new Date().toISOString(),
            filtros: reportFilterDescription(),
            documentos: state.documents,
            reservas: getReportReservations(),
            secretarias: state.secretariats
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `backup-numeracao-${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); URL.revokeObjectURL(a.href);
        addLog('sistema', 'Backup JSON', `${state.reservations.length} reservas`);
        showToast('Backup gerado.', 'success');
    } catch (err) { showToast('Erro no backup: ' + err.message, 'error'); }
}

function onReportFilter(key, value) {
    state.reportFilters[key] = value;
    refreshReportSummary();
}
function clearReportFilters() {
    state.reportFilters = { tipo: '', sec: '', from: '', to: '', status: '' };
    if (state.view === 'relatorios') render();
}
function reportSummaryHtml() {
    const sel = getReportReservations();
    const ativas = sel.filter(r => r.status !== 'anulada').length;
    const anuladas = sel.length - ativas;
    const tiposN = new Set(sel.map(r => r.docName)).size;
    const tile = (v, l) => `<div><div class="sum-val">${v}</div><div class="sum-label">${l}</div></div>`;
    return tile(sel.length.toLocaleString('pt-BR'), 'Registros selecionados') +
        tile(ativas.toLocaleString('pt-BR'), 'Ativas') +
        tile(anuladas.toLocaleString('pt-BR'), 'Anuladas') +
        tile(tiposN, 'Tipos');
}
function refreshReportSummary() {
    const n = getReportReservations().length;
    const c = document.getElementById('reportCount'); if (c) c.textContent = `${n} registro(s) selecionado(s)`;
    const s = document.getElementById('reportSummary'); if (s) s.innerHTML = reportSummaryHtml();
    const d = document.getElementById('reportFilterDesc'); if (d) d.textContent = reportFilterDescription();
}

function renderRelatorios() {
    const f = state.reportFilters;
    const typeOpts = state.documents.map(d => d.name).sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map(n => `<option value="${esc(n)}" ${f.tipo === n ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const secOpts = state.secretariats.map(s => `<option value="${esc(s)}" ${f.sec === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const n = getReportReservations().length;

    const card = (hue, ic, title, desc, btn, action) => `
      <div class="card export-card">
        <div class="export-icon" style="background:hsl(${hue} 85% 93%);color:hsl(${hue} 72% 45%)">${ic}</div>
        <div><div class="export-title">${esc(title)}</div><div class="export-desc">${esc(desc)}</div></div>
        <button class="btn export-btn" style="background:hsl(${hue} 85% 94%);color:hsl(${hue} 72% 42%)" onclick="${action}">${esc(btn)}</button>
      </div>`;

    return `<div class="view">
      <div class="page-head">
        <div><div class="page-title">Relatórios</div>
          <div class="page-sub">Escolha os parâmetros e exporte no formato desejado</div></div>
        <button class="btn btn-ghost btn-pill" onclick="clearReportFilters()">Limpar</button>
      </div>

      <div class="card report-filter">
        <div class="field"><label class="field-label">Tipo de documento</label>
          <select class="field-input" onchange="onReportFilter('tipo',this.value)"><option value="">Todos os tipos</option>${typeOpts}</select></div>
        <div class="field"><label class="field-label">Secretaria</label>
          <select class="field-input" onchange="onReportFilter('sec',this.value)"><option value="">Todas</option>${secOpts}</select></div>
        <div class="field"><label class="field-label">Status</label>
          <select class="field-input" onchange="onReportFilter('status',this.value)">
            <option value="" ${f.status === '' ? 'selected' : ''}>Todos</option>
            <option value="ativa" ${f.status === 'ativa' ? 'selected' : ''}>Somente ativas</option>
            <option value="anulada" ${f.status === 'anulada' ? 'selected' : ''}>Somente anuladas</option>
          </select></div>
        <div class="field"><label class="field-label">De</label>
          <input type="date" class="field-input" value="${esc(f.from)}" oninput="onReportFilter('from',this.value)"></div>
        <div class="field"><label class="field-label">Até</label>
          <input type="date" class="field-input" value="${esc(f.to)}" oninput="onReportFilter('to',this.value)"></div>
      </div>
      <div class="report-count" id="reportCount">${n} registro(s) selecionado(s)</div>

      <div class="grid-3">
        ${card(354, icon('tipos', 22, 1.9), 'Relatório PDF', 'Documento formatado com os filtros aplicados, pronto para arquivo.', 'Exportar PDF', 'exportPdf()')}
        ${card(145, icon('list', 22, 1.9), 'Planilha Excel', 'Tabela dos registros selecionados para análise e conferência.', 'Exportar Excel', 'exportExcel()')}
        ${card(210, icon('relatorios', 22, 1.9), 'Backup JSON', 'Cópia dos dados (respeitando os filtros) para importação futura.', 'Baixar backup', 'exportBackup()')}
      </div>

      <div class="card">
        <div class="card-title">Resumo da seleção</div>
        <div class="card-note" id="reportFilterDesc" style="margin:4px 0 18px;">${esc(reportFilterDescription())}</div>
        <div class="grid-4 summary" id="reportSummary">${reportSummaryHtml()}</div>
      </div>
    </div>`;
}

// ============================================================
// View: Configurações (perfil + preferências + admin)
// ============================================================
function renderConfig() {
    const u = state.currentUser;
    const isAdmin = u.role === 'admin';

    const toggle = (key, title, desc) => {
        const on = !!state.prefs[key];
        return `<div class="pref-row"><div><div class="pref-title">${esc(title)}</div><div class="pref-desc">${esc(desc)}</div></div>
          <div class="ios-toggle ${on ? 'ios-toggle--on' : ''}" onclick="togglePref('${key}')"><div class="ios-knob"></div></div></div>`;
    };

    const adminBlocks = isAdmin ? `
      <div class="section-label">${icon('building', 15, 2)} Secretarias</div>
      ${renderSecretariasPanel()}
      <div class="section-label">${icon('users', 15, 2)} Usuários</div>
      ${renderUsersPanel()}
      <div class="section-label">${icon('list', 15, 2)} Logs do sistema</div>
      <div class="card"><div class="logs-filter">
        ${['todos', 'reserva', 'edicao', 'anulacao', 'cadastro', 'sistema'].map(t => `<button class="logf ${state.logFilter === t ? 'logf--active' : ''}" onclick="setLogFilter('${t}')">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
      </div><div id="logsList">${renderLogsListInner()}</div></div>
    ` : '';

    return `<div class="view view--narrow">
      <div class="page-head"><div><div class="page-title">Configurações</div>
        <div class="page-sub">Perfil, preferências${isAdmin ? ', secretarias, usuários e logs' : ''}</div></div></div>

      <div class="card profile-card">
        <div class="avatar avatar--lg">${esc(initials(u.name))}</div>
        <div style="flex:1;"><div class="profile-name">${esc(u.name)}</div>
          <div class="profile-sub">${esc(u.secretaria || '—')} · ${esc(PERMISSION_LEVELS[u.role]?.label || u.role)}</div></div>
        <button class="btn btn-ghost btn-pill" onclick="handleLogout()">${icon('logout', 15, 2)} Sair</button>
      </div>

      <div class="card">
        ${toggle('notify', 'Notificar novas reservas', 'Aviso quando um número é gerado')}
        ${toggle('autoBackup', 'Backup automático', 'Lembrete diário para exportar os dados')}
      </div>

      ${adminBlocks}
    </div>`;
}

function togglePref(key) {
    state.prefs[key] = !state.prefs[key];
    localStorage.setItem('prefs', JSON.stringify(state.prefs));
    if (state.view === 'config') render();
}

// ---- Admin: Secretarias ----
function renderSecretariasPanel() {
    const rows = state.secretariats.map(sec => {
        const userCount = state.users.filter(x => x.secretaria === sec).length;
        const defaults = (state.secretariaPermissions[sec] || []).length;
        return `<div class="adm-row">
          <div class="adm-info"><div class="adm-name">${esc(sec)}</div>
            <div class="adm-chips"><span class="meta-chip">${userCount} usuário(s)</span><span class="meta-chip">${defaults} doc(s) padrão</span></div></div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" title="Escolher quais documentos os usuários desta secretaria já vêm habilitados" onclick="openSecretariaConfig('${esc(sec)}')">${icon('config', 14, 2)} Documentos padrão</button>
            <button class="icon-btn-sm danger" title="Remover secretaria" onclick="removeSecretaria('${esc(sec)}')">${icon('trash', 15, 2)}</button>
          </div></div>`;
    }).join('');
    return `<div class="card">
      <div class="adm-add"><input id="newSecName" class="field-input" placeholder="Nova secretaria (ex: Cultura)"><button class="btn btn-primary" onclick="addSecretaria()">Adicionar</button></div>
      ${rows}
    </div>`;
}

async function addSecretaria() {
    const inp = document.getElementById('newSecName'); const name = inp.value.trim();
    if (!name) return showToast('Digite o nome.', 'warning');
    if (state.secretariats.includes(name)) return showToast('Já existe.', 'warning');
    try {
        const list = [...state.secretariats, name].sort();
        const { error } = await supabase.from('app_config').upsert({ key: 'secretaria_list', value: list });
        if (error) throw error;
        state.secretariats = list; render();
        addLog('sistema', 'Adicionou secretaria', name);
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

async function removeSecretaria(name) {
    const linked = state.users.filter(u => u.secretaria === name).length;
    const res = await showConfirmDialog({ title: 'Remover secretaria', variant: 'danger', confirmText: 'Remover', message: `Remover "${name}"?${linked ? ` ${linked} usuário(s) vinculados manterão o nome.` : ''}` });
    if (!res.confirmed) return;
    try {
        const list = state.secretariats.filter(s => s !== name);
        const { error } = await supabase.from('app_config').upsert({ key: 'secretaria_list', value: list });
        if (error) throw error;
        state.secretariats = list; render();
        addLog('sistema', 'Removeu secretaria', name);
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

function openSecretariaConfig(sec) {
    const perSecDocs = state.documents.filter(d => d.perSecretaria);
    const defaults = state.secretariaPermissions[sec] || [];
    const secId = sec.replace(/[^a-zA-Z0-9]/g, '_');
    const docsChecks = [...state.documents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(d =>
        `<label class="check-row"><input type="checkbox" class="secdef-${secId}" value="${d.id}" ${defaults.includes(d.id) ? 'checked' : ''}> <span>${esc(d.name)} ${d.prefix ? '(' + esc(d.prefix) + ')' : ''}</span></label>`).join('');
    const counters = perSecDocs.length ? perSecDocs.map(d => {
        const next = state.counters[bucketKeyFor(d, sec)];
        const val = (next !== undefined && next !== null) ? next : d.startNumber;
        return `<div class="counter-row"><label class="field-label" style="flex:1">${esc(d.name)} — próximo nº</label>
          <input type="number" min="1" id="cnt_${d.id}_${secId}" class="field-input field-input--sm" value="${val}">
          <button class="btn btn-ghost btn-sm" onclick="saveCounter('${d.id}','${esc(sec)}','cnt_${d.id}_${secId}')">Salvar</button></div>`;
    }).join('') : '<div class="empty-mini">Nenhum tipo "por secretaria". Ative essa opção ao editar um documento.</div>';

    openModal(`
      <div class="modal-title">Configurar — ${esc(sec)}</div>
      <div class="sub-label">Documentos padrão desta secretaria</div>
      <div class="hint">Novos usuários (e aprovações) desta secretaria começam com estes documentos.</div>
      <div class="checks-grid">${docsChecks}</div>
      <div class="modal-actions" style="margin:10px 0 4px;">
        <button class="btn btn-ghost btn-sm" onclick="applyDefaultsToUsers('${esc(sec)}')">Aplicar aos usuários</button>
        <button class="btn btn-primary btn-sm" onclick="saveSecretariaDefaults('${esc(sec)}')">Salvar padrão</button></div>
      <div class="sub-label" style="margin-top:14px;">Numeração própria</div>
      ${counters}
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>`, { width: 480 });
}

async function saveSecretariaDefaults(sec) {
    const secId = sec.replace(/[^a-zA-Z0-9]/g, '_');
    const selected = Array.from(document.querySelectorAll(`.secdef-${secId}:checked`)).map(cb => cb.value);
    try {
        const perms = { ...state.secretariaPermissions, [sec]: selected };
        const { error } = await supabase.from('app_config').upsert({ key: 'secretariaPermissions', value: perms });
        if (error) throw error;
        state.secretariaPermissions = perms;
        showToast(`Padrão de "${sec}" salvo (${selected.length} doc).`, 'success');
        addLog('cadastro', `Definiu documentos padrão de ${sec}`, `${selected.length} documento(s)`);
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

async function applyDefaultsToUsers(sec) {
    const defaults = state.secretariaPermissions[sec] || [];
    if (!defaults.length) return showToast('Salve um padrão primeiro.', 'warning');
    const targets = state.users.filter(u => u.secretaria === sec && (u.role === 'user_restricted' || u.role === 'user_readonly'));
    if (!targets.length) return showToast('Nenhum usuário restrito nessa secretaria.', 'info');
    const res = await showConfirmDialog({ title: 'Aplicar padrão', variant: 'danger', confirmText: 'Aplicar', message: `Substituir permissões de ${targets.length} usuário(s) de "${sec}" pelo padrão salvo?` });
    if (!res.confirmed) return;
    try {
        for (const u of targets) { await supabase.from('users').update({ allowed_documents: defaults }).eq('id', u.id); u.allowedDocuments = defaults; }
        showToast(`Padrão aplicado a ${targets.length} usuário(s).`, 'success');
        addLog('cadastro', `Aplicou padrão de ${sec}`, `${targets.length} usuário(s)`);
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

async function saveCounter(docId, sec, inputId) {
    const n = parseInt(document.getElementById(inputId).value, 10);
    if (!n || n < 1) return showToast('Número inválido.', 'warning');
    try {
        const { data, error } = await supabase.rpc('set_secretaria_counter', { p_doc_id: docId, p_secretaria: sec, p_next_number: n });
        if (error) throw error;
        state.counters[`${data.doc_id}|${data.secretaria}|${data.year}`] = data.current_number;
        showToast(`Próximo número em ${sec} definido para ${n}.`, 'success');
        addLog('cadastro', `Definiu numeração para ${sec}`, `Próximo: ${n}`);
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

// ---- Admin: Usuários ----
function renderUsersPanel() {
    return `<div class="card">
      <div class="adm-add"><div class="search-box" style="flex:1;">${icon('search', 15, 2)}<input id="userSearch" oninput="renderUsersList()" placeholder="Buscar nome, login ou secretaria"></div>
        <button class="btn btn-primary" onclick="openUserModal()">Novo usuário</button></div>
      <div id="usersList">${renderUsersListInner()}</div></div>`;
}
function renderUsersList() { const c = document.getElementById('usersList'); if (c) c.innerHTML = renderUsersListInner(); }
function renderUsersListInner() {
    const q = (document.getElementById('userSearch')?.value || '').toLowerCase();
    let users = state.users.filter(u => !q || `${u.name} ${u.username} ${u.secretaria || ''}`.toLowerCase().includes(q));
    users = [...users].sort((a, b) => (!a.approved !== !b.approved) ? (a.approved ? 1 : -1) : (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    if (!users.length) return '<div class="empty-mini">Nenhum usuário.</div>';
    const roleChip = { admin: 'rc--admin', user_full: 'rc--full', user_restricted: 'rc--restricted', user_readonly: 'rc--readonly' };
    return users.map(u => `<div class="adm-row ${u.approved ? '' : 'adm-row--pending'}">
        <div class="avatar avatar--sm">${esc(initials(u.name))}</div>
        <div class="adm-info"><div class="adm-name">${esc(u.name)} ${u.id === state.currentUser.id ? '<span class="meta-chip">Você</span>' : ''} ${u.approved ? '' : '<span class="meta-chip meta-chip--warn">Pendente</span>'}</div>
          <div class="adm-chips"><span class="role-chip ${roleChip[u.role] || ''}">${esc(PERMISSION_LEVELS[u.role]?.label || u.role)}</span>
            ${u.secretaria ? `<span class="meta-chip">${esc(u.secretaria)}</span>` : '<span class="meta-chip meta-chip--warn">sem secretaria</span>'}
            <span class="meta-chip">@${esc(u.username)}</span></div></div>
        <div class="row-actions">
          ${u.approved ? '' : `<button class="icon-btn-sm approve" title="Aprovar" onclick="approveUser('${u.id}')">${icon('check', 15, 2)}</button>`}
          ${u.id !== state.currentUser.id ? `<button class="icon-btn-sm" title="Editar" onclick="openUserModal('${u.id}')">${icon('edit', 15, 2)}</button>
          <button class="icon-btn-sm danger" title="Excluir" onclick="deleteUser('${u.id}')">${icon('trash', 15, 2)}</button>` : ''}
        </div></div>`).join('');
}

function openUserModal(userId) {
    const editing = !!userId;
    const u = editing ? state.users.find(x => x.id === userId) : { name: '', cargo: '', setor: '', secretaria: '', username: '', password: '', role: 'user_restricted', allowedDocuments: [] };
    state.editingUserId = userId || null;
    const secOpts = ['<option value="">Selecione...</option>', ...state.secretariats.map(s => `<option value="${esc(s)}" ${u.secretaria === s ? 'selected' : ''}>${esc(s)}</option>`)].join('');
    const roleOpts = Object.entries(PERMISSION_LEVELS).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
    const docChecks = [...state.documents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(d =>
        `<label class="check-row"><input type="checkbox" class="ucheck" value="${d.id}" ${u.allowedDocuments.includes(d.id) ? 'checked' : ''}> <span>${esc(d.name)}</span></label>`).join('');
    openModal(`
      <div class="modal-title">${editing ? 'Editar' : 'Novo'} usuário</div>
      <div class="field"><label class="field-label">Nome completo *</label><input id="ufName" class="field-input" value="${esc(u.name)}"></div>
      <div class="grid-2-mini">
        <div class="field"><label class="field-label">Cargo</label><input id="ufCargo" class="field-input" value="${esc(u.cargo || '')}"></div>
        <div class="field"><label class="field-label">Setor</label><input id="ufSetor" class="field-input" value="${esc(u.setor || '')}"></div>
      </div>
      <div class="field"><label class="field-label">Secretaria *</label><select id="ufSec" class="field-input" onchange="onUserSecChange()">${secOpts}</select>
        <div class="hint" id="ufSecHint" style="display:none;"></div></div>
      <div class="grid-2-mini">
        <div class="field"><label class="field-label">Usuário (login) *</label><input id="ufUser" class="field-input" value="${esc(u.username)}"></div>
        <div class="field"><label class="field-label">Senha *</label><input id="ufPass" type="text" class="field-input" value="${esc(u.password || '')}"></div>
      </div>
      <div class="field"><label class="field-label">Nível de permissão *</label><select id="ufRole" class="field-input" onchange="onUserRoleChange()">${roleOpts}</select></div>
      <div id="ufDocsSection" class="field" style="${(u.role === 'user_restricted' || u.role === 'user_readonly') ? '' : 'display:none;'}">
        <label class="field-label">Documentos permitidos <button type="button" class="link-btn" onclick="applyUserDefaults()">restaurar padrão da secretaria</button></label>
        <div class="checks-grid" id="ufDocs">${docChecks}</div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveUser()">Salvar</button></div>`, { width: 500 });
}
function onUserRoleChange() {
    const role = document.getElementById('ufRole').value;
    const sec = document.getElementById('ufDocsSection');
    sec.style.display = (role === 'user_restricted' || role === 'user_readonly') ? '' : 'none';
}
function onUserSecChange() {
    const role = document.getElementById('ufRole').value;
    if (role === 'user_restricted' || role === 'user_readonly') applyUserDefaults(false);
}
function applyUserDefaults(fromButton = true) {
    const sec = document.getElementById('ufSec').value;
    const defaults = state.secretariaPermissions[sec] || [];
    const hint = document.getElementById('ufSecHint');
    if (!sec || !defaults.length) { if (hint) hint.style.display = 'none'; if (fromButton) showToast(sec ? 'Secretaria sem padrão configurado.' : 'Selecione uma secretaria.', 'warning'); return; }
    document.querySelectorAll('.ucheck').forEach(cb => { cb.checked = defaults.includes(cb.value); });
    if (hint) { hint.textContent = `Padrão da secretaria aplicado (${defaults.length} doc).`; hint.style.display = 'block'; }
}

async function saveUser() {
    const role = document.getElementById('ufRole').value;
    let allowed = [];
    if (role === 'user_restricted' || role === 'user_readonly') {
        allowed = Array.from(document.querySelectorAll('.ucheck:checked')).map(cb => cb.value);
        if (!allowed.length) return showToast('Selecione ao menos um documento.', 'warning');
    }
    const payload = {
        name: document.getElementById('ufName').value.trim(),
        cargo: document.getElementById('ufCargo').value.trim(),
        setor: document.getElementById('ufSetor').value.trim(),
        secretaria: document.getElementById('ufSec').value,
        username: document.getElementById('ufUser').value.trim(),
        password: document.getElementById('ufPass').value,
        role, allowed_documents: allowed
    };
    if (!payload.name || !payload.username || !payload.password) return showToast('Preencha nome, login e senha.', 'warning');
    try {
        if (state.editingUserId) {
            const { error } = await supabase.from('users').update(payload).eq('id', state.editingUserId);
            if (error) throw error;
            Object.assign(state.users.find(u => u.id === state.editingUserId), { ...payload, allowedDocuments: allowed });
            addLog('cadastro', 'Editou usuário', payload.name);
        } else {
            const { data, error } = await supabase.from('users').insert([{ ...payload, approved: false }]).select().single();
            if (error) throw error;
            state.users.push({ id: data.id, name: data.name, username: data.username, cargo: data.cargo, setor: data.setor, secretaria: data.secretaria, role: data.role, allowedDocuments: data.allowed_documents || [], approved: data.approved, password: data.password });
            addLog('cadastro', 'Criou usuário', payload.name);
        }
        closeModal(); render();
        showToast('Usuário salvo.', 'success');
    } catch (err) { showToast('Erro ao salvar: ' + err.message, 'error', 0); }
}

async function approveUser(id) {
    const u = state.users.find(x => x.id === id); if (!u) return;
    const res = await showConfirmDialog({ title: 'Aprovar usuário', confirmText: 'Aprovar', message: `Aprovar ${u.name}? Terá acesso imediato.` });
    if (!res.confirmed) return;
    try {
        const updates = { approved: true };
        const hasCustom = Array.isArray(u.allowedDocuments) && u.allowedDocuments.length > 0;
        const defaults = state.secretariaPermissions[u.secretaria] || [];
        if (!hasCustom && defaults.length) { updates.allowed_documents = defaults; u.allowedDocuments = defaults; }
        const { error } = await supabase.from('users').update(updates).eq('id', id);
        if (error) throw error;
        u.approved = true; render();
        addLog('cadastro', 'Aprovou usuário', u.name);
        showToast('Usuário aprovado.', 'success');
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

async function deleteUser(id) {
    const u = state.users.find(x => x.id === id); if (!u) return;
    const res = await showConfirmDialog({ title: 'Excluir usuário', variant: 'danger', confirmText: 'Excluir', message: `Excluir ${u.name}? As reservas dele permanecem no histórico.` });
    if (!res.confirmed) return;
    try {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw error;
        state.users = state.users.filter(x => x.id !== id); render();
        addLog('cadastro', 'Excluiu usuário', u.name);
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

// ---- Admin: Logs ----
const LOG_STYLES = {
    reserva: { color: '#34c759', icon: '🔢' }, edicao: { color: '#f59e0b', icon: '✏️' },
    anulacao: { color: '#e5484d', icon: '⛔' }, cadastro: { color: '#0071e3', icon: '📝' },
    usuario: { color: '#8b5cf6', icon: '👤' }, sistema: { color: '#86868b', icon: '⚙️' }
};
function setLogFilter(t) { state.logFilter = t; if (state.view === 'config') render(); }
function renderLogsList() { const c = document.getElementById('logsList'); if (c) c.innerHTML = renderLogsListInner(); }
function renderLogsListInner() {
    let logs = state.logs;
    if (state.logFilter !== 'todos') logs = logs.filter(l => l.type === state.logFilter);
    logs = logs.slice(0, 80);
    if (!logs.length) return '<div class="empty-mini">Nenhum log.</div>';
    return logs.map(l => {
        const s = LOG_STYLES[l.type] || LOG_STYLES.sistema;
        return `<div class="log-item" style="border-left:3px solid ${s.color}">
          <div class="log-head"><span>${s.icon}</span><span class="log-user">${esc(l.userName)}</span>
            <span class="log-time">${formatDate(l.timestamp)} ${formatTime(l.timestamp)}</span></div>
          <div class="log-action">${esc(l.action)}</div>
          ${l.details ? `<div class="log-details">${esc(l.details)}</div>` : ''}</div>`;
    }).join('');
}

// Restaurar prefs do localStorage
try { const p = JSON.parse(localStorage.getItem('prefs')); if (p) state.prefs = { ...state.prefs, ...p }; } catch (e) { }
