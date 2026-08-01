'use strict';
/* Sub-pages: monitors, DNS, routing, endpoints, outbounds, resources, logs, about */

/* ---------------- shared helpers ---------------- */
function fieldRow(label, inputEl, hint) {
  const f = el('div', { class: 'field' });
  f.appendChild(el('label', { text: label }));
  f.appendChild(inputEl);
  if (hint) f.appendChild(el('div', { class: 'hint', text: hint }));
  return f;
}

function textInput(value, placeholder) {
  return el('input', { type: 'text', value: value || '', placeholder: placeholder || '' });
}

function numInput(value, placeholder) {
  return el('input', { type: 'number', value: value ?? '', placeholder: placeholder || '' });
}

function saveButton(text, onClick) {
  return el('button', { class: 'btn btn-primary', text: text || t('common_save'), onclick: onClick });
}

/* ---------------- TUN settings ---------------- */
App.routes.settings_tun = {
  title: () => t('settings_tun'),
  render(container) {
    const s = App.settings;
    const stack = textInput(s.tunStack);
    const mtu = numInput(s.tunMtu);
    const ipv4 = textInput(s.tunIpv4);
    const ipv6 = textInput(s.tunIpv6);
    const vpnDns = textInput(s.vpnDns);
    const localDns = makeSwitch(s.enableLocalDns, () => { /* on save */ });
    const page = el('div', { class: 'page' }, [
      el('div', { class: 'card' }, [
        fieldRow(t('settings_tun_stack'), stack, 'system / gvisor / mixed'),
        fieldRow(t('settings_tun_mtu'), mtu, '1280–65535'),
        fieldRow(t('settings_tun_ipv4_cidr'), ipv4),
        fieldRow(t('settings_tun_ipv6_cidr'), ipv6),
        fieldRow(t('settings_tun_vpn_dns'), vpnDns),
        el('div', { class: 'sec-row', style: 'padding:16px 0' }, [
          el('div', { class: 'row-main' }, [
            el('div', { class: 'row-title', text: t('settings_vpn_local_dns') }),
            el('div', { class: 'row-sub', text: t('settings_vpn_local_dns_summary') }),
          ]),
          localDns,
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;padding-top:8px' }, [
          el('button', { class: 'btn btn-text', text: t('common_cancel'), onclick: popRoute }),
          saveButton(t('common_save'), async () => {
            const a = api();
            await a.call('updateSettings', {
              tunStack: stack.value.trim(), tunMtu: parseInt(mtu.value, 10) || 1500,
              tunIpv4: ipv4.value.trim(), tunIpv6: ipv6.value.trim(), vpnDns: vpnDns.value.trim(),
              enableLocalDns: localDns.querySelector('input').checked,
            });
            toast(t('common_copied') === '已复制' ? '已保存' : 'Saved');
            popRoute();
          }),
        ]),
      ]),
    ]);
    container.appendChild(page);
  },
};

/* ---------------- Local proxy settings ---------------- */
App.routes.settings_local = {
  title: () => t('settings_local_proxy'),
  render(container) {
    const s = App.settings;
    const port = numInput(s.localProxyPort);
    const listenAll = makeSwitch(s.localProxyListenAll, () => {});
    const user = textInput(s.localProxyUsername);
    const pass = textInput(s.localProxyPassword);
    const page = el('div', { class: 'page' }, [
      el('div', { class: 'card' }, [
        fieldRow(t('settings_local_proxy_port'), port, '1–65535'),
        el('div', { class: 'sec-row', style: 'padding:16px 0' }, [
          el('div', { class: 'row-main' }, [
            el('div', { class: 'row-title', text: t('settings_local_proxy_listen_all_interfaces') }),
            el('div', { class: 'row-sub', text: t('settings_local_proxy_listen_all_interfaces_summary') }),
          ]),
          listenAll,
        ]),
        fieldRow(t('settings_local_proxy_username'), user),
        fieldRow(t('settings_local_proxy_password'), pass),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;padding-top:8px' }, [
          el('button', { class: 'btn btn-text', text: t('common_cancel'), onclick: popRoute }),
          saveButton(t('common_save'), async () => {
            const a = api();
            await a.call('updateSettings', {
              localProxyPort: parseInt(port.value, 10) || 2080,
              localProxyListenAll: listenAll.querySelector('input').checked,
              localProxyUsername: user.value.trim(),
              localProxyPassword: pass.value,
            });
            toast(t('common_copied') === '已复制' ? '已保存' : 'Saved');
            popRoute();
          }),
        ]),
      ]),
    ]);
    container.appendChild(page);
  },
};

