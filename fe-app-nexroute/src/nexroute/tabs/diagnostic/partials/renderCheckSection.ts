import {
  renderCheckIcon24,
  renderChevronUpIcon24,
  renderCircleAlertIcon24,
  renderCircleCheckIcon24,
  renderCircleSlashIcon24,
  renderCircleXIcon24,
  renderLoaderCircleIcon24,
  renderTriangleAlertIcon24,
  renderXIcon24,
} from '../../../../icons';
import { IDiagnosticsChecksStoreItem } from '../../../services';
import { E } from '../../../../helpers/element';

type IRenderCheckSectionProps = IDiagnosticsChecksStoreItem;

interface IRenderCheckSectionOptions {
  expanded?: boolean;
  onToggle?: () => void;
}

const STATE_ICONS = {
  loading: renderLoaderCircleIcon24,
  warning: renderCircleAlertIcon24,
  error: renderCircleXIcon24,
  success: renderCircleCheckIcon24,
  skipped: renderCircleSlashIcon24,
} as const;

const ITEM_ICONS = {
  success: renderCheckIcon24,
  warning: renderTriangleAlertIcon24,
  error: renderXIcon24,
} as const;

function renderCheckSummary(items: IRenderCheckSectionProps['items']) {
  const renderedItems = items.map((item) => {
    const iconWrap = E('span', {
      class: 'fkp_diagnostic_alert__summary__item__icon',
    });
    const icon = ITEM_ICONS[item.state as keyof typeof ITEM_ICONS];
    if (icon) {
      iconWrap.appendChild(icon());
    }

    // Key and value share one cell, so a long key wraps the value onto the next line.
    return E(
      'div',
      {
        class: `fkp_diagnostic_alert__summary__item fkp_diagnostic_alert__summary__item--${item.state}`,
      },
      [
        iconWrap,
        E('div', { class: 'fkp_diagnostic_alert__summary__item__body' }, [
          E(
            'b',
            { class: 'fkp_diagnostic_alert__summary__item__key' },
            item.key,
          ),
          E(
            'div',
            { class: 'fkp_diagnostic_alert__summary__item__value' },
            item.value,
          ),
        ]),
      ],
    );
  });

  const rows = [];
  for (let i = 0; i < items.length; i++) {
    if (
      items[i].layout &&
      items[i + 1]?.layout === items[i].layout
    ) {
      rows.push(
        E('div', { class: 'fkp_diagnostic_alert__direct_exits' }, [
          renderedItems[i],
          renderedItems[i + 1],
        ]),
      );
      i++;
    } else {
      rows.push(renderedItems[i]);
    }
  }

  return E('div', { class: 'fkp_diagnostic_alert__summary' }, rows);
}

// A check that passed is one line until asked for its details.
export function renderCheckSection(
  props: IRenderCheckSectionProps,
  { expanded = true, onToggle }: IRenderCheckSectionOptions = {},
) {
  const iconWrap = E('span', { class: 'fkp_diagnostic_alert__icon' });
  iconWrap.appendChild(STATE_ICONS[props.state]());

  const foldable = Boolean(onToggle) && props.items.length > 0;
  const toggleLabel = expanded ? _('Hide details') : _('Show details');
  const toggle = foldable
    ? E(
        'button',
        {
          type: 'button',
          class: [
            'btn fkp_diagnostic_alert__toggle',
            expanded ? '' : 'fkp_diagnostic_alert__toggle--collapsed',
          ]
            .filter(Boolean)
            .join(' '),
          title: toggleLabel,
          'aria-label': toggleLabel,
          'aria-expanded': expanded ? 'true' : 'false',
          click: (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle?.();
          },
        },
        renderChevronUpIcon24(),
      )
    : undefined;

  const header = E(
    'div',
    foldable
      ? {
          class:
            'fkp_diagnostic_alert__header fkp_diagnostic_alert__header--foldable',
          click: () => {
            if (window.getSelection()?.isCollapsed !== false) {
              onToggle?.();
            }
          },
        }
      : { class: 'fkp_diagnostic_alert__header' },
    [
      iconWrap,
      E('div', { class: 'fkp_diagnostic_alert__content' }, [
        E('b', { class: 'fkp_diagnostic_alert__title' }, props.title),
        E(
          'div',
          { class: 'fkp_diagnostic_alert__description' },
          props.description,
        ),
      ]),
      ...(toggle ? [toggle] : []),
    ],
  );

  return E(
    'div',
    {
      class: `fkp_diagnostic_alert fkp_diagnostic_alert--${props.state}${
        props.code.toLowerCase() === 'traffic'
          ? ' fkp_diagnostic_alert--traffic'
          : ''
      }`,
    },
    [
      header,
      ...(props.items.length && (expanded || !foldable)
        ? [renderCheckSummary(props.items)]
        : []),
    ],
  );
}
