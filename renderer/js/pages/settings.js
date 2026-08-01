'use strict';
/* Settings page — mirrors Android SettingsPage sections */
Pages.settings = {
  render(container) {
    container.innerHTML = '';
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const s = App.settings;

    // ---- 外观 ----
    page.appendChild(this.section(t('settings_theme'), [
      this.row('palette', t('settings_color_mode'), this.colorModeLabel(s.colorMode), () => this.pickColorMode()),
      this.row('format_color_fill', t('settings_theme_color'), t('theme_color_' + ['default', 'blue', 'green', 'violet', 'yellow', 'orange', 'rose', 'cyan'][s.seedIndex]), () => this.pickSeed()),
    ]));

    // ---- 常规 ----
    page.appendChild(this.section(t('settings_general'), [
      this.row('language', t('settings_language'), t('option_simplified_chinese'), () => this.pickLanguage()),
      this.switchRow('power_settings_new', t('settings_auto_start'), s.autoStart, (v) => this.save({ autoStart: v })),
      this.switchRow('play_circle', t('settings_auto_connect'), s.autoConnect, (v) => this.save({ autoConnect: v })),
      this.switchRow('minimize', t('settings_minimize_to_tray'), s.minimizeToTray, (v) => this.save({ minimizeToTray: v })),
    ]));

    // ---- 核心 ----
    page.appendChild(this.section(t('settings_core'), [
      this.row('router', t('settings_run_mode'), s.runMode === 'tun' ? t('run_mode_tun') : t('run_mode_proxy'), () => this.pickRunMode()),
      this.row('network_check', t('settings_tun'), `MTU ${s.tunMtu} · ${s.tunStack} · ${s.tunIpv4}`, () => pushRoute('settings_tun')),
      this.row('lan', t('settings_local_proxy'), `127.0.0.1:${s.localProxyPort}`, () => pushRoute('settings_local')),
      this.row('speed', t('settings_log_level'), t('logs_level_' + s.coreLogLevel) || s.coreLogLevel, () => this.pickLogLevel()),
      this.row('radar', t('settings_sniffer'), s.snifferEnabled ? `${s.snifferProtocols.length} · ${s.snifferTimeout}` : t('settings_sniffer_summary_disabled'), () => pushRoute('settings_sniffer')),
    ]));

    // ---- 网络 ----
    page.appendChild(this.section(t('settings_network'), [
      this.switchRow('public', t('settings_ipv6_summary'), s.enableIpv6, (v) => this.save({ enableIpv6: v })),
      this.switchRow('sort', t('settings_ipv6_prefer'), s.ipv6Prefer, (v) => this.save({ ipv6Prefer: v }), !s.enableIpv6),
    ]));

    // ---- 高级 ----
    page.appendChild(this.section(t('settings_advanced'), [
      this.row('dns', t('settings_dns'), t('settings_dns_summary'), () => pushRoute('dns_settings')),
      this.row('alt_route', t('routing_title'), t('settings_dns_summary') === 'Edit core DNS servers and behavior' ? '规则设置' : '规则设置', () => pushRoute('routing_settings')),
      this.row('subscriptions', t('endpoints_title'), `${App.profile.subscriptions.length} 个订阅`, () => pushRoute('endpoints')),
      this.row('outbox', t('outbounds_title'), `${App.profile.outbounds.length} 个节点`, () => pushRoute('outbounds')),
      this.row('folder_zip', t('settings_resource_management'), t('settings_resource_management_summary'), () => pushRoute('resources')),
      this.row('receipt_long', t('settings_logs'), t('settings_core_logs'), () => pushRoute('core_logs')),
      this.row('info', t('settings_about'), t('settings_about_project'), () => pushRoute('about')),
      this.row('description', t('settings_open_source_licenses'), '', () => pushRoute('licenses')),
    ]));
  },

  section(label, rows) {
    return el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
      el('div', { class: 'sec-label', text: label }),
      el('div', { class: 'sec-card' }, rows.map((r) => {
        return r;
      })),
    ]);
  },

  row(iconName, title, value, onClick, sub) {
    return el('div', { class: 'sec-row', onclick: onClick }, [
      el('div', { class: 'row-icon' }, [icon(iconName)]),
      el('div', { class: 'row-main' }, [
        el('div', { class: 'row-title', text: title }),
        sub ? el('div', { class: 'row-sub', text: sub }) : null,
      ]),
      value !== undefined && value !== null && value !== '' ? el('div', { class: 'row-value', text: value }) : null,
      el('span', { class: 'msr chevron', text: 'chevron_right' }),
    ]);
  },

  switchRow(iconName, title, checked, onChange, disabled) {
    const row = el('div', { class: 'sec-row', style: disabled ? 'opacity:0.5' : '' });
    row.appendChild(el('div', { class: 'row-icon' }, [icon(iconName)]));
    row.appendChild(el('div', { class: 'row-main' }, [el('div', { class: 'row-title', text: title })]));
    row.appendChild(makeSwitch(checked, onChange, disabled));
    return row;
  },

  colorModeLabel(v) {
    return v === 1 ? t('option_light') : v === 2 ? t('option_dark') : t('option_follow_system');
  },

  async save(patch) {
    const a = api();
    try {
      const next = await a.call('updateSettings', patch);
      App.settings = next;
    } catch (e) { /* */ }
    // re-apply theme/lang
    App.t = makeT(resolveLang());
    window.t = App.t;
    render();
  },

  pickColorMode() {
    const self = this;
    showSheet(t('settings_color_mode'), (body) => {
      [[0, t('option_follow_system')], [1, t('option_light')], [2, t('option_dark')]].forEach(([v, label]) => {
        body.appendChild(choiceRow(label, App.settings.colorMode === v, () => { self.save({ colorMode: v }); closeSheet(); }));
      });
    }, { confirmText: null });
  },

  pickSeed() {
    const self = this;
    const colors = ['6750A4', '3482FF', '36D167', '7C4DFF', 'FFB21D', 'FF5722', 'E91E63', '00BCD4'];
    showSheet(t('settings_theme_color'), (body) => {
      const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:8px 0' });
      colors.forEach((c, i) => {
        const name = t('theme_color_' + ['default', 'blue', 'green', 'violet', 'yellow', 'orange', 'rose', 'cyan'][i]);
        const tile = el('div', {
          style: 'display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;padding:8px',
          onclick: () => { self.save({ seedIndex: i }); closeSheet(); },
        }, [
          el('div', {
            style: `width:44px;height:44px;border-radius:50%;background:#${c};border:3px solid ${App.settings.seedIndex === i ? 'var(--m3-primary)' : 'transparent'};box-shadow:${App.settings.seedIndex === i ? '0 0 0 2px var(--m3-surface), 0 0 0 5px var(--m3-primary)' : 'none'}`,
          }),
          el('div', { class: 'small', text: name }),
        ]);
        grid.appendChild(tile);
      });
      body.appendChild(grid);
    }, { confirmText: null });
  },

  pickLanguage() {
    const self = this;
    showSheet(t('settings_language'), (body) => {
      [[1, 'English'], [2, t('option_simplified_chinese')]].forEach(([v, label]) => {
        body.appendChild(choiceRow(label, App.settings.language === v, () => { self.save({ language: v }); closeSheet(); }));
      });
    }, { confirmText: null });
  },

  pickRunMode() {
    const self = this;
    const running = App.status.running;
    showSheet(t('settings_run_mode'), (body) => {
      const rows = [
        { v: 'tun', icon: 'wifi_tethering', title: t('run_mode_tun'), sub: '接管全部流量 — 需要管理员权限' },
        { v: 'proxy', icon: 'public', title: t('run_mode_proxy'), sub: '仅代理 HTTP(S) 流量，无需管理员权限' },
      ];
      rows.forEach((r) => {
        body.appendChild(el('div', { class: 'sec-row', onclick: async () => {
          if (running) {
            showDialog({
              title: t('settings_run_mode'),
              message: '切换运行模式需要重启代理服务。',
              confirmText: t('confirm'),
              onConfirm: async () => {
                await self.save({ runMode: r.v });
                const a = api();
                try { await a.call('restartProxy'); } catch (e) { /* */ }
                closeSheet();
              },
            });
          } else {
            await self.save({ runMode: r.v });
            closeSheet();
          }
        } }, [
          el('div', { class: 'row-icon' }, [icon(r.icon)]),
          el('div', { class: 'row-main' }, [
            el('div', { class: 'row-title', text: r.title }),
            el('div', { class: 'row-sub', text: r.sub }),
          ]),
          App.settings.runMode === r.v ? el('span', { class: 'msr', style: 'color:var(--m3-primary)', text: 'check_circle' }) : null,
        ]));
      });
    }, { confirmText: null });
  },

  pickLogLevel() {
    const self = this;
    showSheet(t('settings_log_level'), (body) => {
      ['debug', 'info', 'warning', 'error'].forEach((v) => {
        body.appendChild(choiceRow(t('logs_level_' + v) || v, App.settings.coreLogLevel === v, async () => {
          await self.save({ coreLogLevel: v });
          closeSheet();
        }));
      });
    }, { confirmText: null });
  },
};

function choiceRow(label, selected, onClick, sub) {
  return el('div', { class: 'sec-row', onclick: onClick }, [
    el('div', { class: 'row-main' }, [
      el('div', { class: 'row-title', text: label }),
      sub ? el('div', { class: 'row-sub', text: sub }) : null,
    ]),
    selected ? el('span', { class: 'msr', style: 'color:var(--m3-primary)', text: 'check_circle' }) : null,
  ]);
}

let _sheetRef = null;
function closeSheet() { if (_sheetRef) { _sheetRef.close(); _sheetRef = null; } }