/* ---------------- Sniffer settings ---------------- */
App.routes.settings_sniffer = {
  title: () => t('settings_sniffer'),
  render(container) {
    const s = App.settings;
    const enabled = makeSwitch(s.snifferEnabled, () => {});
    const timeout = textInput(s.snifferTimeout);
    const protocols = ['http', 'tls', 'quic', 'stun', 'dns', 'bittorrent', 'dtls', 'ssh', 'rdp', 'ntp'];
    const page = el('div', { class: 'page' }, [
      el('div', { class: 'card' }, [
        el('div', { class: 'sec-row', style: 'padding:8px 0 16px' }, [
          el('div', { class: 'row-main' }, [
            el('div', { class: 'row-title', text: t('settings_sniffer_enable') || '启用协议嗅探' }),
          ]),
          enabled,
        ]),
        fieldRow(t('settings_sniffer_timeout'), timeout, '300ms / 1s'),
        el('div', { class: 'muted small semibold', style: 'margin:8px 0', text: t('settings_sniffer_protocols') || '嗅探协议' }),
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px' }, protocols.map((p) => {
          const selected = s.snifferProtocols.includes(p);
          return el('button', {
            class: `chip ${selected ? 'selected' : ''}`,
            text: p.toUpperCase(),
            onclick: function () {
              this.classList.toggle('selected');
            },
          });
        })),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px' }, [
          el('button', { class: 'btn btn-text', text: t('common_cancel'), onclick: popRoute }),
          saveButton(t('common_save'), async () => {
            const chips = container.querySelectorAll('.chip');
            const sel = [...chips].filter((c) => c.classList.contains('selected')).map((c) => c.textContent.toLowerCase());
            const a = api();
            await a.call('updateSettings', {
              snifferEnabled: enabled.querySelector('input').checked,
              snifferTimeout: timeout.value.trim() || '300ms',
              snifferProtocols: sel,
            });
            toast(t('common_copied') === '已复制' ? '已保存' : 'Saved');
            popRoute();
          }),
        ]),
      ]),
    ]);
    container.appendChild(page);
  },
};

/* ---------------- DNS settings ---------------- */
App.routes.dns_settings = {
  title: () => t('dns_settings_title'),
  render(container) {
    const s = App.settings;
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const servers = s.dnsServers || [];
    // basic
    const strategy = textInput(s.dnsStrategy || (s.ipv6Prefer ? 'prefer_ipv6' : s.enableIpv6 ? 'prefer_ipv4' : 'ipv4_only'));
    const timeout = textInput(s.dnsTimeout || '10s');
    const optimistic = makeSwitch(s.dnsOptimistic, () => {});
    page.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'card-title', style: 'margin-bottom:12px', text: t('dns_section_basic') }),
      fieldRow(t('dns_strategy'), strategy, 'prefer_ipv4 / prefer_ipv6 / ipv4_only / ipv6_only'),
      fieldRow(t('dns_timeout'), timeout),
      el('div', { class: 'sec-row', style: 'padding:12px 0' }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title', text: t('dns_optimistic') }),
          el('div', { class: 'row-sub', text: t('dns_optimistic_summary') }),
        ]),
        optimistic,
      ]),
    ]));
    // servers
    const serverCard = el('div', { class: 'card', style: 'margin-top:16px' });
    serverCard.appendChild(el('div', { class: 'card-title', style: 'margin-bottom:12px;display:flex;justify-content:space-between;align-items:center' }, [
      el('span', { text: t('dns_servers') }),
      el('button', { class: 'btn btn-tonal btn-icon', text: 'add', onclick: () => this.editServer(serverCard) }),
    ]));
    if (!servers.length) serverCard.appendChild(el('div', { class: 'empty', text: t('settings_dns_servers_empty') }));
    servers.forEach((sv) => {
      const tag = `__asteriskbox_dns_server_${sv.id}__`;
      const isFinal = s.dnsFinal === tag;
      serverCard.appendChild(el('div', { class: 'conn-row' }, [
        el('div', { class: 'c-main' }, [
          el('div', { class: 'c-target', text: sv.remarks || sv.server }),
          el('div', { class: 'c-sub', text: `${sv.type} · ${sv.server}${sv.serverPort ? ':' + sv.serverPort : ''}${sv.detour ? ' · ' + sv.detour : ''}` }),
        ]),
        isFinal ? el('div', { class: 'c-rule', text: t('dns_final') }) : null,
        el('button', { class: 'icon-btn', text: 'edit', style: 'width:32px;height:32px', onclick: () => this.editServer(serverCard, sv) }),
        el('button', { class: 'icon-btn', text: 'delete', style: 'width:32px;height:32px', onclick: async () => {
          const a = api();
          await a.call('updateSettings', { dnsServers: servers.filter((x) => x.id !== sv.id) });
          App.settings = await a.call('getSettings');
          render();
        } }),
      ]));
    });
    page.appendChild(serverCard);
    page.appendChild(el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px' }, [
      el('button', { class: 'btn btn-text', text: t('common_cancel'), onclick: popRoute }),
      saveButton(t('common_save'), async () => {
        const a = api();
        await a.call('updateSettings', {
          dnsTimeout: timeout.value.trim() || '10s',
          dnsOptimistic: optimistic.querySelector('input').checked,
          dnsStrategy: strategy.value.trim(),
        });
        toast(t('common_copied') === '已复制' ? '已保存' : 'Saved');
        popRoute();
      }),
    ]));
  },
  editServer(serverCard, sv) {
    const s = App.settings;
    const servers = [...(s.dnsServers || [])];
    const isNew = !sv;
    const remarks = textInput(sv ? sv.remarks : '', 'direct / proxy');
    const type = el('select');
    ['udp', 'tcp', 'tls', 'https', 'quic', 'h3'].forEach((v) => {
      const o = el('option', { value: v, text: v });
      if (sv && sv.type === v) o.selected = true;
      if (!sv && v === 'udp') o.selected = true;
      type.appendChild(o);
    });
    const server = textInput(sv ? sv.server : '');
    const port = numInput(sv ? sv.serverPort : '');
    const detour = textInput(sv ? sv.detour : '');
    showSheet(t('dns_edit_server'), (body) => {
      body.appendChild(fieldRow(t('dns_server_remarks'), remarks));
      body.appendChild(fieldRow(t('dns_server_type'), type));
      body.appendChild(fieldRow(t('dns_server_address'), server));
      body.appendChild(fieldRow(t('dns_server_port'), port));
      body.appendChild(fieldRow(t('dns_server_detour'), detour, '__asteriskbox_global__'));
    }, {
      confirmText: t('common_save'),
      onConfirm: async () => {
        if (!server.value.trim()) { toast(t('settings_dns_server_address_invalid'), true); return; }
        const a = api();
        if (isNew) {
          const newId = Math.max(0, ...servers.map((x) => x.id)) + 1;
          servers.push({ id: newId, remarks: remarks.value.trim() || `server-${newId}`, type: type.value, server: server.value.trim(), serverPort: port.value, detour: detour.value.trim() });
        } else {
          const idx = servers.findIndex((x) => x.id === sv.id);
          servers[idx] = { ...sv, remarks: remarks.value.trim(), type: type.value, server: server.value.trim(), serverPort: port.value, detour: detour.value.trim() };
        }
        await a.call('updateSettings', { dnsServers: servers });
        App.settings = await a.call('getSettings');
        render();
      },
    });
  },
};

