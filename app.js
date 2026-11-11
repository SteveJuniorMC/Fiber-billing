(() => {
  'use strict';

  // ---------- Storage ----------
  const STORAGE_KEY = 'fiber-billing-v1';

  function defaultState() {
    return {
      settings: {
        yourName: '',
        business: '',
        address: '',
        phone: '',
        email: '',
        contractorName: 'Community Fiber Solutions',
        contractorAddress: '',
        paymentTerms: 'Due upon receipt',
        nextInvoiceNumber: 1001,
      },
      rates: window.DEFAULT_RATES.map((r) => ({ ...r })),
      projects: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const base = defaultState();
      return {
        settings: { ...base.settings, ...(data.settings || {}) },
        rates: Array.isArray(data.rates) ? data.rates : base.rates,
        projects: Array.isArray(data.projects) ? data.projects : [],
      };
    } catch (e) {
      console.error('Could not load saved data', e);
      return defaultState();
    }
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert('Could not save data on this device: ' + e.message);
    }
  }

  // ---------- Helpers ----------
  const $app = document.getElementById('app');
  const $dialog = document.getElementById('dialog');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const money = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const round2 = (n) => Math.round(n * 100) / 100;
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${m}/${d}/${y}`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

  const itemTotal = (it) => round2(it.qty * it.price);
  const taskTotal = (t) => round2(t.items.reduce((s, it) => s + itemTotal(it), 0));
  const projectTotal = (p) => round2(p.tasks.reduce((s, t) => s + taskTotal(t), 0));
  const findProject = (id) => state.projects.find((p) => p.id === id);
  const findRate = (code) => state.rates.find((r) => r.code === code);

  const STATUS_LABEL = { active: 'In progress', complete: 'Complete', invoiced: 'Invoiced', paid: 'Paid' };

  function codeSummary(p) {
    const map = new Map();
    for (const t of p.tasks) {
      for (const it of t.items) {
        const key = it.code + '|' + it.price;
        const row = map.get(key) || { code: it.code, desc: it.desc, price: it.price, qty: 0 };
        row.qty += it.qty;
        map.set(key, row);
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  function openDialog(html, onMount) {
    $dialog.innerHTML = html;
    $dialog.showModal();
    $dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $dialog.close()));
    if (onMount) onMount($dialog);
  }

  // ---------- Router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    window.scrollTo(0, 0);
    if (parts[0] === 'project' && parts[1]) {
      const p = findProject(parts[1]);
      if (!p) return renderNotFound();
      if (parts[2] === 'invoice') return renderInvoice(p);
      return renderProject(p);
    }
    if (parts[0] === 'settings') return renderSettings();
    return renderProjects();
  }

  function renderNotFound() {
    $app.innerHTML = `<div class="card"><p>Project not found.</p><a class="btn" href="#/">Back to projects</a></div>`;
  }

  // ---------- Projects list ----------
  function renderProjects() {
    const projects = [...state.projects].sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const setupNeeded = !state.settings.yourName && !state.settings.business;
    $app.innerHTML = `
      ${setupNeeded ? `<div class="notice">Tip: add your name and contact info in <a href="#/settings">Settings</a> so it shows up on your invoices.</div>` : ''}
      <div class="row-between">
        <h1>Projects</h1>
        <button class="btn primary" id="addProject">+ Add Project</button>
      </div>
      ${projects.length === 0 ? `<div class="empty">No projects yet. Tap <b>+ Add Project</b> to get started.</div>` : ''}
      <div class="list">
        ${projects.map((p) => `
          <a class="card project-card" href="#/project/${p.id}">
            <div class="row-between">
              <div>
                <div class="title">${esc(p.name)}</div>
                <div class="muted">${p.location ? esc(p.location) + ' · ' : ''}${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'} · started ${fmtDate(p.created)}</div>
              </div>
              <div class="right">
                <div class="amount">${money(projectTotal(p))}</div>
                <span class="badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
              </div>
            </div>
          </a>`).join('')}
      </div>
    `;
    document.getElementById('addProject').addEventListener('click', () => projectDialog());
  }

  function projectDialog(existing) {
    const p = existing || { name: '', location: '', notes: '' };
    openDialog(`
      <form method="dialog" class="form">
        <h2>${existing ? 'Edit Project' : 'New Project'}</h2>
        <label>Project name<input name="name" required value="${esc(p.name)}" placeholder="e.g. Scarborough St"></label>
        <label>Location / city<input name="location" value="${esc(p.location)}" placeholder="e.g. Columbus, OH"></label>
        <label>Job / PO number (optional)<input name="po" value="${esc(p.po || '')}"></label>
        <label>Notes<textarea name="notes" rows="2">${esc(p.notes)}</textarea></label>
        <div class="actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn primary">${existing ? 'Save' : 'Create'}</button>
        </div>
      </form>`, (d) => {
      const f = d.querySelector('form');
      f.name.focus();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = f.name.value.trim();
        if (!name) return;
        if (existing) {
          Object.assign(existing, { name, location: f.location.value.trim(), po: f.po.value.trim(), notes: f.notes.value.trim() });
          save();
          d.close();
          route();
        } else {
          const np = { id: uid(), name, location: f.location.value.trim(), po: f.po.value.trim(), notes: f.notes.value.trim(), status: 'active', created: today(), tasks: [] };
          state.projects.push(np);
          save();
          d.close();
          location.hash = `#/project/${np.id}`;
        }
      });
    });
  }

  // ---------- Project detail ----------
  function renderProject(p) {
    const locked = p.status === 'invoiced' || p.status === 'paid';
    $app.innerHTML = `
      <a href="#/" class="back">&larr; All projects</a>
      <div class="card">
        <div class="row-between">
          <div>
            <h1>${esc(p.name)}</h1>
            <div class="muted">${p.location ? esc(p.location) + ' · ' : ''}${p.po ? 'PO ' + esc(p.po) + ' · ' : ''}started ${fmtDate(p.created)}</div>
            ${p.notes ? `<div class="muted small">${nl2br(p.notes)}</div>` : ''}
          </div>
          <div class="right">
            <div class="amount big">${money(projectTotal(p))}</div>
            <select id="status" class="status-select">
              ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="actions wrap">
          <button class="btn" id="editProject">Edit</button>
          <a class="btn primary" href="#/project/${p.id}/invoice">Create Invoice</a>
          <button class="btn danger" id="deleteProject">Delete</button>
        </div>
        ${locked ? `<div class="notice small">This project is marked ${STATUS_LABEL[p.status].toLowerCase()}. Change the status to edit tasks.</div>` : ''}
      </div>

      <div class="row-between">
        <h2>Tasks</h2>
        ${locked ? '' : `<button class="btn primary" id="addTask">+ Add Task</button>`}
      </div>
      ${p.tasks.length === 0 ? `<div class="empty">No tasks yet. Add a task for each splice case or terminal.</div>` : ''}
      <div class="list">
        ${p.tasks.map((t, i) => renderTask(p, t, i, locked)).join('')}
      </div>
    `;

    document.getElementById('status').addEventListener('change', (e) => {
      p.status = e.target.value;
      save();
      route();
    });
    document.getElementById('editProject').addEventListener('click', () => projectDialog(p));
    document.getElementById('deleteProject').addEventListener('click', () => {
      if (confirm(`Delete project "${p.name}" and all its tasks? This cannot be undone.`)) {
        state.projects = state.projects.filter((x) => x !== p);
        save();
        location.hash = '#/';
      }
    });
    if (!locked) document.getElementById('addTask').addEventListener('click', () => taskDialog(p));

    $app.querySelectorAll('[data-task]').forEach((el) => {
      const t = p.tasks.find((x) => x.id === el.dataset.task);
      if (!t || locked) return;
      el.querySelector('[data-act="add-code"]').addEventListener('click', () => codePicker(p, t));
      el.querySelector('[data-act="edit-task"]').addEventListener('click', () => taskDialog(p, t));
      el.querySelector('[data-act="dup-task"]').addEventListener('click', () => {
        const copy = { ...t, id: uid(), name: t.name + ' (copy)', items: t.items.map((it) => ({ ...it, id: uid() })) };
        p.tasks.splice(p.tasks.indexOf(t) + 1, 0, copy);
        save();
        route();
      });
      el.querySelector('[data-act="del-task"]').addEventListener('click', () => {
        if (confirm(`Delete task "${t.name}"?`)) {
          p.tasks = p.tasks.filter((x) => x !== t);
          save();
          route();
        }
      });
      el.querySelectorAll('[data-item]').forEach((row) => {
        const it = t.items.find((x) => x.id === row.dataset.item);
        const setQty = (q) => {
          q = Math.max(0, Math.round(q * 100) / 100);
          if (q === 0) {
            if (!confirm(`Remove ${it.code} from this task?`)) return route();
            t.items = t.items.filter((x) => x !== it);
          } else {
            it.qty = q;
          }
          save();
          route();
        };
        row.querySelector('[data-act="minus"]').addEventListener('click', () => setQty(it.qty - 1));
        row.querySelector('[data-act="plus"]').addEventListener('click', () => setQty(it.qty + 1));
        row.querySelector('input').addEventListener('change', (e) => setQty(parseFloat(e.target.value) || 0));
      });
    });
  }

  function renderTask(p, t, i, locked) {
    return `
      <div class="card task" data-task="${t.id}">
        <div class="row-between">
          <div>
            <div class="title">${i + 1}. ${esc(t.name)}</div>
            ${t.notes ? `<div class="muted small">${nl2br(t.notes)}</div>` : ''}
          </div>
          <div class="amount">${money(taskTotal(t))}</div>
        </div>
        ${t.items.length ? `
        <table class="items">
          <tbody>
            ${t.items.map((it) => `
              <tr data-item="${it.id}">
                <td class="code">${esc(it.code)}</td>
                <td class="desc">${esc(it.desc)}<div class="muted small">${money(it.price)} each</div></td>
                <td class="qty">
                  ${locked ? `<span>${it.qty}</span>` : `
                  <div class="stepper">
                    <button type="button" data-act="minus" aria-label="Decrease">&minus;</button>
                    <input type="number" inputmode="decimal" min="0" step="1" value="${it.qty}" aria-label="Quantity">
                    <button type="button" data-act="plus" aria-label="Increase">+</button>
                  </div>`}
                </td>
                <td class="line">${money(itemTotal(it))}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : `<div class="muted small pad">No billing codes yet.</div>`}
        ${locked ? '' : `
        <div class="actions wrap">
          <button class="btn primary small" data-act="add-code">+ Add Code</button>
          <button class="btn small" data-act="edit-task">Edit</button>
          <button class="btn small" data-act="dup-task">Duplicate</button>
          <button class="btn small danger" data-act="del-task">Delete</button>
        </div>`}
      </div>`;
  }

  function taskDialog(p, existing) {
    const t = existing || { name: '', notes: '' };
    openDialog(`
      <form method="dialog" class="form">
        <h2>${existing ? 'Edit Task' : 'New Task'}</h2>
        <label>Task name<input name="name" required value="${esc(t.name)}" placeholder="e.g. Splice case @ 123 Scarborough St"></label>
        <div class="chips">
          ${['Splice Case', 'Terminal', 'Pedestal', 'Ring Cut'].map((s) => `<button type="button" class="chip" data-suggest="${s}">${s}</button>`).join('')}
        </div>
        <label>Notes (address, pole #, fiber count…)<textarea name="notes" rows="2">${esc(t.notes)}</textarea></label>
        <div class="actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn primary">${existing ? 'Save' : 'Add Task'}</button>
        </div>
      </form>`, (d) => {
      const f = d.querySelector('form');
      f.name.focus();
      d.querySelectorAll('[data-suggest]').forEach((b) => b.addEventListener('click', () => {
        const n = p.tasks.filter((x) => x.name.startsWith(b.dataset.suggest)).length + 1;
        f.name.value = `${b.dataset.suggest} ${n}`;
        f.name.focus();
      }));
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = f.name.value.trim();
        if (!name) return;
        if (existing) {
          existing.name = name;
          existing.notes = f.notes.value.trim();
          save();
          d.close();
          route();
        } else {
          const nt = { id: uid(), name, notes: f.notes.value.trim(), items: [] };
          p.tasks.push(nt);
          save();
          d.close();
          route();
          codePicker(p, nt);
        }
      });
    });
  }

  function codePicker(p, t) {
    openDialog(`
      <div class="form">
        <h2>Add billing codes</h2>
        <div class="muted small">Task: ${esc(t.name)} — tap a code to add 1. Tap again to add more.</div>
        <div class="code-list">
          ${state.rates.map((r) => {
            const cur = t.items.find((x) => x.code === r.code);
            return `
            <button type="button" class="code-btn" data-code="${esc(r.code)}">
              <span class="code">${esc(r.code)}</span>
              <span class="desc">${esc(r.desc)}</span>
              <span class="price">${money(r.price)}</span>
              <span class="count">${cur ? '×' + cur.qty : ''}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="actions">
          <button type="button" class="btn primary" data-close>Done</button>
        </div>
      </div>`, (d) => {
      d.querySelectorAll('[data-code]').forEach((b) => b.addEventListener('click', () => {
        const r = findRate(b.dataset.code);
        let it = t.items.find((x) => x.code === r.code);
        if (it) it.qty += 1;
        else {
          it = { id: uid(), code: r.code, desc: r.desc, price: r.price, qty: 1 };
          t.items.push(it);
        }
        save();
        b.querySelector('.count').textContent = '×' + it.qty;
        b.classList.remove('flash');
        void b.offsetWidth;
        b.classList.add('flash');
      }));
      d.addEventListener('close', () => route(), { once: true });
    });
  }

  // ---------- Invoice ----------
  function renderInvoice(p) {
    const s = state.settings;
    if (!p.invoice) {
      p.invoice = { number: String(s.nextInvoiceNumber), date: today() };
      s.nextInvoiceNumber = (parseInt(s.nextInvoiceNumber, 10) || 1000) + 1;
      save();
    }
    const summary = codeSummary(p);
    const total = projectTotal(p);
    const showDetail = p.invoice.showDetail !== false;
    const from = [s.business, s.yourName].filter(Boolean);

    $app.innerHTML = `
      <div class="no-print">
        <a href="#/project/${p.id}" class="back">&larr; Back to ${esc(p.name)}</a>
        <div class="card form">
          <div class="grid2">
            <label>Invoice #<input id="invNum" value="${esc(p.invoice.number)}"></label>
            <label>Invoice date<input id="invDate" type="date" value="${esc(p.invoice.date)}"></label>
          </div>
          <label class="check"><input type="checkbox" id="invDetail" ${showDetail ? 'checked' : ''}> Include task-by-task breakdown</label>
          <div class="actions wrap">
            <button class="btn primary" id="print">Print / Save as PDF</button>
            <button class="btn" id="csv">Download CSV</button>
            ${p.status !== 'invoiced' && p.status !== 'paid' ? `<button class="btn" id="markInvoiced">Mark as Invoiced</button>` : ''}
          </div>
          <div class="muted small">On a phone: tap Print, then choose “Save as PDF” (Android) or use the Share button (iPhone) to send it to your contractor.</div>
        </div>
      </div>

      <article class="invoice">
        <header class="inv-head">
          <div>
            ${from.length ? `<div class="inv-from-name">${esc(from[0])}</div>` : `<div class="inv-from-name muted">Your name (set in Settings)</div>`}
            ${from[1] ? `<div>${esc(from[1])}</div>` : ''}
            ${s.address ? `<div>${nl2br(s.address)}</div>` : ''}
            ${s.phone ? `<div>${esc(s.phone)}</div>` : ''}
            ${s.email ? `<div>${esc(s.email)}</div>` : ''}
          </div>
          <div class="right">
            <div class="inv-title">INVOICE</div>
            <table class="meta">
              <tr><td>Invoice #</td><td>${esc(p.invoice.number)}</td></tr>
              <tr><td>Date</td><td>${fmtDate(p.invoice.date)}</td></tr>
              ${s.paymentTerms ? `<tr><td>Terms</td><td>${esc(s.paymentTerms)}</td></tr>` : ''}
            </table>
          </div>
        </header>

        <section class="inv-parties">
          <div>
            <div class="label">Bill To</div>
            <div><b>${esc(s.contractorName)}</b></div>
            ${s.contractorAddress ? `<div>${nl2br(s.contractorAddress)}</div>` : ''}
          </div>
          <div>
            <div class="label">Project</div>
            <div><b>${esc(p.name)}</b></div>
            ${p.location ? `<div>${esc(p.location)}</div>` : ''}
            ${p.po ? `<div>Job/PO: ${esc(p.po)}</div>` : ''}
            <div>${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'}</div>
          </div>
        </section>

        <h3>Summary</h3>
        <table class="inv-table">
          <thead><tr><th>Code</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${summary.length ? summary.map((r) => `
              <tr><td>${esc(r.code)}</td><td>${esc(r.desc)}</td><td class="num">${r.qty}</td><td class="num">${money(r.price)}</td><td class="num">${money(r.qty * r.price)}</td></tr>`).join('')
              : `<tr><td colspan="5" class="muted">No billing codes added yet.</td></tr>`}
          </tbody>
          <tfoot><tr><td colspan="4" class="num">Total Due</td><td class="num">${money(total)}</td></tr></tfoot>
        </table>

        ${showDetail && p.tasks.length ? `
        <h3>Detail by Task</h3>
        ${p.tasks.map((t, i) => `
          <div class="inv-task">
            <div class="row-between"><b>${i + 1}. ${esc(t.name)}</b><b>${money(taskTotal(t))}</b></div>
            ${t.notes ? `<div class="muted small">${nl2br(t.notes)}</div>` : ''}
            <table class="inv-table compact">
              <tbody>
                ${t.items.map((it) => `<tr><td>${esc(it.code)}</td><td>${esc(it.desc)}</td><td class="num">${it.qty} × ${money(it.price)}</td><td class="num">${money(itemTotal(it))}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">No codes</td></tr>`}
              </tbody>
            </table>
          </div>`).join('')}` : ''}

        <footer class="inv-foot">Thank you!</footer>
      </article>
    `;

    const num = document.getElementById('invNum');
    const date = document.getElementById('invDate');
    num.addEventListener('change', () => { p.invoice.number = num.value.trim(); save(); route(); });
    date.addEventListener('change', () => { p.invoice.date = date.value || today(); save(); route(); });
    document.getElementById('invDetail').addEventListener('change', (e) => { p.invoice.showDetail = e.target.checked; save(); route(); });
    document.getElementById('print').addEventListener('click', () => {
      const prev = document.title;
      document.title = `Invoice ${p.invoice.number} - ${p.name}`;
      window.print();
      setTimeout(() => { document.title = prev; }, 1000);
    });
    document.getElementById('csv').addEventListener('click', () => downloadCsv(p));
    const mark = document.getElementById('markInvoiced');
    if (mark) mark.addEventListener('click', () => { p.status = 'invoiced'; save(); route(); });
  }

  function downloadCsv(p) {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Invoice #', 'Date', 'Project', 'Task', 'Code', 'Description', 'Qty', 'Rate', 'Amount']];
    for (const t of p.tasks) {
      for (const it of t.items) {
        rows.push([p.invoice.number, fmtDate(p.invoice.date), p.name, t.name, it.code, it.desc, it.qty, it.price.toFixed(2), itemTotal(it).toFixed(2)]);
      }
    }
    rows.push(['', '', '', '', '', 'TOTAL', '', '', projectTotal(p).toFixed(2)]);
    const csv = rows.map((r) => r.map(q).join(',')).join('\r\n');
    download(`Invoice-${p.invoice.number}-${p.name.replace(/[^\w-]+/g, '_')}.csv`, csv, 'text/csv');
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- Settings ----------
  function renderSettings() {
    const s = state.settings;
    $app.innerHTML = `
      <h1>Settings</h1>
      <form class="card form" id="settingsForm">
        <h2>Your info (shown on invoices)</h2>
        <div class="grid2">
          <label>Your name<input name="yourName" value="${esc(s.yourName)}"></label>
          <label>Business name (optional)<input name="business" value="${esc(s.business)}"></label>
          <label>Phone<input name="phone" type="tel" value="${esc(s.phone)}"></label>
          <label>Email<input name="email" type="email" value="${esc(s.email)}"></label>
        </div>
        <label>Address<textarea name="address" rows="2">${esc(s.address)}</textarea></label>
        <h2>Contractor (Bill To)</h2>
        <label>Contractor name<input name="contractorName" value="${esc(s.contractorName)}"></label>
        <label>Contractor address<textarea name="contractorAddress" rows="2">${esc(s.contractorAddress)}</textarea></label>
        <div class="grid2">
          <label>Payment terms<input name="paymentTerms" value="${esc(s.paymentTerms)}"></label>
          <label>Next invoice #<input name="nextInvoiceNumber" inputmode="numeric" value="${esc(s.nextInvoiceNumber)}"></label>
        </div>
        <div class="actions"><button class="btn primary" type="submit">Save</button></div>
      </form>

      <div class="card form">
        <div class="row-between">
          <h2>Billing codes</h2>
          <button class="btn small" id="addRate">+ Add Code</button>
        </div>
        <div class="muted small">Changing a rate here only affects codes added from now on. Codes already on tasks keep the price they were added with.</div>
        <table class="rates">
          <thead><tr><th>Code</th><th>Description</th><th>Rate</th><th></th></tr></thead>
          <tbody>
            ${state.rates.map((r, i) => `
              <tr data-rate="${i}">
                <td><input name="code" value="${esc(r.code)}"></td>
                <td><input name="desc" value="${esc(r.desc)}"></td>
                <td><input name="price" type="number" step="0.01" inputmode="decimal" value="${r.price}"></td>
                <td><button class="btn small danger" data-act="del-rate" aria-label="Delete">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="actions wrap">
          <button class="btn primary" id="saveRates">Save codes</button>
          <button class="btn" id="resetRates">Reset to rate sheet</button>
        </div>
      </div>

      <div class="card form">
        <h2>Backup</h2>
        <div class="muted small">Your data is saved on this device only. Download a backup now and then, and use it to move your data to another phone or computer.</div>
        <div class="actions wrap">
          <button class="btn" id="exportData">Download backup</button>
          <label class="btn">Restore from backup<input type="file" id="importData" accept="application/json,.json" hidden></label>
        </div>
      </div>
    `;

    const f = document.getElementById('settingsForm');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      for (const k of Object.keys(s)) if (f[k]) s[k] = f[k].value.trim();
      s.nextInvoiceNumber = parseInt(s.nextInvoiceNumber, 10) || 1001;
      save();
      flash('Settings saved');
    });

    const readRates = () => [...$app.querySelectorAll('[data-rate]')].map((row) => ({
      code: row.querySelector('[name=code]').value.trim(),
      desc: row.querySelector('[name=desc]').value.trim(),
      price: round2(parseFloat(row.querySelector('[name=price]').value) || 0),
    })).filter((r) => r.code);

    document.getElementById('addRate').addEventListener('click', () => {
      state.rates = readRates();
      state.rates.push({ code: '', desc: '', price: 0 });
      renderSettings();
      const inputs = $app.querySelectorAll('[data-rate] [name=code]');
      inputs[inputs.length - 1].focus();
    });
    $app.querySelectorAll('[data-act="del-rate"]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.closest('[data-rate]').dataset.rate;
      state.rates = readRates().filter((_, j) => j !== i);
      save();
      renderSettings();
    }));
    document.getElementById('saveRates').addEventListener('click', () => {
      const rates = readRates();
      const codes = rates.map((r) => r.code);
      if (new Set(codes).size !== codes.length) return alert('Each code must be unique.');
      state.rates = rates;
      save();
      flash('Billing codes saved');
    });
    document.getElementById('resetRates').addEventListener('click', () => {
      if (!confirm('Replace your billing codes with the original rate sheet?')) return;
      state.rates = window.DEFAULT_RATES.map((r) => ({ ...r }));
      save();
      renderSettings();
    });
    document.getElementById('exportData').addEventListener('click', () => {
      download(`fiber-billing-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
    });
    document.getElementById('importData').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.projects)) throw new Error('Not a Fiber Billing backup file');
        if (!confirm('Replace ALL data on this device with this backup?')) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        state = load();
        flash('Backup restored');
        renderSettings();
      } catch (err) {
        alert('Could not restore backup: ' + err.message);
      }
    });
  }

  function flash(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // ---------- Boot ----------
  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
