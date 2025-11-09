// Configurações da API
const API_BASE_URL = 'https://api.cnpja.com/office';
const API_KEY = '30d07853-26b3-4dcf-86bd-5e7ecc586d06-9f06a80a-8651-479a-90bd-d45d96c2f35a';

// Elementos do DOM
const searchForm = document.getElementById('searchForm' );
const dataInicio = document.getElementById('dataInicio');
const dataFim = document.getElementById('dataFim');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const debugInfo = document.getElementById('debugInfo');
const requestUrlSpan = document.getElementById('requestUrl');
const apiResponseSpan = document.getElementById('apiResponse');
const resultsContainer = document.getElementById('resultsContainer');
const noResults = document.getElementById('noResults');
const tableBody = document.getElementById('tableBody');
const resultCount = document.getElementById('resultCount');
const btnSearch = document.querySelector('.btn-search');

// Variável global para armazenar todos os resultados
let allResults = [];

// Função principal de busca
async function handleSearch(e) {
    e.preventDefault();

    // Validação de datas
    const inicio = new Date(dataInicio.value);
    const fim = new Date(dataFim.value);

    if (inicio > fim) {
        showError('A data de início não pode ser maior que a data de fim.');
        return;
    }

    // Limpar resultados anteriores
    clearResults();
    allResults = []; // Limpa resultados globais
    
    // Ocultar debug
    debugInfo.classList.add('hidden');

    // Mostrar spinner de carregamento
    showLoading(true);
    btnSearch.disabled = true;

    try {
        // Formatar datas para ISO 8601, ajustando para incluir o horário para precisão.
        const dataInicioISO = `${dataInicio.value}T00:00:00Z`;
        const dataFimISO = `${dataFim.value}T23:59:59Z`;

        // Construir URL com parâmetros, solicitando um limite alto (10000)
        const params = new URLSearchParams({
            'founded.gte': dataInicioISO,
            'founded.lte': dataFimISO,
            'company.simei.optant.eq': 'true', // Filtro MEI reativado
            'limit': '1' // Limite máximo solicitado
        });

        const url = `${API_BASE_URL}?${params.toString()}`;
        requestUrlSpan.textContent = url;
        debugInfo.classList.remove('hidden');

        // Fazer requisição à API
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            apiResponseSpan.textContent = `Status: ${response.status}. Resposta: ${errorText}`;
            throw new Error(`Erro na API: ${response.status} - ${response.statusText}. Detalhes no console e na seção de debug.`);
        }

        const data = await response.json();
        apiResponseSpan.textContent = JSON.stringify(data, null, 2).substring(0, 500) + '...'; // Limita o tamanho do log

        // Processar resultados
        if (data.records && data.records.length > 0) {
            allResults = data.records; // Armazena todos os resultados
            displayResults(allResults); // Exibe os resultados
        } else {
            showNoResults();
        }
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        showError(`Erro ao buscar dados: ${error.message}`);
    } finally {
        showLoading(false);
        btnSearch.disabled = false;
    }
}

// Função de utilidade para extrair o telefone de um registro
function extractPhone(empresa) {
    let phone = 'N/A';
    let phoneData = null;
    let inferredDDD = null;

    // 1. Tenta inferir o DDD a partir do endereço (UF)
    const uf = empresa.address?.state;
    if (uf) {
        inferredDDD = getDDDByState(uf);
    }

    // 2. Tenta extrair o número de telefone de forma mais robusta
    // Lista de possíveis campos de telefone, em ordem de prioridade
    const phoneFields = [
        empresa.company?.phone,
        empresa.phone,
        empresa.phone_alt
    ];

    // 2.1. Prioriza o primeiro telefone do array 'phones' se existir
    if (Array.isArray(empresa.phones) && empresa.phones.length > 0) {
        phoneData = empresa.phones[0];
    } else {
        // 2.2. Busca nos campos de string/objeto
        for (const field of phoneFields) {
            if (field) {
                phoneData = field;
                break;
            }
        }
    }

    // 3. Processa o dado encontrado
    if (typeof phoneData === 'string' && phoneData.trim() !== '') {
        // Se for uma string pura (ex: "11999999999" ou "40787834"), tenta formatar
        phone = formatarTelefone(phoneData, '55', inferredDDD);
    } else if (phoneData && typeof phoneData === 'object') {
        // Se for um objeto (com number/value e area/DDD)
        const number = phoneData.number || phoneData.value;
        const ddd = phoneData.area; // O DDD é o campo 'area' na API cnpja.com
        const countryCode = phoneData.countryCode || '55'; // Usa '55' como padrão se não houver

        // Se o DDD for encontrado na API, ele tem prioridade sobre o DDD inferido pela UF
        const finalDDD = ddd || inferredDDD;

        if (number) {
            // Passa o número, o código do país e o DDD real/inferido para a função de formatação
            phone = formatarTelefone(number, countryCode, finalDDD);
        }
    }
    
    // 4. Fallback: Se a extração falhou, tenta o primeiro item do array 'phones' novamente,
    // caso ele seja um objeto ou string que não foi pego na primeira tentativa.
    if (phone === 'N/A' && Array.isArray(empresa.phones) && empresa.phones.length > 0) {
        const firstPhone = empresa.phones[0];
        if (typeof firstPhone === 'string' && firstPhone.trim() !== '') {
            phone = formatarTelefone(firstPhone, '55', inferredDDD);
        } else if (firstPhone && (firstPhone.number || firstPhone.value)) {
            const ddd = firstPhone.area; // O DDD é o campo 'area' na API cnpja.com
            const countryCode = firstPhone.countryCode || '55';
            const finalDDD = ddd || inferredDDD;
            phone = formatarTelefone(firstPhone.number || firstPhone.value, countryCode, finalDDD);
        }
    }

    return phone;
}