/* ---------------- Routing settings ---------------- */
App.routes.routing_settings = {
  title: () => t('routing_title'),
  render(container) {
    const s = App.settings;
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    page.appendChild(el('div', { class: 'card' }, [
      this.switchRow('public', t('routing_direct_cn'), s.routeDirectCn, async (v) => { await this.save({ routeDirectCn: v }); }),
      this.switchRow('google', t('routing_google_proxy'), s.routeGoogleProxy, async (v) => { await this.save({ routeGoogleProxy: v }); }),
      this.switchRow('block', t('routing_block_udp443'), s.routeBlockUdp443, async (v) => { await this.save({ routeBlockUdp443: v }); }),
      this.switchRow('block', t('routing_block_ads_dns') || '广告域名拦截 (DNS)', s.routeBlockAdsDns, async (v) => { await this.save({ routeBlockAdsDns: v }); }),
      el('div', { class: 'divider' }),
      el('div', { class: 'sec-row', onclick: () => pushRoute('routing_rules') }, [
        el('div', { class: 'row-icon' }, [icon('rule')]),
        el('div', { class: 'row-main' }, [el('div', { class: 'row-title', text: t('routing_view_rules') })]),
        el('span', { class: 'msr chevron', text: 'chevron_right' }),
      ]),
    ]));
  },
  switchRow(iconName, title, checked, onChange) {
    const row = el('div', { class: 'sec-row' });
    row.appendChild(el('div', { class: 'row-icon' }, [icon(iconName)]));
    row.appendChild(el('div', { class: 'row-main' }, [el('div', { class: 'row-title', text: title })]));
    row.appendChild(makeSwitch(checked, onChange));
    return row;
  },
  async save(patch) {
    const a = api();
    await a.call('updateSettings', patch);
    App.settings = await a.call('getSettings');
    render();
  },
};

/* ---------------- Routing rules viewer ---------------- */
App.routes.routing_rules = {
  title: () => t('routing_view_rules'),
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const loading = el('div', { class: 'empty', text: t('monitor_loading') });
    page.appendChild(loading);
    api().call('getRules').then((data) => {
      page.innerHTML = '';
      if (!data || !data.rules || !data.rules.length) {
        page.appendChild(el('div', { class: 'empty', text: t('monitor_data_unavailable') }));
        return;
      }
      const card = el('div', { class: 'card', style: 'padding:8px 0' });
      data.rules.forEach((r) => {
        card.appendChild(el('div', { class: 'conn-row' }, [
          el('div', { class: 'c-rule', style: 'background:var(--m3-primary-container);color:var(--m3-on-primary-container)', text: r.type }),
          el('div', { class: 'c-main' }, [el('div', { class: 'c-sub', text: r.payload || '' })]),
        ]));
      });
      page.appendChild(card);
    });
  },
};

