'use strict';
/* Apps page — connections monitor (mirrors the Android 连接 monitoring page) */
Pages.apps = {
  search: '',
  filter: 'all',   // all | proxy | direct
  sort: 'rate',    // rate | started | target
  live: true,

  render(container) {
    container.innerHTML = '';
    const page = el('div', { class: 'page wide-page' });
    container.appendChild(page);

    const head = el('div', { style: 'display:flex;align-items:center;gap:12px' });
    head.appendChild(el('div', {}, [
      el('div', { class: 'card-title', text: t('monitor_connections_title') }),
      el('div', { class: 'muted small', style: 'margin-top:2px', text: t('monitor_connections_active') + ': ' + App.connections.length }),
    ]));
    const spacer = el('div', { style: 'flex:1' });
    head.appendChild(spacer);
    const allCount = App.connections.filter((c) => c.outboundType !== 'Direct').length;
    const directCount = App.connections.filter((c) => c.outboundType === 'Direct').length;
    head.appendChild(el('div', { class: 'muted small', text: `代理 ${allCount} · 直连 ${directCount}` }));
    head.appendChild(el('button', {
      class: 'icon-btn msr', title: t('monitor_connections_close_all'),
      text: 'close',
      onclick: () => this.closeAll(),
    }));
    head.appendChild(el('button', {
      class: 'icon-btn msr', title: t('monitor_connections_pause'),
      text: 'pause',
      onclick: () => { this.live = !this.live; this.render(document.getElementById('content')); },
    }));
    page.appendChild(head);

    // filters
    const filters = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' });
    [['all', t('monitor_filter_all')], ['proxy', t('monitor_filter_proxy')], ['direct', t('monitor_filter_direct')]].forEach(([v, label]) => {
      filters.appendChild(el('button', {
        class: `chip ${this.filter === v ? 'selected' : ''}`,
        text: label,
        onclick: () => { this.filter = v; this.render(document.getElementById('content')); },
      }));
    });
    filters.appendChild(el('div', { style: 'flex:1' }));
    const sortSel = el('select', { style: 'background:var(--m3-surface-container-high);border:1px solid var(--m3-outline-variant);border-radius:999px;padding:6px 12px;color:var(--m3-on-surface);font-family:var(--font-sans);font-size:13px' });
    [['rate', t('monitor_sort_rate')], ['started', t('monitor_sort_started')], ['target', t('monitor_sort_target')]].forEach(([v, label]) => {
      const opt = el('option', { value: v, text: label });
      if (v === this.sort) opt.selected = true;
      sortSel.appendChild(opt);
    });
    sortSel.addEventListener('change', () => { this.sort = sortSel.value; this.render(document.getElementById('content')); });
    filters.appendChild(sortSel);
    page.appendChild(filters);

    const search = el('div', { class: 'search', style: 'margin-top:4px' }, [
      icon('search'),
      el('input', {
        type: 'text', placeholder: t('monitor_connections_search'), value: this.search,
        oninput: (e) => { this.search = e.target.value.trim().toLowerCase(); this.renderBody(); },
      }),
    ]);
    page.appendChild(search);

    const listWrap = el('div', { id: 'conn-list' });
    page.appendChild(listWrap);
    this.renderBody(listWrap);
  },

  filtered() {
    let list = App.connections;
    if (this.filter === 'proxy') list = list.filter((c) => c.outboundType !== 'Direct');
    if (this.filter === 'direct') list = list.filter((c) => c.outboundType === 'Direct');
    if (this.search) {
      list = list.filter((c) =>
        (c.metadata && c.metadata.destination || '').toLowerCase().includes(this.search) ||
        (c.rule || '').toLowerCase().includes(this.search) ||
        (c.chains || []).join(' ').toLowerCase().includes(this.search)
      );
    }
    const arr = [...list];
    if (this.sort === 'target') arr.sort((a, b) => ((a.metadata && a.metadata.destination) || '').localeCompare((b.metadata && b.metadata.destination) || ''));
    else if (this.sort === 'started') arr.sort((a, b) => (b.start || 0) - (a.start || 0));
    else arr.sort((a, b) => (b.download || 0) + (b.upload || 0) - ((a.download || 0) + (a.upload || 0)));
    return arr;
  },

  renderBody(listWrap) {
    if (listWrap) listWrap.innerHTML = '';
    const list = this.filtered();
    const card = el('div', { class: 'card', style: 'padding:8px 0' });
    if (!App.connections.length) {
      card.appendChild(el('div', { class: 'empty', text: t('monitor_connections_empty') }));
    } else if (!list.length) {
      card.appendChild(el('div', { class: 'empty', text: t('monitor_connections_no_match') }));
    } else {
      list.forEach((c) => card.appendChild(this.connRow(c)));
    }
    (listWrap || document.getElementById('content').querySelector('#conn-list')).appendChild(card);
  },

  connRow(c) {
    const dest = (c.metadata && (c.metadata.host || c.metadata.destination)) || '';
    const source = (c.metadata && c.metadata.source) || '';
    const chain = (c.chains || []).join(' → ') || '';
    const rule = c.rule || '';
    const direct = c.outboundType === 'Direct';
    return el('div', { class: 'conn-row' }, [
      el('div', { class: 'c-main' }, [
        el('div', { class: 'c-target', text: dest }),
        el('div', { class: 'c-sub', text: `${source}${chain ? ' · ' + chain : ''}` }),
      ]),
      el('div', { class: 'c-rule', text: rule }),
      el('div', { class: 'c-traffic' }, [
        el('div', { text: '↓ ' + fmtBytes(c.download || 0) }),
        el('div', { text: '↑ ' + fmtBytes(c.upload || 0) }),
      ]),
      el('button', {
        class: 'icon-btn msr', style: 'width:32px;height:32px', title: t('monitor_connections_close_one'),
        text: 'close',
        onclick: () => this.closeOne(c.id),
      }),
    ]);
  },

  async closeOne(id) {
    const a = api();
    try {
      await a.call('closeConnection', id);
    } catch (e) { toast(t('monitor_connections_close_failed') || '关闭失败', true); }
  },
  async closeAll() {
    showDialog({
      title: t('monitor_connections_close_all_confirm'),
      message: t('monitor_connections_close_all_message', App.connections.length),
      confirmText: t('monitor_connections_close_all_confirm'),
      danger: true,
      onConfirm: async () => {
        const a = api();
        try { await a.call('closeAllConnections'); } catch (e) { /* */ }
      },
    });
  },
  renderLite() {
    if (!this.live) return;
    const content = document.getElementById('content');
    if (App.page !== 'apps' || !content) return;
    const wrap = content.querySelector('#conn-list');
    if (wrap) this.renderBody(wrap);
    const head = content.querySelector('.card-title');
    const sub = content.querySelector('.muted.small');
    if (sub) sub.textContent = t('monitor_connections_active') + ': ' + App.connections.length;
  },
};