// Função para inferir o DDD a partir da UF (Estado)
function getDDDByState(uf) {
    const dddMap = {
        'AC': '68', 'AL': '82', 'AP': '96', 'AM': '92', 'BA': '71', 'CE': '85', 'DF': '61',
        'ES': '27', 'GO': '62', 'MA': '98', 'MT': '65', 'MS': '67', 'MG': '31', 'PA': '91',
        'PB': '83', 'PR': '41', 'PE': '81', 'PI': '86', 'RJ': '21', 'RN': '84', 'RS': '51',
        'RO': '69', 'RR': '95', 'SC': '48', 'SP': '11', 'SE': '79', 'TO': '63'
    };
    return dddMap[uf.toUpperCase()] || null;
}

// Função de utilidade para extrair o email de um registro
function extractEmail(empresa) {
    let email = 'N/A';
    // Tenta extrair o email de diferentes campos
    const emailData = empresa.company?.email || empresa.emails?.[0] || empresa.email;

    if (typeof emailData === 'string' && emailData.trim() !== '') {
        email = emailData;
    } else if (emailData && typeof emailData === 'object' && (emailData.address || emailData.value)) {
        email = emailData.address || emailData.value;
    } else if (Array.isArray(empresa.emails) && empresa.emails.length > 0) {
        const firstEmail = empresa.emails[0];
        if (typeof firstEmail === 'string' && firstEmail.trim() !== '') {
            email = firstEmail;
        } else if (firstEmail && (firstEmail.address || firstEmail.value)) {
            email = firstEmail.address || firstEmail.value;
        }
    }
    return email;
}

// Função para exportar dados completos (CNPJ, Razão Social, Email, Telefone, etc) para CSV
function exportData() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    // Cria o cabeçalho do CSV
    const header = ['CNPJ', 'Razão Social', 'Email', 'Telefone', 'Data de Abertura', 'Status'].join(';');
    
    const dataLines = allResults.map(empresa => {
        const cnpj = empresa.taxId || 'N/A';
        const razaoSocial = empresa.company?.name || 'N/A';
        const email = extractEmail(empresa);
        const telefone = extractPhone(empresa); // Novo campo
        const dataAbertura = formatarData(empresa.founded);
        const status = empresa.status?.text || 'N/A';

        // Usa aspas duplas para encapsular campos que podem conter o separador (e-mail, razão social)
        return [
            `"${formatarCNPJ(cnpj)}"`,
            `"${razaoSocial}"`,
            `"${email}"`,
            `"${telefone}"`,
            `"${dataAbertura}"`,
            `"${status}"`
        ].join(';');
    });

    const csvContent = [header, ...dataLines].join('\n');
    
    // Cria um Blob para download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Cria um link temporário para iniciar o download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'empresas_mei_export.csv';
    document.body.appendChild(a);
    a.click();
    
    // Limpa o link temporário e o URL do objeto
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação concluída! ${allResults.length} registro(s) exportado(s) para "empresas_mei_export.csv".`);
}

// Função para exportar emails
function exportEmails() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    const emails = allResults
        .map(empresa => extractEmail(empresa))
        .filter(email => email !== 'N/A');

    if (emails.length === 0) {
        alert('Nenhum email válido encontrado para exportar.');
        return;
    }

    const emailsText = emails.join('\n');
    
    // Cria um Blob para download
    const blob = new Blob([emailsText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Cria um link temporário para iniciar o download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'emails_mei_export.txt';
    document.body.appendChild(a);
    a.click();
    
    // Limpa o link temporário e o URL do objeto
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação concluída! ${emails.length} e-mail(s) exportado(s) para "emails_mei_export.txt".`);
}