/* ---------------- Endpoints / subscriptions ---------------- */
App.routes.endpoints = {
  title: () => t('endpoints_title'),
  actions(bar) {
    bar.appendChild(el('button', { class: 'icon-btn', text: 'add', onclick: () => this.add() }));
    bar.appendChild(el('button', {
      class: 'icon-btn', text: 'content_paste',
      title: t('endpoints_import_text'),
      onclick: () => this.importClipboard(),
    }));
    if (App.profile.subscriptions.length > 1) {
      bar.appendChild(el('button', { class: 'icon-btn', text: 'refresh', title: t('endpoints_update_all'), onclick: () => this.updateAll() }));
    }
  },
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const subs = App.profile.subscriptions || [];
    if (!subs.length) {
      page.appendChild(el('div', { class: 'empty' }, [icon('subscriptions'), el('div', { text: t('endpoints_empty') })]));
      return;
    }
    const card = el('div', { class: 'card', style: 'padding:8px 0' });
    subs.forEach((sub) => {
      const count = (App.profile.outbounds || []).filter((o) => o.subscriptionId === sub.id).length;
      const updated = sub.lastUpdatedAt ? t('endpoints_last_updated', fmtDate(sub.lastUpdatedAt)) : t('endpoints_never');
      const row = el('div', { class: 'sec-row' });
      row.appendChild(el('div', { class: 'row-icon' }, [icon('cloud_done')]));
      row.appendChild(el('div', { class: 'row-main' }, [
        el('div', { class: 'row-title', text: sub.name || sub.url }),
        el('div', { class: 'row-sub', text: `${count} 节点 · ${updated}` }),
      ]));
      row.appendChild(el('button', {
        class: 'icon-btn', text: 'refresh', style: 'width:32px;height:32px', title: t('common_update'),
        onclick: async (e) => { e.stopPropagation(); await this.updateOne(sub); },
      }));
      row.appendChild(el('button', {
        class: 'icon-btn', text: 'delete', style: 'width:32px;height:32px', title: t('endpoints_delete'),
        onclick: (e) => {
          e.stopPropagation();
          showDialog({
            title: t('endpoints_delete'), message: sub.name || sub.url, danger: true,
            confirmText: t('common_delete'),
            onConfirm: async () => {
              await api().call('removeSubscription', sub.id);
              App.profile = await api().call('getProfile');
              render();
            },
          });
        },
      }));
      card.appendChild(row);
    });
    page.appendChild(card);
  },
  add() {
    const url = textInput('', 'https://example.com/subscribe?token=...');
    const name = textInput('', t('endpoints_name'));
    showSheet(t('endpoints_add'), (body) => {
      body.appendChild(fieldRow(t('endpoints_url'), url));
      body.appendChild(fieldRow(t('endpoints_name'), name));
    }, {
      confirmText: t('common_add'),
      onConfirm: async () => {
        if (!url.value.trim()) { toast(t('endpoints_fetch_failed'), true); return; }
        try {
          App.profile = await api().call('addSubscription', url.value.trim(), name.value.trim() || null, true);
          toast(t('common_copied') === '已复制' ? '订阅导入成功' : 'Subscription imported');
          render();
        } catch (e) {
          toast(t('endpoints_fetch_failed') + ': ' + (e.message || e), true);
        }
      },
    });
  },
  async updateOne(sub) {
    toast(t('settings_resource_files_updating'));
    try {
      App.profile = await api().call('updateSubscription', sub.id);
      toast(t('settings_resource_files_updated'));
      render();
    } catch (e) {
      toast(t('endpoints_fetch_failed'), true);
    }
  },
  async updateAll() {
    toast(t('settings_resource_files_updating'));
    try {
      for (const sub of App.profile.subscriptions) {
        App.profile = await api().call('updateSubscription', sub.id);
      }
      toast(t('settings_resource_files_updated'));
      render();
    } catch (e) { toast(t('endpoints_fetch_failed'), true); }
  },
  importClipboard() {
    const text = el('textarea', { placeholder: t('endpoints_import_text_hint'), style: 'min-height:160px' });
    const replace = makeSwitch(true, () => {});
    showSheet(t('endpoints_import_text'), (body) => {
      body.appendChild(fieldRow(t('endpoints_import_text_hint'), text));
      body.appendChild(el('div', { class: 'sec-row', style: 'padding:12px 0' }, [
        el('div', { class: 'row-main' }, [el('div', { class: 'row-title', text: t('endpoints_replace') })]),
        replace,
      ]));
    }, {
      confirmText: t('endpoints_import'),
      onConfirm: async () => {
        if (!text.value.trim()) { toast(t('common_clipboard_empty'), true); return; }
        try {
          App.profile = await api().call('importText', text.value, replace.querySelector('input').checked);
          toast(t('common_copied') === '已复制' ? '导入成功' : 'Imported');
          render();
        } catch (e) {
          toast(t('endpoints_fetch_failed') + ': ' + (e.message || e), true);
        }
      },
    });
  },
};

