'use strict';
/* Proxies page — mirror of Android SingBoxProxyPage: groups, delay test, select */
Pages.proxies = {
  cache: null,
  expanded: {},
  layout: 'auto',   // auto | single | double | multiple
  sort: 'default',  // default | name | delay
  search: '',
  testing: {},
  delays: {},

  async load() {
    const a = api();
    try {
      const proxies = await a.call('getProxies');
      this.cache = proxies;
    } catch (e) {
      this.cache = null;
    }
  },

  render(container) {
    container.innerHTML = '';
    const page = el('div', { class: 'page wide-page' });
    container.appendChild(page);
    if (!App.status.running) {
      page.appendChild(el('div', { class: 'card', style: 'text-align:center;padding:40px' }, [
        icon('lan', 'msr', ),
        el('div', { class: 'card-title', style: 'margin-top:12px', text: t('sing_box_proxies_service_stopped_title') }),
        el('div', { class: 'muted', style: 'margin-top:8px', text: t('sing_box_proxies_service_stopped_summary') }),
      ]));
      return;
    }
    this.load().then(() => {
      page.innerHTML = '';
      this.renderBody(page);
    });
  },

  renderBody(page) {
    const search = el('div', { class: 'search' }, [
      icon('search'),
      el('input', {
        type: 'text', placeholder: t('sing_box_proxies_search'), value: this.search,
        oninput: (e) => { this.search = e.target.value.trim().toLowerCase(); this.renderBody(page); },
      }),
    ]);
    page.appendChild(search);
    page.appendChild(el('div', { class: 'list', style: 'margin-top:16px' }));
    const list = page.querySelector('.list');
    const proxies = this.cache || {};
    const groups = Object.values(proxies).filter((p) => p.all && p.name !== 'GLOBAL');
    if (!groups.length) {
      list.appendChild(el('div', { class: 'empty', text: t('sing_box_proxies_loading') }));
      return;
    }
    for (const g of groups) {
      if (this.search && !g.name.toLowerCase().includes(this.search) && !(g.all || []).some((n) => n.toLowerCase().includes(this.search))) continue;
      const members = this.sortedMembers(g);
      const open = this.expanded[g.name] !== false;
      const card = el('div', { class: `group-card ${open ? 'open' : ''}` });
      const delay = this.delays[g.name];
      const head = el('div', { class: 'group-head', onclick: () => { this.expanded[g.name] = !open; card.classList.toggle('open', !open); const body = card.querySelector('.group-body'); if (body) body.style.display = this.expanded[g.name] ? '' : 'none'; } }, [
        el('div', { class: 'g-name', text: g.name }),
        el('span', { class: 'g-type', text: g.type === 'Selector' || g.type === 'selector' ? t('proxies_group_selector') : t('proxies_group_urltest') }),
        el('div', { class: 'g-delay', style: this.delayStyle(delay) }, [this.delayText(g.name, delay, g)]),
        el('button', {
          class: 'icon-btn msr', style: 'width:32px;height:32px', title: t('sing_box_proxies_group_test'),
          text: 'speed',
          onclick: (e) => { e.stopPropagation(); this.testGroup(g); },
        }),
        icon('expand_more', 'g-arrow'),
      ]);
      card.appendChild(head);
      const body = el('div', { class: 'group-body', style: open ? '' : 'display:none' });
      if (g.all && g.all.length) {
        const grid = this.layout === 'single' || (this.layout === 'auto' && members.length <= 8);
        if (grid) {
          const listEl = el('div', { class: 'list', style: 'padding:0 16px 16px' });
          members.forEach((m) => listEl.appendChild(this.nodeRow(g, m)));
          body.appendChild(listEl);
        } else {
          const gridEl = el('div', { class: 'node-grid' });
          members.forEach((m) => gridEl.appendChild(this.nodeTile(g, m)));
          body.appendChild(gridEl);
        }
      }
      card.appendChild(body);
      list.appendChild(card);
    }
  },

  sortedMembers(g) {
    let members = [...(g.all || [])];
    if (this.sort === 'name') {
      members.sort((a, b) => a.localeCompare(b));
    } else if (this.sort === 'delay') {
      members.sort((a, b) => {
        const da = this.delays[a], db = this.delays[b];
        if (da === undefined && db === undefined) return 0;
        if (da === undefined) return 1;
        if (db === undefined) return -1;
        return da - db;
      });
    }
    return members;
  },

  nodeRow(g, name) {
    const selected = g.now === name;
    const delay = this.delays[name];
    return el('div', {
      class: `node-row ${selected ? 'selected' : ''}`,
      onclick: () => this.select(g.name, name),
    }, [
      el('div', { class: 'n-name', text: name }),
      el('div', { class: 'n-delay ' + this.delayClass(name, delay) }, [this.delayText(name, delay, null)]),
    ]);
  },

  nodeTile(g, name) {
    const selected = g.now === name;
    const delay = this.delays[name];
    return el('div', {
      class: `node-tile ${selected ? 'selected' : ''}`,
      onclick: () => this.select(g.name, name),
    }, [
      el('div', { class: 'nt-name', text: name }),
      el('div', { class: 'small ' + this.delayClass(name, delay) }, [this.delayText(name, delay, null)]),
    ]);
  },

  delayClass(name, delay) {
    if (this.testing[name]) return 'delay-pending';
    if (delay === undefined) return 'delay-none';
    if (delay === -1) return 'delay-fail';
    return 'delay-ok';
  },
  delayStyle(delay) {
    if (delay === undefined) return '';
    if (delay === -1) return 'color:var(--m3-error)';
    return '';
  },
  delayText(name, delay, group) {
    if (this.testing[name]) return t('sing_box_proxies_delay_testing');
    if (delay === undefined) {
      return group ? '' : t('sing_box_proxies_delay_not_tested');
    }
    if (delay === -1) return t('sing_box_proxies_delay_status_failed');
    return t('monitor_milliseconds', delay);
  },

  async select(groupName, outbound) {
    const a = api();
    try {
      await a.call('selectOutbound', groupName, outbound);
      if (this.cache && this.cache[groupName]) this.cache[groupName].now = outbound;
      this.render(document.getElementById('content'));
      toast(t('common_copied') === '已复制' ? `→ ${outbound}` : `→ ${outbound}`);
    } catch (e) {
      toast(t('sing_box_proxies_select_failed'), true);
    }
  },

  async testDelay(name) {
    const a = api();
    this.testing[name] = true;
    this.renderLite();
    try {
      const res = await a.call('testDelay', name, 'http://www.gstatic.com/generate_204', 5000);
      this.delays[name] = res.delay || -1;
    } catch (e) {
      this.delays[name] = -1;
    }
    this.testing[name] = false;
    this.renderLite();
  },

  async testGroup(g) {
    for (const m of g.all || []) {
      await this.testDelay(m);
    }
    const a = api();
    try {
      const res = await a.call('testDelay', g.name, 'http://www.gstatic.com/generate_204', 5000);
      this.delays[g.name] = res.delay || -1;
    } catch (e) { this.delays[g.name] = -1; }
    this.renderLite();
  },

  async testAll() {
    const proxies = this.cache || {};
    const groups = Object.values(proxies).filter((p) => p.all && p.name !== 'GLOBAL');
    for (const g of groups) await this.testGroup(g);
    toast(t('sing_box_proxies_delay_done') || '延迟测试完成');
  },

  showOptions() {
    const self = this;
    showSheet(t('sing_box_proxies_options'), (body) => {
      const layout = ['auto', 'single', 'double', 'multiple'].map((v) => ({ v, label: t('sing_box_proxies_option_layout_' + v) }));
      const sort = ['default', 'name', 'delay'].map((v) => ({ v, label: t('sing_box_proxies_option_sort_' + v) }));
      body.appendChild(sheetOptionGroup(t('sing_box_proxies_option_layout'), layout, this.layout, (v) => { self.layout = v; self.render(document.getElementById('content')); }));
      body.appendChild(sheetOptionGroup(t('sing_box_proxies_option_sort'), sort, this.sort, (v) => { self.sort = v; self.render(document.getElementById('content')); }));
    });
  },

  renderLite() {
    // update delay texts in place
    const content = document.getElementById('content');
    if (!content || App.page !== 'proxies') return;
    if (this.renderInFlight) return;
    this.renderInFlight = true;
    requestAnimationFrame(() => {
      this.renderInFlight = false;
      if (App.page === 'proxies' && !App.stack.length) this.render(content);
    });
  },
};

function sheetOptionGroup(title, options, current, onSelect) {
  const wrap = el('div', { style: 'margin-bottom:16px' });
  wrap.appendChild(el('div', { class: 'muted small semibold', style: 'margin-bottom:8px', text: title }));
  const chips = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' });
  options.forEach((o) => {
    chips.appendChild(el('button', {
      class: `chip ${o.v === current ? 'selected' : ''}`,
      text: o.label,
      onclick: () => { onSelect(o.v); },
    }));
  });
  wrap.appendChild(chips);
  return wrap;
}
