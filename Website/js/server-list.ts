const STORAGE_KEY = 'pixelphyx-saved-servers-v1';
const LEGACY_KEY = 'pixelphyx-server-address';

function readServers() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(value)) {
      return value.filter(server =>
        server &&
        typeof server.id === 'string' &&
        typeof server.name === 'string' &&
        typeof server.address === 'string'
      );
    }
  } catch (error) {
    console.warn('Could not load saved PixelPhyx servers:', error);
  }
  return [];
}

function saveServers(servers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    return true;
  } catch (error) {
    console.warn('Could not save PixelPhyx servers:', error);
    alert('Your server list could not be saved in this browser.');
    return false;
  }
}

function createButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function initializeServerList() {
  const addressInput = document.querySelector('#serverAddress');
  const connectButton = document.querySelector('#connectServer');
  const addressSection = addressInput?.closest('.online-section');
  if (!addressSection || !connectButton || document.querySelector('#savedServerList')) return;

  const style = document.createElement('style');
  style.textContent = `
    .saved-servers{display:flex;flex-direction:column;gap:8px;margin-top:10px}
    .saved-server{display:flex;align-items:center;gap:10px;padding:10px;background:#202b3a;border:1px solid #344357;border-radius:8px;min-width:0}
    .saved-server-info{min-width:0;flex:1}
    .saved-server-name{display:block;color:#edf3fb;font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .saved-server-address{display:block;margin-top:4px;color:#91a1b7;font:10px 'DM Mono',monospace;overflow-wrap:anywhere}
    .saved-server-actions{display:flex;gap:5px;flex:none}
    .saved-server-actions .btn{padding:7px 8px;font-size:10px}
    .saved-server-actions .remove{color:#ff9999;border-color:#754044}
    .saved-server-empty{padding:14px;text-align:center;color:#91a1b7;border:1px dashed #40516a;border-radius:8px;font-size:11px}
    .saved-server-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding:11px;background:#111a26;border:1px solid #344357;border-radius:8px}
    .saved-server-form label{display:block;margin-bottom:5px;color:#aebdd0;font-size:10px}
    .saved-server-form input{width:100%;min-width:0;padding:9px;background:#0e151f;border:1px solid #344357;border-radius:7px;color:#edf3fb}
    .saved-server-form .address-field,.saved-server-form .form-actions{grid-column:1/-1}
    .saved-server-form .form-actions{display:flex;justify-content:flex-end;gap:7px}
    @media(max-width:520px){.saved-server{align-items:flex-start;flex-direction:column}.saved-server-actions{width:100%}.saved-server-actions .btn{flex:1}.saved-server-form{grid-template-columns:1fr}.saved-server-form .address-field,.saved-server-form .form-actions{grid-column:auto}}
  `;
  document.head.append(style);

  const section = document.createElement('div');
  section.className = 'online-section';
  section.id = 'savedServerList';
  section.innerHTML = `
    <div class="section-title"><span>Saved servers</span><button class="btn primary" id="addSavedServer" type="button" style="padding:6px 9px">+ Add server</button></div>
    <div class="saved-servers" id="savedServers"></div>
    <form class="saved-server-form" id="savedServerForm" hidden>
      <div><label for="savedServerName">Server name</label><input id="savedServerName" maxlength="40" placeholder="My server" required></div>
      <div class="address-field"><label for="savedServerAddress">Server address</label><input id="savedServerAddress" maxlength="255" placeholder="192.168.1.25:3000" autocomplete="url" required></div>
      <div class="form-actions"><button class="btn ghost" id="cancelSavedServer" type="button">Cancel</button><button class="btn primary" type="submit">Save server</button></div>
    </form>
  `;
  addressSection.before(section);

  const list = section.querySelector('#savedServers');
  const form = section.querySelector('#savedServerForm');
  const nameInput = section.querySelector('#savedServerName');
  const savedAddressInput = section.querySelector('#savedServerAddress');
  let servers = readServers();
  let editingId = null;

  const legacyAddress = localStorage.getItem(LEGACY_KEY) || '';
  if (!servers.length && legacyAddress) {
    servers.push({
      id: 'server-' + Date.now().toString(36),
      name: 'Previous server',
      address: legacyAddress
    });
    saveServers(servers);
  }

  function closeForm() {
    editingId = null;
    form.reset();
    form.hidden = true;
  }

  function openForm(server = null) {
    editingId = server?.id || null;
    nameInput.value = server?.name || '';
    savedAddressInput.value = server?.address || '';
    form.hidden = false;
    nameInput.focus();
  }

  function render() {
    list.replaceChildren();
    if (!servers.length) {
      const empty = document.createElement('div');
      empty.className = 'saved-server-empty';
      empty.textContent = 'No saved servers yet. Add an IP address or hostname to keep it here.';
      list.append(empty);
      return;
    }

    for (const server of servers) {
      const card = document.createElement('div');
      card.className = 'saved-server';

      const info = document.createElement('div');
      info.className = 'saved-server-info';
      const name = document.createElement('span');
      name.className = 'saved-server-name';
      name.textContent = server.name;
      const address = document.createElement('span');
      address.className = 'saved-server-address';
      address.textContent = server.address;
      info.append(name, address);

      const actions = document.createElement('div');
      actions.className = 'saved-server-actions';
      actions.append(
        createButton('Join', 'btn primary', () => {
          addressInput.value = server.address;
          connectButton.click();
        }),
        createButton('Edit', 'btn', () => openForm(server)),
        createButton('Remove', 'btn remove', () => {
          if (!confirm('Remove "' + server.name + '" from your saved servers?')) return;
          servers = servers.filter(item => item.id !== server.id);
          if (saveServers(servers)) render();
        })
      );

      card.append(info, actions);
      list.append(card);
    }
  }

  section.querySelector('#addSavedServer').addEventListener('click', () => openForm());
  section.querySelector('#cancelSavedServer').addEventListener('click', closeForm);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const address = savedAddressInput.value.trim();
    if (!name || !address) return;

    if (editingId) {
      const existing = servers.find(server => server.id === editingId);
      if (!existing) return;
      existing.name = name;
      existing.address = address;
    } else {
      servers.push({
        id: 'server-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
        name,
        address
      });
    }

    if (saveServers(servers)) {
      closeForm();
      render();
    }
  });

  render();
}

initializeServerList();
