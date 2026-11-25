# NexRoute

NexRoute — самостоятельный форк [Forkop](https://github.com/ushan0v/forkop), созданного ushan0v и участниками проекта. Исходная лицензия GPL-2.0-or-later сохранена. Ядро [sing-box-forkop](https://github.com/ushan0v/sing-box-forkop) и списки [forkop-lists](https://github.com/ushan0v/forkop-lists) остаются внешними зависимостями.

Маршрутизация трафика OpenWrt по правилам.

[![Релиз форка](https://img.shields.io/github/v/release/filippxda26/NexRoute?label=%D1%80%D0%B5%D0%BB%D0%B8%D0%B7&color=0d9488)](https://github.com/filippxda26/NexRoute/releases/latest)
[![Документация](https://img.shields.io/badge/%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0%D1%86%D0%B8%D1%8F-filippxda26.github.io-0d9488)](https://filippxda26.github.io/NexRoute/)
[![Чат в Telegram](https://img.shields.io/badge/Telegram-%D1%87%D0%B0%D1%82-2CA5E0?logo=telegram&logoColor=white)](https://t.me/forkop_chat)

[Установка](docs/guide/install.md) · [Быстрый старт](docs/guide/quick-start.md) · [Руководство](docs/sections/index.md)

## Требования

- OpenWrt 24.10 или новее;
- от 128 МБ оперативной памяти, лучше 256 МБ;
- от 18 до 38 МБ свободной флеш-памяти, в зависимости от [сборки ядра](https://filippxda26.github.io/NexRoute/guide/install#сборки-ядра).

## Установка

Подключитесь к роутеру по SSH и выполните:

```sh
sh <(wget -O - https://raw.githubusercontent.com/filippxda26/NexRoute/main/install.sh)
```

Команда устанавливает или обновляет [этот форк NexRoute](https://github.com/filippxda26/NexRoute) и использует оригинальное ядро [sing-box-forkop](https://github.com/ushan0v/sing-box-forkop). Для установки нужен опубликованный релиз с пакетами; один лишь исходный код из ветки `main` недостаточен.

В форке добавлен отключённый по умолчанию переключатель DNS-записей HTTPS (тип 65) для поддержки ECH. Для работы ECH также необходима поддержка на клиенте и сервере.

## Переход с Forkop

Для обновления с Forkop используй установщик NexRoute, а не прямую установку APK/IPK поверх старых пакетов. Он проверяет совместимость конфигурации, сохраняет её и состояние в отдельной резервной папке, удаляет старые пакеты в штатной транзакции и восстанавливает настройки в NexRoute. Подробнее: [миграция](docs/guide/migration-forkop.md).

## Возможности

- **Секции** для точечной маршрутизации трафика по правилам и спискам.
- **Подключения** по ссылкам VLESS, Trojan, Shadowsocks, Hysteria2 и другим.
- **Подписки** с поддержкой всех основных форматов.
- **Туннели** WireGuard, AmneziaWG, Cloudflare WARP, OpenVPN и Tailscale.
- **URLTest и Fallback** сами выбирают рабочий сервер.
- **DNS** с шифрованием и DNS Fallback.
- **VPN-сервер** на самом роутере.
- **Дашборд и мониторинг** соединений.

## Документация

Документация на русском находится в каталоге [docs](docs/). Сайт GitHub Pages публикуется отдельным workflow.

## Помощь

Ошибки NexRoute: [Issues](https://github.com/filippxda26/NexRoute/issues). Чат ниже относится к исходному Forkop.

Вопросы и помощь в [чате в Telegram](https://t.me/forkop_chat). Об ошибках и предложениях пишите в [Issues](https://github.com/filippxda26/NexRoute/issues).

## Поддержать оригинальный Forkop

* 💳 **Карты РФ / СБП / Tinkoff Pay:** [Донат на CloudTips](https://pay.cloudtips.ru/p/385e5af2)
* 💎 **USDT (сеть TON):** `UQAOCDav39WJ2gvnzs9RQ_IsF2dcGrcpw4U0j6XGO7je7uwm`
* 🟢 **USDT (сеть TRC-20):** `TEMaZFyM8RQpkbd5LvB8CFJwxCyhHauKAe`
* 🪙 **USDT (сети ERC-20 / BEP-20 / Polygon / Monad):** `0xe8aabb21c320240fe45b6087e68c6fe40a92d8bf`
* 🟠 **USDT (сеть Solana):** `AhhUjTci9zDKQjUfgLacFR4LiHX9nmZud6DZ8YdbpjEB`

## Лицензия

NexRoute распространяется по лицензии [GPL-2.0-or-later](LICENSE).
