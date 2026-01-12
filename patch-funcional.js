// PATCH FINAL - Cole no Console (F12) para adicionar todas as funcionalidades

// 1. Adicionar confirmacao ao reservar
const originalReserveNumber = window.reserveNumber;
window.reserveNumber = function (docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc || !canReserve(docId)) return;

    const numeroFormatado = formatNumber(doc);

    if (!confirm('Confirma a reserva do numero:\n\n' + numeroFormatado + '\n\nDocumento: ' + doc.name)) {
        return;
    }

    const reservation = {
        id: generateId(),
        docId: doc.id,
        docName: doc.name,
        number: doc.currentNumber,
        formattedNumber: numeroFormatado,
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        timestamp: new Date().toISOString()
    };

    doc.currentNumber++;
    state.reservations.unshift(reservation);

    saveData();
    addLog('reserva', 'Reservou ' + doc.name, 'Numero: ' + reservation.formattedNumber);

    renderDocuments();
    renderHistory();
    if (state.currentUser.role === 'admin') {
        renderAdminDocs();
        updateStats();
    }

    alert('Numero reservado com sucesso!\n\n' + reservation.formattedNumber);
};

// 2. Ordenar alfabeticamente
const originalRenderDocuments = window.renderDocuments;
window.renderDocuments = function () {
    const container = document.getElementById('documentsList');
    let docs = getVisibleDocuments();
    docs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    if (docs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum documento disponivel.</p>';
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
            '<button class="reserve-btn" onclick="reserveNumber(\'' + doc.id + '\')">Reservar Numero</button>' :
            '<button class="reserve-btn" disabled style="opacity:0.5">🔒 Sem Permissao</button>'
        }
        </div>
    `).join('');
};

// Aplicar agora
renderDocuments();

console.log('Confirmacao ao reservar ativada!');
console.log('Documentos em ordem alfabetica!');
console.log('Tudo funcionando!');
