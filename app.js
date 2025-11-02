const editor = document.getElementById('editor');
const statusIndicator = document.getElementById('statusIndicator');
const historyLog = document.getElementById('historyLog');
const tooltipList = document.getElementById('tooltipList');
const tooltipDialog = document.getElementById('tooltipDialog');
const tooltipForm = document.getElementById('tooltipForm');
const tooltipTextInput = document.getElementById('tooltipText');
const tooltipIconInput = document.getElementById('tooltipIcon');
const linkDialog = document.getElementById('linkDialog');
const linkForm = document.getElementById('linkForm');
const linkUrlInput = document.getElementById('linkUrl');
const linkNewTabCheckbox = document.getElementById('linkNewTab');
const autoSaveToggle = document.getElementById('autoSaveToggle');

const storageKey = 'advanced-editor-content';
const tooltipSelectionKey = 'tooltip-selection';
const maxHistoryEntries = 25;
let historyEntries = [];
let pendingSave = null;

const withSelectionGuard = (callback) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    notify('Selecione um trecho do texto primeiro.', 'warning');
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    notify('A seleção precisa estar dentro do editor.', 'warning');
    return null;
  }

  return callback(range, selection);
};

const notify = (message, tone = 'info') => {
  statusIndicator.textContent = message;
  statusIndicator.dataset.tone = tone;
  statusIndicator.className = `status status--${tone}`;
  clearTimeout(statusIndicator._timeout);
  statusIndicator._timeout = setTimeout(() => {
    statusIndicator.textContent = '';
    statusIndicator.className = 'status';
  }, 3200);
};

const execCommand = (command, value = null) => {
  document.execCommand(command, false, value);
  recordHistory(`Comando executado: ${command}${value ? ` (${value})` : ''}`);
  updateTooltipsPanel();
  scheduleSave();
};

const resetPlaceholder = () => {
  const hasContent = editor.textContent.trim().length > 0;
  editor.classList.toggle('editor--empty', !hasContent);
};

const recordHistory = (label) => {
  const entry = {
    id: crypto.randomUUID(),
    label,
    timestamp: new Date(),
  };

  historyEntries.unshift(entry);

  if (historyEntries.length > maxHistoryEntries) {
    historyEntries = historyEntries.slice(0, maxHistoryEntries);
  }

  renderHistory();
};

const renderHistory = () => {
  if (!historyEntries.length) {
    historyLog.innerHTML = '<p>Nenhuma alteração registrada ainda.</p>';
    return;
  }

  historyLog.innerHTML = historyEntries
    .map(
      (entry) => `
      <div class="history__item" data-entry="${entry.id}">
        <strong>${entry.timestamp.toLocaleTimeString('pt-BR')}</strong>
        <div>${entry.label}</div>
      </div>
    `
    )
    .join('');
};

const scheduleSave = () => {
  if (!autoSaveToggle.checked) return;
  clearTimeout(pendingSave);
  pendingSave = setTimeout(saveContent, 600);
};

const saveContent = () => {
  localStorage.setItem(storageKey, editor.innerHTML);
  recordHistory('Conteúdo salvo automaticamente');
  notify('Conteúdo salvo automaticamente', 'success');
};

const loadContent = () => {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    editor.innerHTML = saved;
    resetPlaceholder();
    updateTooltipsPanel();
    recordHistory('Conteúdo restaurado do navegador');
    notify('Conteúdo carregado automaticamente', 'success');
  }
};

