import { NEXROUTE_LUCI_APP_VERSION, NEXROUTE_UCI_PACKAGE } from '../../constants';
import { injectGlobalStyles } from '../../helpers/injectGlobalStyles';
import { coreService } from '../services/core.service';
import { loadCoreFeatures } from '../services/coreFeatures.service';
import { ComponentsTab } from '../tabs/components';
import { DashboardTab } from '../tabs/dashboard';
import { DiagnosticTab } from '../tabs/diagnostic';
import { LogsTab } from '../tabs/logs';
import { MonitoringTab } from '../tabs/monitoring';
import { mountTabOption } from '../tabs/mountTab';
import {
  configureSectionSection,
  createSectionContent,
} from '../tabs/sections';
import {
  configureServerSection,
  createServerContent,
  prepareAddedServer,
} from '../tabs/servers';
import { createSettingsContent } from '../tabs/settings';
import { configureGridSection } from './gridSection';
import { createPageStatus } from './pageStatus';
import { pageTitle } from './pageTitle';

// A tab that renders itself: one anonymous section holding the node its controller binds to.
function addMountedTab(
  map: CBIMap,
  type: string,
  title: string,
  tab: { render: () => HTMLElement; initController: () => unknown },
) {
  const section = map.section(form.TypedSection, type, title);
  section.anonymous = true;
  section.addremove = false;
  section.cfgsections = function () {
    return [type];
  };
  mountTabOption(section, type, tab);
}

export const NexRouteView = {
  // The forms offer only what the installed core can run, so its features load first.
  load() {
    return loadCoreFeatures().catch((error) => {
      console.warn('[CORE_FEATURES]', error);
    });
  },

  async render() {
    injectGlobalStyles();

    const nexrouteMap = new form.Map(
      NEXROUTE_UCI_PACKAGE,
      pageTitle(NEXROUTE_LUCI_APP_VERSION, createPageStatus()),
    );
    nexrouteMap.tabbed = true;

    const rulesSection = nexrouteMap.section(
      form.GridSection,
      'section',
      _('Sections'),
      _('Routing rules are checked from top to bottom'),
    );
    configureGridSection(
      rulesSection,
      'section',
      _('Section'),
      _('Add a section'),
    );
    const renderRuleContents = rulesSection.renderContents;
    rulesSection.renderContents = function (...args: unknown[]) {
      const node = renderRuleContents.apply(this, args) as HTMLElement;
      const placeholder = node.querySelector?.('.placeholder em');
      if (placeholder) {
        placeholder.textContent = _('Add a section to configure routing');
      }
      return node;
    };
    configureSectionSection(rulesSection);
    createSectionContent(rulesSection);

    const serverSection = nexrouteMap.section(
      form.GridSection,
      'server',
      _('VPN server'),
      _('The router itself becomes a proxy server for your devices'),
    );
    configureGridSection(
      serverSection,
      'server',
      _('Server'),
      _('Add a server inbound'),
      prepareAddedServer,
    );
    configureServerSection(serverSection);
    createServerContent(serverSection);

    const settingsSection = nexrouteMap.section(
      form.TypedSection,
      'settings',
      _('Settings'),
    );
    settingsSection.anonymous = true;
    settingsSection.addremove = false;
    settingsSection.cfgsections = function () {
      return ['settings'];
    };
    createSettingsContent(settingsSection);

    addMountedTab(nexrouteMap, 'diagnostic', _('Status'), DiagnosticTab);
    addMountedTab(nexrouteMap, 'dashboard', _('Dashboard'), DashboardTab);
    addMountedTab(nexrouteMap, 'monitoring', _('Monitoring'), MonitoringTab);
    addMountedTab(nexrouteMap, 'logs', _('Logs'), LogsTab);
    addMountedTab(nexrouteMap, 'components', _('Components'), ComponentsTab);

    const rendered = await nexrouteMap.render();
    coreService();

    return rendered;
  },
};
