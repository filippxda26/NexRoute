'use strict';
'require baseclass';
'require dom';
'require form';
'require fs';
'require network';
'require rpc';
'require tools.widgets as widgets';
'require uci';
'require ui';

import './helpers/structuredClonePolyfill';

// view/nexroute/nexroute.js hands this to view.extend().
export { NexRouteView } from './nexroute/entry';

// The tab builders, which the bundle checks use to build one tab at a time.
export {
  configureSectionSection,
  createSectionContent,
} from './nexroute/tabs/sections';
export {
  configureServerSection,
  createServerContent,
} from './nexroute/tabs/servers';
export { createSettingsContent } from './nexroute/tabs/settings';
// A check building one tab sets the core features the way NexRouteView reads them.
export { setCoreFeatures } from './nexroute/services/coreFeatures.service';
