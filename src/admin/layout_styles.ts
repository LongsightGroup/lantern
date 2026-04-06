import { ADMIN_LAYOUT_STYLE_COMPONENTS } from './layout_style_components.ts';
import { ADMIN_LAYOUT_STYLE_DETAIL } from './layout_style_detail.ts';
import { ADMIN_LAYOUT_STYLE_RESPONSIVE } from './layout_style_responsive.ts';
import { ADMIN_LAYOUT_STYLE_SIDEBAR } from './layout_style_sidebar.ts';
import { ADMIN_LAYOUT_STYLE_TOKENS } from './layout_style_tokens.ts';

export const ADMIN_LAYOUT_STYLES = [
  ADMIN_LAYOUT_STYLE_TOKENS,
  ADMIN_LAYOUT_STYLE_SIDEBAR,
  ADMIN_LAYOUT_STYLE_COMPONENTS,
  ADMIN_LAYOUT_STYLE_DETAIL,
  ADMIN_LAYOUT_STYLE_RESPONSIVE,
].join('\n');