/* ---------------- Outbounds ---------------- */
App.routes.outbounds = {
  title: () => t('outbounds_title'),
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const list = App.profile.outbounds || [];
    if (!list.length) {
      page.appendChild(el('div', { class: 'empty' }, [icon('outbox'), el('div', { text: t('outbounds_empty') })]));
      return;
    }
    const card = el('div', { class: 'card', style: 'padding:8px 0' });
    list.forEach((o) => {
      const server = (o.json && (o.json.server || '')) || '';
      const row = el('div', { class: 'sec-row' });
      row.appendChild(el('div', { class: 'row-icon' }, [icon(typeIcon(o.type))]));
      row.appendChild(el('div', { class: 'row-main' }, [
        el('div', { class: 'row-title', text: o.tag }),
        el('div', { class: 'row-sub', text: `${o.type}${server ? ' · ' + server : ''}` }),
      ]));
      row.appendChild(el('button', {
        class: 'icon-btn', text: 'edit_note', style: 'width:32px;height:32px', title: t('outbounds_edit_json'),
        onclick: (e) => { e.stopPropagation(); this.editJson(o); },
      }));
      row.appendChild(el('button', {
        class: 'icon-btn', text: 'delete', style: 'width:32px;height:32px', title: t('outbounds_delete'),
        onclick: (e) => {
          e.stopPropagation();
          showDialog({
            title: t('outbounds_delete'), message: o.tag, danger: true,
            confirmText: t('common_delete'),
            onConfirm: async () => {
              App.profile = await api().call('deleteOutbound', o.tag);
              render();
            },
          });
        },
      }));
      card.appendChild(row);
    });
    page.appendChild(card);
  },
  editJson(o) {
    const json = el('textarea', { style: 'min-height:300px;font-family:Consolas,monospace;font-size:12px' });
    try { json.value = JSON.stringify(o.json, null, 2); } catch (e) { json.value = String(o.json); }
    showSheet(t('outbounds_edit_json') + ' — ' + o.tag, (body) => {
      body.appendChild(fieldRow('JSON', json, 'sing-box outbound 配置'));
    }, {
      confirmText: t('common_save'),
      onConfirm: async () => {
        try {
          const parsed = JSON.parse(json.value);
          App.profile = await api().call('updateOutbound', o.tag, parsed);
          toast(t('common_copied') === '已复制' ? '已保存' : 'Saved');
          render();
        } catch (e) {
          toast('JSON 格式错误: ' + e.message, true);
        }
      },
    });
  },
};

function typeIcon(type) {
  const map = {
    vmess: 'vpn_key', vless: 'key', trojan: 'security', shadowsocks: 'bolt',
    hysteria2: 'waves', tuic: 'air', socks: 'socks', http: 'language',
    wireguard: 'shield', selector: 'alt_route', urltest: 'speed', direct: 'arrow_forward', block: 'block',
  };
  return map[type] || 'hub';
}

/* ---------------- Resources ---------------- */
App.routes.resources = {
  title: () => t('resources_title'),
  actions(bar) {
    bar.appendChild(el('button', { class: 'icon-btn', text: 'refresh', title: t('resources_update_all'), onclick: () => this.update() }));
  },
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const loading = el('div', { class: 'empty', text: t('monitor_loading') });
    page.appendChild(loading);
    api().call('getResourceStatus').then((data) => {
      page.innerHTML = '';
      if (!data) { page.appendChild(el('div', { class: 'empty', text: t('monitor_data_unavailable') })); return; }
      // core
      const coreCard = el('div', { class: 'card' });
      coreCard.appendChild(el('div', { class: 'card-title', style: 'margin-bottom:12px', text: t('resources_core') }));
      coreCard.appendChild(el('div', { class: 'res-tile' }, [
        el('div', { class: 'rt-icon', style: 'font-size:28px' }, [icon('memory')]),
        el('div', {}, [
          el('div', { class: 'rt-name', text: data.core.name + ' (' + t('resources_singbox_version') + ') ' + data.core.version }),
          el('div', { class: 'rt-sub', text: data.core.file + ' · ' + t('resources_file_size', fmtBytes(data.core.size)) }),
        ]),
        el('div', { class: 'rt-status rt-ready', text: t('settings_resource_files_ready') }),
      ]));
      page.appendChild(coreCard);
      // rule sets
      const rsCard = el('div', { class: 'card', style: 'margin-top:16px' });
      rsCard.appendChild(el('div', { class: 'card-title', style: 'margin-bottom:12px', text: t('resources_rule_sets') }));
      data.files.forEach((f) => {
        rsCard.appendChild(el('div', { class: 'res-tile', style: 'margin-bottom:8px' }, [
          el('div', {}, [
            el('div', { class: 'rt-name', text: f.name }),
            el('div', { class: 'rt-sub', text: `${f.source || ''}${f.size ? ' · ' + t('resources_file_size', fmtBytes(f.size)) : ''}${f.updatedAt ? ' · ' + t('resources_last_check', fmtDate(f.updatedAt)) : ''}` }),
          ]),
          el('div', { class: `rt-status ${f.ready ? 'rt-ready' : 'rt-missing'}`, text: f.ready ? t('settings_resource_files_ready') : t('settings_resource_files_missing') }),
        ]));
      });
      page.appendChild(rsCard);
    });
  },
  async update() {
    toast(t('settings_resource_files_updating'));
    try {
      await api().call('updateResources');
      toast(t('settings_resource_files_updated'));
      render();
    } catch (e) {
      toast(t('settings_resource_files_action_failed'), true);
    }
  },
};