const wrapSelectionWithTooltip = (tooltipText, tooltipIcon = '') =>
  withSelectionGuard((range, selection) => {
    if (range.collapsed) {
      notify('Selecione o texto que deseja anotar.', 'warning');
      return null;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'tooltip-anchor';
    wrapper.dataset.tooltip = tooltipText.trim();
    wrapper.tabIndex = 0;

    if (tooltipIcon.trim()) {
      wrapper.dataset.icon = tooltipIcon.trim();
    } else {
      delete wrapper.dataset.icon;
    }

    try {
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(wrapper);
      selection.addRange(newRange);
    } catch (err) {
      notify('Não foi possível adicionar a tooltip à seleção.', 'warning');
      console.error(err);
      return null;
    }

    updateTooltipsPanel();
    recordHistory('Tooltip adicionada ao texto selecionado');
    scheduleSave();
    return wrapper;
  });

const updateTooltipsPanel = () => {
  const anchors = editor.querySelectorAll('.tooltip-anchor');
  tooltipList.innerHTML = '';

  if (!anchors.length) {
    tooltipList.innerHTML = '<p>Nenhuma tooltip criada ainda.</p>';
    return;
  }

  anchors.forEach((anchor, index) => {
    const template = document.getElementById('tooltipListItemTemplate');
    const clone = template.content.firstElementChild.cloneNode(true);
    const badge = clone.querySelector('.tooltip-card__badge');
    const preview = clone.querySelector('.tooltip-card__preview');
    const removeButton = clone.querySelector('.tooltip-card__remove');
    const scrollButton = clone.querySelector('.tooltip-card__scroll');
    const editButton = clone.querySelector('.tooltip-card__edit');

    clone.dataset.targetId = anchor.dataset.tooltipId || crypto.randomUUID();
    anchor.dataset.tooltipId = clone.dataset.targetId;

    badge.textContent = `${anchor.dataset.icon || '💬'} Tooltip ${index + 1}`;
    preview.textContent = anchor.dataset.tooltip;

    removeButton.addEventListener('click', () => {
      removeTooltip(anchor);
    });

    scrollButton.addEventListener('click', () => {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      anchor.classList.add('tooltip-anchor--highlight');
      setTimeout(() => anchor.classList.remove('tooltip-anchor--highlight'), 1200);
    });

    editButton.addEventListener('click', () => {
      openTooltipDialog(anchor);
    });

    tooltipList.appendChild(clone);
  });
};

const removeTooltip = (anchor) => {
  const parent = anchor.parentNode;
  while (anchor.firstChild) {
    parent.insertBefore(anchor.firstChild, anchor);
  }
  parent.removeChild(anchor);
  recordHistory('Tooltip removida');
  updateTooltipsPanel();
  scheduleSave();
};

const openTooltipDialog = (anchor = null) => {
  tooltipDialog.returnValue = '';
  tooltipForm.dataset.editing = anchor ? anchor.dataset.tooltipId : '';
  tooltipTextInput.value = anchor ? anchor.dataset.tooltip : '';
  tooltipIconInput.value = anchor ? anchor.dataset.icon || '' : '';

  // Save selection to restore later
  if (!anchor) {
    storeCurrentSelection();
  }

  if (typeof tooltipDialog.showModal === 'function') {
    tooltipDialog.showModal();
    return;
  }

  const tooltipText = prompt('Texto da tooltip:');
  if (!tooltipText) {
    notify('Tooltip cancelada.', 'info');
    return;
  }
  const tooltipIcon = prompt('Ícone opcional para a tooltip (ex: ℹ️ ou ?):') || '';
  if (anchor) {
    anchor.dataset.tooltip = tooltipText;
    if (tooltipIcon) {
      anchor.dataset.icon = tooltipIcon;
    } else {
      delete anchor.dataset.icon;
    }
    recordHistory('Tooltip atualizada');
    notify('Tooltip atualizada com sucesso.', 'success');
    updateTooltipsPanel();
    scheduleSave();
  } else {
    restoreSelection();
    const newAnchor = wrapSelectionWithTooltip(tooltipText, tooltipIcon);
    if (newAnchor) {
      notify('Tooltip criada com sucesso.', 'success');
    }
  }
};

const storeCurrentSelection = () => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const storedRange = {
    startContainerPath: getNodePath(range.startContainer),
    startOffset: range.startOffset,
    endContainerPath: getNodePath(range.endContainer),
    endOffset: range.endOffset,
  };
  sessionStorage.setItem(tooltipSelectionKey, JSON.stringify(storedRange));
};

