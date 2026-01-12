// Templates de documentos pré-definidos (ordem alfabética)
const DOCUMENT_TEMPLATES = [
    { name: 'Ata', prefix: '' },
    { name: 'Circular', prefix: 'Circ.' },
    { name: 'Contrato', prefix: 'Contr.' },
    { name: 'Decreto', prefix: 'Dec.' },
    { name: 'Edital', prefix: 'Ed.' },
    { name: 'Exposição de Motivos', prefix: 'EM' },
    { name: 'Folha', prefix: 'fl.' },
    { name: 'Instrução Normativa', prefix: 'IN' },
    { name: 'Lei', prefix: 'L.' },
    { name: 'Lei Complementar', prefix: 'LC' },
    { name: 'Medida Provisória', prefix: 'MP' },
    { name: 'Memorando', prefix: 'Mem.' },
    { name: 'Ofício', prefix: 'Of.' },
    { name: 'Parecer', prefix: 'Par.' },
    { name: 'Portaria', prefix: 'Port.' },
    { name: 'Processo', prefix: 'Proc.' },
    { name: 'Protocolo', prefix: 'Prot.' },
    { name: 'Resolução', prefix: 'Res.' }
];

let autocompleteState = {
    selectedIndex: -1,
    filteredItems: [],
    dropdown: null
};

function initAutocomplete() {
    const docNameInput = document.getElementById('docName');
    if (!docNameInput || docNameInput.dataset.autocompleteInit) return;

    docNameInput.dataset.autocompleteInit = 'true';

    // Criar wrapper
    const formGroup = docNameInput.closest('.form-group');
    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-container';
    docNameInput.parentNode.insertBefore(wrapper, docNameInput);
    wrapper.appendChild(docNameInput);

    // Criar dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.id = 'autocompleteDropdown';
    wrapper.appendChild(dropdown);
    autocompleteState.dropdown = dropdown;

    // Event listeners
    docNameInput.addEventListener('input', handleAutocompleteInput);
    docNameInput.addEventListener('keydown', handleAutocompleteKeydown);
    docNameInput.addEventListener('focus', handleAutocompleteFocus);

    // Fechar ao clicar fora
    document.addEventListener('click', handleAutocompleteClickOutside);
}

function handleAutocompleteFocus(e) {
    const value = e.target.value.toLowerCase().trim();
    autocompleteState.filteredItems = value.length === 0
        ? [...DOCUMENT_TEMPLATES]
        : DOCUMENT_TEMPLATES.filter(t => t.name.toLowerCase().includes(value));
    autocompleteState.selectedIndex = -1;
    renderAutocomplete(value);
}

function handleAutocompleteInput(e) {
    const value = e.target.value.toLowerCase().trim();
    autocompleteState.filteredItems = value.length === 0
        ? [...DOCUMENT_TEMPLATES]
        : DOCUMENT_TEMPLATES.filter(t => t.name.toLowerCase().includes(value));
    autocompleteState.selectedIndex = -1;
    renderAutocomplete(value);
}

function renderAutocomplete(searchTerm) {
    const dropdown = autocompleteState.dropdown;
    if (!dropdown) return;

    if (autocompleteState.filteredItems.length === 0) {
        dropdown.classList.remove('active');
        return;
    }

    dropdown.innerHTML = autocompleteState.filteredItems.map((template, index) => {
        let displayName = template.name;

        if (searchTerm) {
            const regex = new RegExp('(' + searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            displayName = template.name.replace(regex, '<span class="autocomplete-match">$1</span>');
        }

        const selectedClass = index === autocompleteState.selectedIndex ? 'selected' : '';
        const prefixHtml = template.prefix ? `<span class="autocomplete-prefix">${template.prefix}</span>` : '';

        return `<div class="autocomplete-item ${selectedClass}" data-index="${index}">
            <span>${displayName}</span>
            ${prefixHtml}
        </div>`;
    }).join('');

    // Adicionar event listeners aos items
    dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
        item.addEventListener('click', () => selectAutocompleteItem(index));
    });

    dropdown.classList.add('active');
}

function handleAutocompleteKeydown(e) {
    const dropdown = autocompleteState.dropdown;
    if (!dropdown || !dropdown.classList.contains('active')) return;

    const itemCount = autocompleteState.filteredItems.length;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            autocompleteState.selectedIndex = (autocompleteState.selectedIndex + 1) % itemCount;
            renderAutocomplete(e.target.value.toLowerCase());
            break;

        case 'ArrowUp':
            e.preventDefault();
            autocompleteState.selectedIndex = autocompleteState.selectedIndex <= 0
                ? itemCount - 1
                : autocompleteState.selectedIndex - 1;
            renderAutocomplete(e.target.value.toLowerCase());
            break;

        case 'Enter':
            if (autocompleteState.selectedIndex >= 0) {
                e.preventDefault();
                selectAutocompleteItem(autocompleteState.selectedIndex);
            }
            break;

        case 'Escape':
            e.preventDefault();
            dropdown.classList.remove('active');
            break;
    }
}

function selectAutocompleteItem(index) {
    const template = autocompleteState.filteredItems[index];
    if (!template) return;

    const docNameInput = document.getElementById('docName');
    const docPrefixInput = document.getElementById('docPrefix');

    docNameInput.value = template.name;
    docPrefixInput.value = template.prefix;

    if (autocompleteState.dropdown) {
        autocompleteState.dropdown.classList.remove('active');
    }

    // Focar no próximo campo
    const startNumberInput = document.getElementById('startNumber');
    if (startNumberInput) {
        startNumberInput.focus();
    }
}

function handleAutocompleteClickOutside(e) {
    const dropdown = autocompleteState.dropdown;
    if (!dropdown) return;

    const autocompleteContainer = dropdown.closest('.autocomplete-container');
    if (autocompleteContainer && !autocompleteContainer.contains(e.target)) {
        dropdown.classList.remove('active');
    }
}