/* ---------------- Core logs ---------------- */
App.routes.core_logs = {
  title: () => t('core_logs_title'),
  paused: false,
  lines: [],
  actions(bar) {
    bar.appendChild(el('button', { class: 'icon-btn', text: 'pause', onclick: () => { this.paused = !this.paused; render(); } }));
    bar.appendChild(el('button', { class: 'icon-btn', text: 'download', title: t('logs_export'), onclick: async () => { await api().call('exportLogs'); toast(t('logs_exported')); } }));
  },
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const view = el('div', { class: 'log-view' });
    const status = el('div', { class: 'muted small', style: 'margin-bottom:8px', text: (this.paused ? t('logs_paused') : t('logs_live')) + (App.status.running ? ' · sing-box' : '') });
    page.appendChild(status);
    page.appendChild(view);
    this.view = view;
    this.renderLines();
  },
  renderLines() {
    if (!this.view) return;
    const lines = App.logLines || [];
    this.view.innerHTML = lines.slice(-500).map((l) => {
      const cls = 'log-line-' + (['debug', 'info', 'warning', 'error'].includes(l.type) ? l.type : 'info');
      return `<div class="${cls}">[${fmtTime(l.ts || Date.now())}] ${esc(l.payload)}</div>`;
    }).join('');
    this.view.scrollTop = this.view.scrollHeight;
  },
  onLine(line) {
    if (this.paused) return;
    this.renderLines();
  },
};

/* ---------------- About ---------------- */
App.routes.about = {
  title: () => t('about_title'),
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const info = App.appInfo || {};
    const card = el('div', { class: 'card', style: 'text-align:center;padding:32px' }, [
      el('img', { src: '../build/icon.png', style: 'width:88px;height:88px;border-radius:20px' }),
      el('div', { style: 'font-size:22px;font-weight:600;margin-top:12px', text: 'AsteriskBOX' }),
      el('div', { class: 'muted small', style: 'margin-top:4px', text: `v${info.appVersion || '1.0.0'} (Windows)` }),
      el('div', { class: 'muted small', style: 'margin-top:2px', text: 'sing-box ' + (info.singBoxVersion || '1.14.0-beta.3') }),
    ]);
    page.appendChild(card);
    const sec = el('div', { class: 'sec-card', style: 'margin-top:16px' });
    const dataDir = el('div', { class: 'sec-row', onclick: async () => { await api().call('openDataFolder'); } });
    dataDir.appendChild(el('div', { class: 'row-icon' }, [icon('folder_open')]));
    dataDir.appendChild(el('div', { class: 'row-main' }, [
      el('div', { class: 'row-title', text: 'Data' }),
      el('div', { class: 'row-sub', text: info.dataDir || '' }),
    ]));
    sec.appendChild(dataDir);
    const github = el('div', { class: 'sec-row', onclick: () => { const a = api(); a.call && a.call('openExternal', 'https://github.com/Asterisk4Magisk/AsteriskBOX'); } });
    github.appendChild(el('div', { class: 'row-icon' }, [icon('code')]));
    github.appendChild(el('div', { class: 'row-main' }, [el('div', { class: 'row-title', text: t('about_view_source') })]));
    sec.appendChild(github);
    const tg = el('div', { class: 'sec-row', onclick: () => { const a = api(); a.call && a.call('openExternal', 'https://t.me/Asterisk4Magisk'); } });
    tg.appendChild(el('div', { class: 'row-icon' }, [icon('send')]));
    tg.appendChild(el('div', { class: 'row-main' }, [el('div', { class: 'row-title', text: t('about_join_telegram') })]));
    sec.appendChild(tg);
    page.appendChild(sec);
    page.appendChild(el('div', { class: 'muted small', style: 'text-align:center;margin-top:16px', text: 'GPL-3.0 · 移植自 AsteriskBOX (Android) · sing-box 核心引擎' }));
  },
};