const restoreSelection = () => {
  const stored = sessionStorage.getItem(tooltipSelectionKey);
  if (!stored) return;
  try {
    const { startContainerPath, startOffset, endContainerPath, endOffset } = JSON.parse(stored);
    const startNode = resolveNodePath(startContainerPath);
    const endNode = resolveNodePath(endContainerPath);
    if (!startNode || !endNode) return;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (error) {
    console.warn('Não foi possível restaurar a seleção:', error);
  } finally {
    sessionStorage.removeItem(tooltipSelectionKey);
  }
};

const getNodePath = (node) => {
  const path = [];
  let current = node;
  while (current && current !== editor && current.parentNode) {
    const siblings = Array.from(current.parentNode.childNodes);
    path.unshift(siblings.indexOf(current));
    current = current.parentNode;
  }
  return path;
};

const resolveNodePath = (path) => {
  let current = editor;
  for (const index of path) {
    if (!current.childNodes[index]) return null;
    current = current.childNodes[index];
  }
  return current;
};

const bindToolbarButtons = () => {
  const buttons = document.querySelectorAll('.toolbar__button[data-command]');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const command = button.dataset.command;
      const value = button.dataset.value || null;
      execCommand(command, value);
    });
  });

  const textColorInput = document.getElementById('textColor');
  const highlightColorInput = document.getElementById('highlightColor');

  textColorInput.addEventListener('input', (event) => {
    execCommand('foreColor', event.target.value);
  });

  highlightColorInput.addEventListener('input', (event) => {
    const color = event.target.value;
    if (!document.execCommand('hiliteColor', false, color)) {
      execCommand('backColor', color);
      return;
    }
    recordHistory('Cor de destaque aplicada');
    scheduleSave();
  });
};

const bindActions = () => {
  document.getElementById('addTooltipButton').addEventListener('click', () => openTooltipDialog());

  document.getElementById('clearFormattingButton').addEventListener('click', () => {
    execCommand('removeFormat');
    Array.from(editor.querySelectorAll('span[style], font')).forEach((node) => {
      const parent = node.parentNode;
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
    });
    recordHistory('Formatação limpa');
    scheduleSave();
  });

  document.getElementById('addLinkButton').addEventListener('click', () => {
    withSelectionGuard((range) => {
      if (range.collapsed) {
        notify('Selecione o texto que deseja transformar em link.', 'warning');
        return;
      }
      storeCurrentSelection();
      linkUrlInput.value = '';
      linkNewTabCheckbox.checked = true;
      if (typeof linkDialog.showModal === 'function') {
        linkDialog.showModal();
        return;
      }
      const url = prompt('Informe a URL do link:');
      if (!url) {
        notify('Link cancelado.', 'info');
        return;
      }
      restoreSelection();
      withSelectionGuard(() => {
        document.execCommand('createLink', false, url);
        const anchors = editor.querySelectorAll(`a[href="${url}"]`);
        if (anchors.length) {
          const anchor = anchors[anchors.length - 1];
          anchor.rel = 'noopener noreferrer';
          anchor.target = '_blank';
        }
        notify('Link inserido com sucesso.', 'success');
        recordHistory('Link adicionado');
        scheduleSave();
      });
    });
  });

  document.getElementById('clearDocumentButton').addEventListener('click', () => {
    if (!confirm('Tem certeza de que deseja limpar o documento inteiro?')) {
      return;
    }
    editor.innerHTML = '<p></p>';
    historyEntries = [];
    renderHistory();
    updateTooltipsPanel();
    resetPlaceholder();
    localStorage.removeItem(storageKey);
    notify('Documento limpo.', 'success');
  });

  document.getElementById('copyHtmlButton').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(editor.innerHTML);
      notify('HTML copiado para a área de transferência.', 'success');
    } catch (error) {
      notify('Não foi possível copiar o HTML.', 'warning');
      console.error(error);
    }
  });

  document.getElementById('exportHtmlButton').addEventListener('click', () => {
    const blob = new Blob([editor.innerHTML], { type: 'text/html;charset=utf-8' });
    triggerDownload(blob, 'documento-rich-text.html');
    recordHistory('HTML exportado');
  });

  document.getElementById('exportMarkdownButton').addEventListener('click', () => {
    const markdown = htmlToMarkdown(editor.innerHTML);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    triggerDownload(blob, 'documento-rich-text.md');
    recordHistory('Markdown exportado');
  });

  autoSaveToggle.addEventListener('change', () => {
    if (autoSaveToggle.checked) {
      notify('Salvamento automático ativado.', 'info');
      scheduleSave();
    } else {
      notify('Salvamento automático desativado.', 'warning');
    }
  });
};

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const htmlToMarkdown = (htmlString) => {
  const container = document.createElement('div');
  container.innerHTML = htmlString;

  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue.replace(/\s+/g, ' ');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const children = Array.from(node.childNodes).map(processNode).join('');

    switch (node.tagName.toLowerCase()) {
      case 'h1':
        return `# ${children}\n\n`;
      case 'h2':
        return `## ${children}\n\n`;
      case 'h3':
        return `### ${children}\n\n`;
      case 'h4':
        return `#### ${children}\n\n`;
      case 'strong':
      case 'b':
        return `**${children.trim()}**`;
      case 'em':
      case 'i':
        return `_${children.trim()}_`;
      case 'u':
        return `<u>${children.trim()}</u>`;
      case 's':
      case 'strike':
      case 'del':
        return `~~${children.trim()}~~`;
      case 'blockquote':
        return children
          .split('\n')
          .map((line) => (line.trim() ? `> ${line.trim()}` : '>'))
          .join('\n') + '\n\n';
      case 'p':
      return `${children.trim()}\n\n`;
      case 'br':
        return '  \n';
      case 'ul':
        return children.replace(/^\s*[\r\n]/gm, '') + '\n';
      case 'ol': {
        let index = 1;
        return (
          Array.from(node.children)
            .map((li) => `${index++}. ${processNode(li).trim()}`)
            .join('\n') + '\n\n'
        );
      }
      case 'li':
        return `- ${children.trim()}\n`;
      case 'a': {
        const href = node.getAttribute('href');
        return `[${children.trim()}](${href})`;
      }
      case 'span':
        if (node.classList.contains('tooltip-anchor')) {
          const tooltip = node.dataset.tooltip ? `^{${node.dataset.tooltip}}` : '';
          return `${children.trim()}${tooltip}`;
        }
        return children;
      default:
        return children;
    }
  };

  return processNode(container).replace(/\n{3,}/g, '\n\n').trim();
};

