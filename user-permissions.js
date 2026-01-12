// ===== SISTEMA AVANÇADO DE USUÁRIOS - user-permissions.js =====

// Níveis de Permissão
const PERMISSION_LEVELS = [
    {
        value: 'user_restricted',
        label: 'Usuário Restrito',
        description: 'Acesso apenas a documentos específicos'
    },
    {
        value: 'user_full',
        label: 'Usuário Completo',
        description: 'Acesso a todos os documentos'
    },
    {
        value: 'user_readonly',
        label: 'Somente Leitura',
        description: 'Apenas visualizar, sem reservar números'
    },
    {
        value: 'admin',
        label: 'Administrador',
        description: 'Acesso total ao sistema'
    }
];

// Renderizar lista de documentos com checkboxes
function renderDocumentCheckboxes() {
    const container = document.getElementById('documentsList');
    if (!container) return;

    container.innerHTML = state.documents
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(doc => `
            <label class="checkbox-label document-checkbox">
                <input type="checkbox" 
                       class="doc-checkbox" 
                       value="${doc.id}" 
                       ${doc.enabled ? '' : 'disabled'}>
                <span>${doc.name} ${doc.prefix ? '(' + doc.prefix + ')' : ''}</span>
                ${!doc.enabled ? '<span class="badge-disabled">Desabilitado</span>' : ''}
            </label>
        `).join('');
}

// Handle mudança de permissão
function handleRoleChange() {
    const role = document.getElementById('userRole').value;
    const documentsSection = document.getElementById('documentsSection');
    const roleDescription = document.getElementById('roleDescription');

    const descriptions = {
        'admin': 'Acesso total ao sistema, incluindo administração',
        'user_full': 'Acesso a todos os documentos habilitados',
        'user_restricted': 'Acesso apenas a documentos específicos selecionados abaixo',
        'user_readonly': 'Apenas visualizar documentos, sem permissão para reservar números'
    };

    roleDescription.textContent = descriptions[role];

    // Mostrar/ocultar seção de documentos
    if (role === 'user_restricted' || role === 'user_readonly') {
        documentsSection.style.display = 'block';
        renderDocumentCheckboxes();
    } else {
        documentsSection.style.display = 'none';
    }
}

// Selecionar todos os documentos
function selectAllDocuments() {
    document.querySelectorAll('.doc-checkbox').forEach(cb => {
        if (!cb.disabled) cb.checked = true;
    });
}

// Desselecionar todos os documentos
function deselectAllDocuments() {
    document.querySelectorAll('.doc-checkbox').forEach(cb => {
        cb.checked = false;
    });
}

// Abrir modal de adicionar usuário (ATUALIZADO)
function openAddUserModal() {
    state.editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Adicionar Usuário';
    document.getElementById('userForm').reset();

    // Resetar para permissão padrão
    document.getElementById('userRole').value = 'user_restricted';
    handleRoleChange();

    document.getElementById('userModal').classList.add('active');
}

// Abrir modal de editar usuário (ATUALIZADO)
function openEditUserModal(userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    state.editingUserId = userId;
    document.getElementById('userModalTitle').textContent = 'Editar Usuário';

    // Preencher campos
    document.getElementById('userName').value = user.name;
    document.getElementById('userCargo').value = user.cargo || '';
    document.getElementById('userSetor').value = user.setor || '';
    document.getElementById('userSecretaria').value = user.secretaria || '';
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = user.password;
    document.getElementById('userRole').value = user.role;

    // Atualizar interface baseado na role
    handleRoleChange();

    // Marcar documentos permitidos se aplicável
    if (user.allowedDocuments && user.allowedDocuments.length > 0) {
        setTimeout(() => {
            user.allowedDocuments.forEach(docId => {
                const checkbox = document.querySelector(`.doc-checkbox[value="${docId}"]`);
                if (checkbox) checkbox.checked = true;
            });
        }, 100);
    }

    document.getElementById('userModal').classList.add('active');
}