// Função para exportar telefones
function exportPhones() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    const phones = allResults
        .map(empresa => extractPhone(empresa))
        .filter(phone => phone !== 'N/A');

    if (phones.length === 0) {
        alert('Nenhum telefone válido encontrado para exportar.');
        return;
    }

    const phonesText = phones.join('\n');
    
    // Cria um Blob para download
    const blob = new Blob([phonesText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Cria um link temporário para iniciar o download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'telefones_mei_export.txt';
    document.body.appendChild(a);
    a.click();
    
    // Limpa o link temporário e o URL do objeto
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação concluída! ${phones.length} telefone(s) exportado(s) para "telefones_mei_export.txt".`);
}

// Função para exibir resultados
function displayResults(results) {
    // Limpar tabela
    tableBody.innerHTML = '';

    // Adicionar linhas à tabela
    results.forEach((empresa, index) => {
        const row = document.createElement('tr');
        
        // Extrair dados
        const cnpj = empresa.taxId || 'N/A';
        const razaoSocial = empresa.company?.name || 'N/A';
        const email = extractEmail(empresa); // Usa a função de utilidade
        const telefone = extractPhone(empresa); // Novo campo
        const dataAbertura = formatarData(empresa.founded);
        const status = empresa.status?.text || 'N/A';
        const statusClass = status === 'Ativa' ? 'status-active' : 'status-inactive';

        row.innerHTML = `
            <td><strong>${formatarCNPJ(cnpj)}</strong></td>
            <td>${razaoSocial}</td>
            <td><a href="mailto:${email}">${email}</a></td>
            <td>${telefone}</td>
            <td>${dataAbertura}</td>
            <td><span class="${statusClass}">${status}</span></td>
        `;

        tableBody.appendChild(row);
    });

    // Atualizar contagem de resultados
    resultCount.textContent = `${results.length} empresa(s) encontrada(s)`;

    // Adiciona os botões de exportar
    const exportEmailButton = document.getElementById('btnExportEmails');
    const exportPhoneButton = document.getElementById('btnExportPhones');
    if (exportEmailButton) {
        exportEmailButton.classList.remove('hidden');
    }
    if (exportPhoneButton) {
        exportPhoneButton.classList.remove('hidden');
    }

    // Mostrar container de resultados
    resultsContainer.classList.remove('hidden');
    noResults.classList.add('hidden');
    debugInfo.classList.add('hidden'); // Oculta a seção de debug após o sucesso
}

// Função para exibir mensagem de nenhum resultado
function showNoResults() {
    resultsContainer.classList.add('hidden');
    noResults.classList.remove('hidden');
    debugInfo.classList.add('hidden');
}

// Função para exibir erro
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    debugInfo.classList.add('hidden');
}

// Função para limpar resultados
function clearResults() {
    tableBody.innerHTML = '';
    errorMessage.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    noResults.classList.add('hidden');
    debugInfo.classList.add('hidden');
    // Oculta os botões de exportar
    const exportEmailButton = document.getElementById('btnExportEmails');
    const exportPhoneButton = document.getElementById('btnExportPhones');
    if (exportEmailButton) {
        exportEmailButton.classList.add('hidden');
    }
    if (exportPhoneButton) {
        exportPhoneButton.classList.add('hidden');
    }
}

// Função para mostrar/ocultar spinner
function showLoading(show) {
    if (show) {
        loadingSpinner.classList.remove('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
}

// Função para formatar telefone
function formatarTelefone(numero, countryCode = '55', inferredDDD = null) {
    if (!numero) return 'N/A';
    
    // Função auxiliar para aplicar a regra de formatação final de exportação
    function formatarFinalParaExportacao(ddd, numeroSemDDD) {
        const dddInt = parseInt(ddd, 10);
        let numeroFinal = numeroSemDDD;

        // Regra 1: DDDs 11 a 29 DEVEM ter o 9 adicional.
        // Saída esperada: 55 + DDD + 9 dígitos (total 13)
        if (dddInt >= 11 && dddInt <= 29) {
            
            // Se o número tem 8 dígitos (ex: 88887777), adicionamos o 9 na frente para forçar 9 dígitos.
            // Isso é o que o usuário solicitou para a faixa 11-29.
            if (numeroSemDDD.length === 8) {
                numeroFinal = '9' + numeroSemDDD;
            } else if (numeroSemDDD.length === 9) {
                // Já tem 9 dígitos, está correto.
                numeroFinal = numeroSemDDD;
            } else {
                // Caso inesperado, retorna o número original com DDD e código do país.
                return countryCode + ddd + numeroSemDDD;
            }
            
            // A saída final é 55 + DDD + NÚMERO (com 9 dígitos)
            return countryCode + ddd + numeroFinal;

        } else {
            // Regra 2: Demais DDDs NÃO PODEM ter o 9 adicional.
            // Saída esperada: 55 + DDD + 8 dígitos (total 12)
            
            if (numeroSemDDD.length === 9 && numeroSemDDD.startsWith('9')) {
                // Se tem 9 dígitos e começa com 9, remove o 9.
                numeroFinal = numeroSemDDD.substring(1);
            } else if (numeroSemDDD.length === 8) {
                // Já tem 8 dígitos, está correto.
                numeroFinal = numeroSemDDD;
            } else {
                // Caso inesperado, retorna o número original com DDD e código do país.
                return countryCode + ddd + numeroSemDDD;
            }
            
            // A saída final é 55 + DDD + NÚMERO (com 8 dígitos)
            return countryCode + ddd + numeroFinal;
        }
    }
    
    // Remove tudo que não é dígito
    let numLimpo = numero.replace(/\D/g, '');
    
    if (numLimpo.length === 0) return 'N/A';

    // 1. Tenta remover o código do país (55) se o número for longo o suficiente (12 ou 13 dígitos)
    if (countryCode && numLimpo.startsWith(countryCode)) {
        const numeroSemCountryCode = numLimpo.substring(countryCode.length);
        
        // Se o número restante tiver 10 (fixo) ou 11 (celular) dígitos, removemos o código do país.
        if (numeroSemCountryCode.length === 10 || numeroSemCountryCode.length === 11) {
            numLimpo = numeroSemCountryCode;
        }
    }
    
    // 2. Se o número for de 8 ou 9 dígitos e houver um DDD inferido, prefixa o número.
    if ((numLimpo.length === 8 || numLimpo.length === 9) && inferredDDD) {
        numLimpo = inferredDDD + numLimpo;
    }

    // 3. Verifica se o número tem 10 ou 11 dígitos (DDD + Número)
    if (numLimpo.length === 10 || numLimpo.length === 11) {
        const ddd = numLimpo.substring(0, 2);
        const numeroSemDDD = numLimpo.substring(2);
        
        // Aplica a nova lógica de formatação final
        return formatarFinalParaExportacao(ddd, numeroSemDDD);
    } else {
        // Se não for possível formatar como BR, retorna o número limpo completo
        return numLimpo;
    }
}

// Função para formatar CNPJ
function formatarCNPJ(cnpj) {
    if (!cnpj || cnpj === 'N/A') return cnpj;
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return cnpj;
    return `${cnpjLimpo.substring(0, 2)}.${cnpjLimpo.substring(2, 5)}.${cnpjLimpo.substring(5, 8)}/${cnpjLimpo.substring(8, 12)}-${cnpjLimpo.substring(12)}`;
}

// Função para formatar data
function formatarData(data) {
    if (!data || data === 'N/A') return data;
    try {
        const date = new Date(data);
        return date.toLocaleDateString('pt-BR');
    } catch (error) {
        return data;
    }
}

// Definir data padrão (últimos 6 meses)
function setDefaultDates() {
    const hoje = new Date();
    // Define o período padrão para os últimos 6 meses (aprox. 180 dias)
    const seisMeses = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000);

    dataFim.value = hoje.toISOString().split('T')[0];
    dataInicio.value = seisMeses.toISOString().split('T')[0];
}

// Inicializar com datas padrão
setDefaultDates();

// Event Listeners
searchForm.addEventListener('submit', handleSearch);
// Adiciona os listeners para os botões de exportar
document.addEventListener('click', function(e) {
    if (e.target.id === 'btnExportEmails') {
        exportEmails(); // Chama a função que exporta apenas emails
    } else if (e.target.id === 'btnExportPhones') {
        exportPhones(); // Chama a função que exporta apenas telefones
    }
});

// Ocultar os botões de exportar no início
document.addEventListener('DOMContentLoaded', () => {
    const exportEmailButton = document.getElementById('btnExportEmails');
    const exportPhoneButton = document.getElementById('btnExportPhones');
    if (exportEmailButton) {
        exportEmailButton.classList.add('hidden');
    }
    if (exportPhoneButton) {
        exportPhoneButton.classList.add('hidden');
    }
});