/* ---------------- Licenses ---------------- */
App.routes.licenses = {
  title: () => t('license_title'),
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const licenses = [
      ['sing-box', 'https://github.com/SagerNet/sing-box', 'GPL-3.0'],
      ['hev-socks5-tunnel', 'https://github.com/heiher/hev-socks5-tunnel', 'Apache-2.0'],
      ['AndroidLibBoxLite', 'https://github.com/Asterisk4Magisk/AndroidLibBoxLite', 'GPL-3.0'],
      ['libsu', 'https://github.com/topjohnwu/libsu', 'Apache-2.0'],
      ['material3', 'https://developer.android.com/develop/ui/compose/designsystems/material3', 'Apache-2.0'],
      ['china-ip-list', 'https://github.com/mayaxcn/china-ip-list', 'MIT'],
      ['sing-geoip', 'https://github.com/SagerNet/sing-geoip', 'CC-BY-SA-4.0'],
      ['sing-geosite', 'https://github.com/SagerNet/sing-geosite', 'CC-BY-SA-4.0'],
      ['wintun', 'https://www.wintun.net/', 'Custom'],
    ];
    const card = el('div', { class: 'card', style: 'padding:8px 0' });
    licenses.forEach(([name, url, lic]) => {
      card.appendChild(el('div', { class: 'sec-row' }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title', text: name }),
          el('div', { class: 'row-sub', text: `${url} · ${lic}` }),
        ]),
      ]));
    });
    page.appendChild(card);
  },
};

/* ---------------- Monitor: resource ---------------- */
App.routes.monitor_resource = {
  title: () => t('monitor_resource_title'),
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    if (!App.status.running) {
      page.appendChild(el('div', { class: 'empty', text: t('monitor_service_not_enabled') }));
      return;
    }
    const focus = el('div', { class: 'card', style: 'display:flex;align-items:center;gap:16px' }, [
      el('div', { class: 'hero-icon', style: 'background:var(--m3-primary-container);color:var(--m3-on-primary-container)', text: '' }, [icon('memory')]),
      el('div', { style: 'flex:1' }, [
        el('div', { class: 'card-title', text: t('monitor_resource_focus_memory', fmtBytes(App.processStats.memoryBytes)) }),
        el('div', { class: 'muted small', style: 'margin-top:4px', text: `${t('monitor_resource_cpu')} ${App.processStats.cpuPercent !== null ? App.processStats.cpuPercent.toFixed(1) + '%' : '—'}` }),
      ]),
      el('div', { class: 'muted small', text: 'PID ' + (App.status.pid || '—') }),
    ]);
    page.appendChild(focus);
    const chartCard = el('div', { class: 'card', style: 'margin-top:16px;height:240px' });
    chartCard.appendChild(el('div', { class: 'card-title', text: t('monitor_resource_trend') }));
    const canvas = el('canvas', { class: 'chart', style: 'height:190px;margin-top:12px' });
    chartCard.appendChild(canvas);
    page.appendChild(chartCard);
    this.canvas = canvas;
    this.history = { cpu: [], mem: [] };
    this.startSampling();
  },
  startSampling() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      this.history.cpu.push(App.processStats.cpuPercent ?? 0);
      this.history.mem.push(App.processStats.memoryBytes ?? 0);
      if (this.history.cpu.length > 90) { this.history.cpu.shift(); this.history.mem.shift(); }
      if (this.canvas && App.stack.length && App.stack[App.stack.length - 1].id === 'monitor_resource') {
        drawLineChart(this.canvas, [
          { color: cssColor('--m3-tertiary'), values: this.history.mem },
          { color: cssColor('--m3-primary'), values: this.history.cpu },
        ], { maxValue: Math.max(1, ...this.history.mem, 1) });
      }
    }, 1000);
  },
};

/* ---------------- Monitor: connections ---------------- */
App.routes.monitor_connections = {
  title: () => t('monitor_connections_title'),
  render(container) {
    const page = el('div', { class: 'page wide-page' });
    container.appendChild(page);
    const card = el('div', { class: 'card', style: 'padding:8px 0' });
    const list = App.connections;
    if (!list.length) card.appendChild(el('div', { class: 'empty', text: t('monitor_connections_empty') }));
    else list.slice(0, 200).forEach((c) => {
      const dest = (c.metadata && (c.metadata.host || c.metadata.destination)) || '';
      const rule = c.rule || '';
      card.appendChild(el('div', { class: 'conn-row' }, [
        el('div', { class: 'c-main' }, [
          el('div', { class: 'c-target', text: dest }),
          el('div', { class: 'c-sub', text: (c.metadata && c.metadata.source) || '' }),
        ]),
        el('div', { class: 'c-rule', text: rule }),
        el('div', { class: 'c-traffic', text: '↓ ' + fmtBytes(c.download || 0) }),
        el('div', { class: 'c-traffic', text: '↑ ' + fmtBytes(c.upload || 0) }),
      ]));
    });
    page.appendChild(card);
    this.body = card;
  },
  onData() {
    if (!this.body || !App.stack.length || App.stack[App.stack.length - 1].id !== 'monitor_connections') return;
    // refresh list
    const list = App.connections;
    this.body.innerHTML = '';
    if (!list.length) this.body.appendChild(el('div', { class: 'empty', text: t('monitor_connections_empty') }));
    else list.slice(0, 200).forEach((c) => {
      const dest = (c.metadata && (c.metadata.host || c.metadata.destination)) || '';
      this.body.appendChild(el('div', { class: 'conn-row' }, [
        el('div', { class: 'c-main' }, [el('div', { class: 'c-target', text: dest })]),
        el('div', { class: 'c-rule', text: c.rule || '' }),
        el('div', { class: 'c-traffic', text: '↓ ' + fmtBytes(c.download || 0) }),
        el('div', { class: 'c-traffic', text: '↑ ' + fmtBytes(c.upload || 0) }),
      ]));
    });
  },
};