// Salvar usuário (ATUALIZADO)
function handleUserFormSubmit(e) {
    e.preventDefault();

    const role = document.getElementById('userRole').value;
    let allowedDocuments = [];

    // Coletar documentos selecionados se necessário
    if (role === 'user_restricted' || role === 'user_readonly') {
        allowedDocuments = Array.from(document.querySelectorAll('.doc-checkbox:checked'))
            .map(cb => cb.value);

        if (allowedDocuments.length === 0) {
            showNotification('Selecione pelo menos um documento para este usuário!', 'error');
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

    // Verificar se username já existe (exceto para o próprio usuário)
    const existingUser = state.users.find(u =>
        u.username === formData.username && u.id !== state.editingUserId
    );

    if (existingUser) {
        showNotification('Este nome de usuário já está em uso!', 'error');
        return;
    }

    if (state.editingUserId) {
        // Editar
        const user = state.users.find(u => u.id === state.editingUserId);
        if (user) {
            Object.assign(user, formData);
        }
        showNotification('Usuário atualizado com sucesso!');

        if (typeof addLog === 'function') {
            addLog('cadastro', 'Editou usuário', `${formData.name} - ${formData.cargo}`);
        }
    } else {
        // Adicionar
        const newUser = {
            id: generateId(),
            ...formData,
            createdAt: new Date().toISOString(),
            createdBy: state.currentUser.id
        };
        state.users.push(newUser);
        showNotification('Usuário adicionado com sucesso!');

        if (typeof addLog === 'function') {
            addLog('cadastro', 'Criou usuário', `${formData.name} - ${formData.cargo}`);
        }
    }

    saveUsers();
    renderAdminUsers();
    updateStats();
    closeUserModalFn();
}

// Renderizar usuários no admin (ATUALIZADO)
function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');
    if (!container) return;

    container.innerHTML = state.users.map(user => {
        const permissionLabel = PERMISSION_LEVELS.find(p => p.value === user.role)?.label || user.role;
        const permissionIcon = user.role === 'admin' ? '🔑' : user.role === 'user_readonly' ? '👁️' : '👤';

        return `
            <div class="admin-doc-item">
                <div class="admin-doc-info">
                    <div class="admin-doc-name">
                        ${user.name}
                        ${user.id === state.currentUser.id ? '<span style="color: var(--text-secondary); font-size: 0.875rem;">(Você)</span>' : ''}
                    </div>
                    <div class="admin-doc-details">
                        Usuário: <strong>${user.username}</strong> | 
                        Cargo: ${user.cargo || 'N/A'} | 
                        Setor: ${user.setor || 'N/A'} | 
                        Secretaria: ${user.secretaria || 'N/A'}
                    </div>
                    <div class="admin-doc-details" style="margin-top: 0.25rem;">
                        ${permissionIcon} ${permissionLabel}
                        ${user.allowedDocuments && user.allowedDocuments.length > 0 ?
                ` | Acesso a ${user.allowedDocuments.length} documento(s)` : ''}
                    </div>
                </div>
                <div class="admin-doc-actions">
                    ${user.id !== state.currentUser.id ? `
                        <button class="icon-btn" onclick="openEditUserModal('${user.id}')" title="Editar">
                            ✏️
                        </button>
                        <button class="icon-btn delete" onclick="deleteUser('${user.id}')" title="Excluir">
                            🗑️
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Filtrar documentos por permissões do usuário (NOVO)
function filterDocumentsByUserPermission() {
    let visibleDocs = state.documents.filter(doc => doc.enabled);

    const user = state.currentUser;

    // Admin vê tudo
    if (user.role === 'admin') {
        return visibleDocs;
    }

    // Usuário completo vê todos os habilitados
    if (user.role === 'user_full') {
        return visibleDocs;
    }

    // Usuário restrito ou readonly vê apenas os permitidos
    if (user.role === 'user_restricted' || user.role === 'user_readonly') {
        if (!user.allowedDocuments || user.allowedDocuments.length === 0) {
            return [];
        }
        return visibleDocs.filter(doc => user.allowedDocuments.includes(doc.id));
    }

    return visibleDocs;
}

// Verificar se usuário pode reservar número (NOVO)
function canReserveNumber(docId) {
    const user = state.currentUser;

    // Somente leitura não pode reservar
    if (user.role === 'user_readonly') {
        return false;
    }

    // Admin pode tudo
    if (user.role === 'admin') {
        return true;
    }

    // Usuário completo pode reservar qualquer documento habilitado
    if (user.role === 'user_full') {
        return true;
    }

    // Usuário restrito: verificar se documento está na lista permitida
    if (user.role === 'user_restricted') {
        return user.allowedDocuments && user.allowedDocuments.includes(docId);
    }

    return false;
}

// INTEGRAÇÃO: Atualizar renderDocuments() no app.js principal
// Substituir a linha que filtra documentos por:
// const visibleDocs = filterDocumentsByUserPermission();

// E no botão de reservar, adicionar verificação:
// ${canReserveNumber(doc.id) ?
//     `<button class="reserve-btn" onclick="event.stopPropagation(); reserveNumber('${doc.id}')">Reservar Número</button>` :
//     `<button class="reserve-btn" disabled style="opacity: 0.5; cursor: not-allowed;">Sem Permissão</button>`
// }
