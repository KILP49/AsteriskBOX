'use strict';
/* Home page — mirrors the Android SingBoxDashboardPage layout */
const Pages = {};

Pages.home = {
  modeLabels: ['Rule', 'Global', 'Direct'],
  render(container) {
    container.innerHTML = '';
    const home = this;
    container.appendChild(el('div', { class: 'page' }, [
      this.controllerCard(),
      this.networkActivityCard(),
      el('div', { class: 'row-2' }, [
        this.monitorCard('resource', t('home_monitor_resource'), () => home.resourceSummary(), 'memory', true, () => pushRoute('monitor_resource')),
        this.monitorCard('connections', t('home_monitor_connections'), () => home.connectionsSummary(), 'lan', false, () => pushRoute('monitor_connections')),
      ]),
      el('div', { class: 'row-2' }, [
        this.monitorCard('traffic', t('home_monitor_traffic'), () => t('home_traffic_summary', fmtBytes(App.daily.today.down + App.daily.today.up)), 'data_usage', false, () => pushRoute('monitor_traffic')),
        this.monitorCard('network', t('home_monitor_network'), () => home.networkSummary(), 'public', true, () => pushRoute('monitor_network')),
      ]),
    ]));
    this.redrawCharts();
  },

  controllerCard() {
    const running = App.status.running;
    const modeIdx = App.runtime.modeList.indexOf(App.runtime.mode);
    const seg = el('div', { class: 'seg', style: 'margin-top:16px' });
    const modeOptions = App.runtime.modeList.length ? App.runtime.modeList : ['Rule', 'Global', 'Direct'];
    modeOptions.forEach((m, i) => {
      const label = m === 'Rule' ? t('sing_box_mode_rule') : m === 'Global' ? t('sing_box_mode_global') : t('sing_box_mode_direct');
      seg.appendChild(el('button', {
        class: `seg-item ${App.runtime.mode === m ? 'selected' : ''}`,
        text: label,
        onclick: () => changeMode(m, seg),
      }));
    });

    const hero = el('div', { class: 'hero' }, [
      el('div', { class: 'hero-top' }, [
        el('div', {
          class: 'hero-icon',
          style: `background:${running ? 'var(--m3-primary-container)' : 'var(--m3-surface-container-highest)'};color:${running ? 'var(--m3-on-primary-container)' : 'var(--m3-on-surface-variant)'}`,
        }, [icon('power_settings_new')]),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { class: 'hero-title', text: running ? t('home_service_enabled') : t('home_service_disabled') }),
          el('div', { class: 'hero-summary', text: App.settings.runMode === 'tun' ? t('run_mode_tun') : t('run_mode_proxy') }),
        ]),
        makeSwitch(running, (v) => setProxyRunning(v)),
      ]),
      el('div', { class: 'hero-metrics' }, [
        this.metric('upload', t('home_accumulated_upload'), fmtBytes(App.traffic.totalUp)),
        this.metric('download', t('home_accumulated_download'), fmtBytes(App.traffic.totalDown)),
      ]),
      seg,
    ]);
    return hero;
  },

  metric(iconName, label, value) {
    return el('div', { class: 'hero-metric' }, [
      el('div', { class: 'ic' }, [icon(iconName)]),
      el('div', { style: 'min-width:0' }, [
        el('div', { class: 'lbl', text: label }),
        el('div', { class: 'val', text: value }),
      ]),
    ]);
  },

  networkActivityCard() {
    const card = el('div', { class: 'card', style: 'height:180px;display:flex;flex-direction:column' });
    const head = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px' }, [
      el('div', { class: 'card-title', text: t('home_network_activity') }),
      el('div', { class: 'muted small', text: `${t('monitor_speed_per_second', fmtBytes(App.traffic.up))} / ${t('monitor_speed_per_second', fmtBytes(App.traffic.down))}` }),
    ]);
    const canvasWrap = el('div', { style: 'flex:1;position:relative' });
    const canvas = el('canvas', { class: 'chart' });
    canvasWrap.appendChild(canvas);
    if (!App.status.running || App.traffic.samples.length < 2) {
      canvasWrap.appendChild(el('div', {
        style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--m3-on-surface-variant);font-size:13px',
        text: t('home_no_network_activity'),
      }));
    }
    card.appendChild(head);
    card.appendChild(canvasWrap);
    this._netCanvas = canvas;
    return card;
  },

  monitorCard(key, title, summaryFn, iconName, prominent, onClick) {
    const card = el('div', { class: 'card clickable', style: 'height:148px;display:flex;flex-direction:column;justify-content:space-between', onclick: onClick }, [
      el('div', { class: 'mc-icon' }, [icon(iconName)]),
      el('div', {}, [
        el('div', { class: 'card-title', text: title }),
        el('div', { class: 'muted small', style: 'margin-top:4px;line-height:1.4', text: summaryFn() }),
      ]),
    ]);
    return card;
  },

  resourceSummary() {
    if (!App.status.running) return t('home_value_unavailable');
    const cpu = App.processStats.cpuPercent !== null ? App.processStats.cpuPercent.toFixed(1) + '%' : t('home_value_unavailable');
    const mem = App.processStats.memoryBytes !== null ? fmtBytes(App.processStats.memoryBytes) : t('home_value_unavailable');
    return t('home_resource_summary', cpu, mem);
  },
  connectionsSummary() {
    if (!App.status.running) return t('home_value_unavailable');
    return t('home_connections_summary', App.connections.length);
  },
  networkSummary() {
    const ipv4 = App.network.ipv4[0] || t('home_value_unavailable');
    const ipv6 = App.network.ipv6[0] || t('home_value_unavailable');
    return t('home_network_summary', ipv4, ipv6);
  },

  redrawCharts() {
    if (this._netCanvas && App.traffic.samples.length > 1) {
      drawLineChart(this._netCanvas, [
        { color: cssColor('--m3-tertiary'), values: App.traffic.samples.map((s) => s.up) },
        { color: cssColor('--m3-primary'), values: App.traffic.samples.map((s) => s.down) },
      ]);
    }
  },
  onTraffic() {
    // update hero metrics + chart in place
    const hero = document.querySelector('.hero');
    if (hero) {
      const vals = hero.querySelectorAll('.hero-metric .val');
      if (vals[0]) vals[0].textContent = fmtBytes(App.traffic.totalUp);
      if (vals[1]) vals[1].textContent = fmtBytes(App.traffic.totalDown);
      const head = document.querySelector('.card .muted.small');
      if (head) head.textContent = `${t('monitor_speed_per_second', fmtBytes(App.traffic.up))} / ${t('monitor_speed_per_second', fmtBytes(App.traffic.down))}`;
    }
    this.redrawCharts();
  },
  renderLite() {
    // periodic: update monitoring card summaries
    const cards = document.querySelectorAll('.page .card .card-title');
    // skip - summaries update on re-render
    this.redrawCharts();
  },
};

async function changeMode(mode, segEl) {
  const a = api();
  if (mode === App.runtime.mode) return;
  try {
    await a.call('setMode', mode);
    App.runtime.mode = mode;
    segEl.querySelectorAll('.seg-item').forEach((b, i) => b.classList.toggle('selected', b.textContent === (mode === 'Rule' ? t('sing_box_mode_rule') : mode === 'Global' ? t('sing_box_mode_global') : t('sing_box_mode_direct'))));
    toast(t('sing_box_mode_' + mode.toLowerCase()));
  } catch (e) {
    toast(t('home_mode_change_failed') || '切换模式失败', true);
  }
}
