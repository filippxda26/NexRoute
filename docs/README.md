# Документация NexRoute

Исходники сайта [filippxda26.github.io/NexRoute](https://filippxda26.github.io/NexRoute/): страницы в Markdown, собираются [VitePress](https://vitepress.dev/).

| Папка | Что в ней |
| --- | --- |
| `guide/` | установка и быстрый старт |
| `sections/`, `connections/`, `tunnels/`, `dns/`, `servers/` | руководство по вкладкам и возможностям |
| `settings.md` | все параметры вкладки «Настройки» |
| `troubleshooting/` | ошибки диагностики с причинами и решениями |
| `.vitepress/` | настройки сайта, меню и тема |

## Посмотреть локально

Нужен Node.js 20 или новее.

```sh
cd docs
corepack yarn install
corepack yarn dev       # сайт на http://127.0.0.1:5173/NexRoute/
corepack yarn build     # готовый сайт в .vitepress/dist
```

Сайт публикуется на GitHub Pages workflow `.github/workflows/docs.yml` при каждом изменении `docs/` в `main`.

## Как писать

- Кнопки и поля называйте так, как на странице NexRoute, и выделяйте жирным: **Секции → Добавить**. Проверить подписи можно по русскому каталогу `luci-app-nexroute/po/ru/nexroute.po`.
- Ссылки между страницами пишите от корня сайта без расширения: `[Секции](/sections/)`.
- Примеры подсетей в условиях берите из перехватываемых диапазонов: локальные и документационные сети вроде `192.168.0.0/16` и `203.0.113.0/24` NexRoute не перехватывает.
- Без длинных тире и вводных слов: короткие предложения, факты, подписи как на странице.