tooltipDialog.addEventListener('close', () => {
  if (tooltipDialog.returnValue !== 'confirm') {
    restoreSelection();
    return;
  }

  const tooltipText = tooltipTextInput.value.trim();
  const tooltipIcon = tooltipIconInput.value.trim();

  if (!tooltipText) {
    notify('Informe um texto para a tooltip.', 'warning');
    restoreSelection();
    return;
  }

  const editingId = tooltipForm.dataset.editing;
  if (editingId) {
    const anchor = editor.querySelector(`.tooltip-anchor[data-tooltip-id="${editingId}"]`);
    if (anchor) {
      anchor.dataset.tooltip = tooltipText;
      if (tooltipIcon) {
        anchor.dataset.icon = tooltipIcon;
      } else {
        delete anchor.dataset.icon;
      }
      recordHistory('Tooltip atualizada');
      notify('Tooltip atualizada com sucesso.', 'success');
      updateTooltipsPanel();
      scheduleSave();
    }
    return;
  }

  restoreSelection();
  const anchor = wrapSelectionWithTooltip(tooltipText, tooltipIcon);
  if (anchor) {
    notify('Tooltip criada com sucesso.', 'success');
  }
});

linkDialog.addEventListener('close', () => {
  if (linkDialog.returnValue !== 'confirm') {
    restoreSelection();
    return;
  }

  const url = linkUrlInput.value.trim();
  if (!url) {
    notify('Informe uma URL válida.', 'warning');
    restoreSelection();
    return;
  }

  restoreSelection();
  withSelectionGuard(() => {
    document.execCommand('createLink', false, url);
    const anchors = editor.querySelectorAll(`a[href="${url}"]`);
    if (anchors.length) {
      const anchor = anchors[anchors.length - 1];
      anchor.rel = 'noopener noreferrer';
      if (linkNewTabCheckbox.checked) {
        anchor.target = '_blank';
      } else {
        anchor.removeAttribute('target');
      }
    }
    notify('Link inserido com sucesso.', 'success');
    recordHistory('Link adicionado');
    scheduleSave();
  });
});

editor.addEventListener('input', () => {
  resetPlaceholder();
  updateTooltipsPanel();
  scheduleSave();
});

editor.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    document.execCommand(event.shiftKey ? 'outdent' : 'indent');
    event.preventDefault();
    recordHistory('Indentação ajustada via Tab');
  }
});

window.addEventListener('beforeunload', () => {
  if (autoSaveToggle.checked) {
    saveContent();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  bindToolbarButtons();
  bindActions();
  loadContent();
  resetPlaceholder();
  updateTooltipsPanel();
});