/* ---------------- Monitor: traffic ---------------- */
App.routes.monitor_traffic = {
  title: () => t('monitor_traffic_title'),
  history: [],
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const s = App.traffic;
    const today = App.daily.today || { up: 0, down: 0 };
    const row = el('div', { class: 'row-2' }, [
      this.statCard(t('monitor_traffic_today') + ' ↑', fmtBytes(today.up)),
      this.statCard(t('monitor_traffic_today') + ' ↓', fmtBytes(today.down)),
    ]);
    page.appendChild(row);
    page.appendChild(this.statCard(t('monitor_traffic_session_total'), fmtBytes(s.totalUp) + ' ↑ / ' + fmtBytes(s.totalDown) + ' ↓', t('monitor_traffic_runtime') + ' ' + fmtDuration(App.status.startedAt ? Date.now() - App.status.startedAt : 0)));
    const trend = el('div', { class: 'card', style: 'margin-top:16px;height:220px' });
    trend.appendChild(el('div', { class: 'card-title', text: t('monitor_traffic_trend') }));
    const canvas = el('canvas', { class: 'chart', style: 'height:170px;margin-top:12px' });
    trend.appendChild(canvas);
    page.appendChild(trend);
    this.canvas = canvas;
    this.history = [...App.traffic.samples];
    this.redraw();
    // 7/30 days bars
    const days = el('div', { class: 'card', style: 'margin-top:16px;height:200px' });
    days.appendChild(el('div', { class: 'card-title', text: t('monitor_traffic_7_days') }));
    const dcanvas = el('canvas', { class: 'chart', style: 'height:150px;margin-top:12px' });
    days.appendChild(dcanvas);
    page.appendChild(days);
    if (App.daily.last7 && App.daily.last7.length) {
      drawBarChart(dcanvas, App.daily.last7.map((d) => ({ up: d.up, down: d.down, label: d.day })));
    }
    page.appendChild(el('div', { class: 'muted small', style: 'margin-top:12px', text: t('monitor_traffic_local_notice') }));
  },
  statCard(title, value, sub) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'muted small semibold', text: title }),
      el('div', { style: 'font-size:24px;font-weight:600;margin-top:8px', text: value }),
      sub ? el('div', { class: 'muted small', style: 'margin-top:4px', text: sub }) : null,
    ]);
  },
  redraw() {
    if (this.canvas && App.stack.length && App.stack[App.stack.length - 1].id === 'monitor_traffic') {
      const max = Math.max(1, ...this.history.map((h) => h.down), ...this.history.map((h) => h.up));
      drawLineChart(this.canvas, [
        { color: cssColor('--m3-tertiary'), values: this.history.map((h) => h.up) },
        { color: cssColor('--m3-primary'), values: this.history.map((h) => h.down) },
      ], { maxValue: max });
    }
  },
  onData(d) {
    if (!this.canvas) return;
    this.history.push({ up: d.up, down: d.down });
    if (this.history.length > 300) this.history.shift();
    this.redraw();
  },
};

/* ---------------- Monitor: network ---------------- */
App.routes.monitor_network = {
  title: () => t('monitor_network_title'),
  render(container) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const rows = [
      [t('monitor_network_local_ipv4'), (App.network.ipv4 || []).join(', ') || '—'],
      [t('monitor_network_local_ipv6'), (App.network.ipv6 || []).join(', ') || '—'],
      [t('monitor_network_gateway'), App.network.gateway || '—'],
      [t('monitor_network_dns'), (App.network.dns || []).join(', ') || '—'],
    ];
    const card = el('div', { class: 'card', style: 'padding:8px 0' });
    rows.forEach(([label, value]) => {
      card.appendChild(el('div', { class: 'sec-row' }, [
        el('div', { class: 'row-icon' }, [icon('network_check')]),
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title', text: label }),
          el('div', { class: 'row-sub', text: value }),
        ]),
      ]));
    });
    page.appendChild(card);
    page.appendChild(el('button', {
      class: 'btn btn-tonal', style: 'align-self:flex-start', text: t('monitor_refresh'),
      onclick: async () => {
        const a = api();
        App.network = await a.call('getNetworkInfo');
        render();
      },
    }));
  },
};
