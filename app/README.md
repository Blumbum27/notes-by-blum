# notes by Blum

Личное приложение для рукописных заметок. Expo SDK 57, React Native, TypeScript. Минимальная версия iPadOS — 26. Данные остаются на устройстве.

## Разработка

Node 24. Установка: `npm install`. Проверки: `npm run typecheck`, `npm run lint`. Запуск на выбранном iPad-симуляторе: `npm run ios -- --device <UDID>`. Metro использует порт 8082.

Рабочее название и идентификаторы заданы в `app.config.ts`. Роуты находятся в `src/app`, функциональные модули — в `src/features`, общие контракты — в `src/shared`, локальные Expo-модули — в `modules`.

Android не исключён из проекта, но в первом этапе не проверяется. Физический iPad для разработки не используется.

## Установка готовой сборки

[Инструкция для агента на Windows](../docs/guides/install-ipad-from-windows.md):
установка готового `.ipa` с Mac на iPad через Sideloadly с бесплатной подписью
на 7 дней, обновления без удаления заметок и диагностика ошибок.
Актуальный `.ipa`: `builds/ipad/notes-by-blum.ipa` от корня репозитория;
[сведения о сборке и замене файла](../builds/ipad/README.md).
Это отдельный пользовательский сценарий установки, не изменение правил
использования физического iPad в контуре разработки.

## Контракты и зоны параллельной работы

- A: `src/features/library` и реализация `src/shared/documents/repository.ts`.
- B: `src/features/editor`, `modules/notes-canvas/ios/NotesCanvasModule.swift`: лента, холст, центральные инструменты и объекты.
- C: `src/features/editor-shell`, `src/features/settings`, новые Swift-файлы рендера/экспорта в модуле. Начальный тулбар пока внутри EditorScreen; C переносит левую/правую группы в оболочку, согласовав минимальное изменение композиции с B.
- Роуты `src/app` — тонкие экспорты. `EditorShell` принимает `toolbar` и `children`; оболочка не владеет состоянием штрихов.
- Общие типы: `src/shared/documents/types.ts`: `NotebookManifest`, `NotebookPage`, `PageBackground` (paper/pdf/image), `PageObject`. Координаты объектов — в точках страницы; пути assets — относительно пакета, номер PDF-страницы — с нуля. `paper` остаётся настройкой размера/ориентации и шаблоном для новых страниц даже при PDF-фоне. Поле `background` определяет видимый фон.
- API файлов: `src/shared/documents/repository.ts`: `listItems`, `readNotebook`, `saveNotebook`, `createItem`, `createPage`, `updateItem`, `duplicateItem`, `moveItem`, `deletePermanently`, `packageDirectory`, `drawingPath`. Все изменяющие операции асинхронны; дождаться Promise перед повторным чтением. `saveNotebook` возвращает обновлённый manifest. Индекс SQLite восстанавливается из manifest при открытии.
- Контракт холста: `modules/notes-canvas/index.ts`. Props задают инструмент/цвет/толщину пера (`strokeWidth`)/ластик/режим ввода; имя `width` не используется для пера, поскольку конфликтует с геометрией Expo View. `command` содержит уникальный id и undo/redo/clear/save; `onDrawingChange` сообщает доступность истории, `onError` — ошибку диска. PKDrawing не пересекает JS-мост. `background`, `packagePath`, `objects` зарезервированы контрактом для B; в каркасе реализована только бумага через pattern/paperColor.
- Общий нативный шаблон бумаги: `modules/notes-canvas/ios/PaperPattern.swift`, `PaperView`. C использует тот же рендер, не копирует алгоритм.

Expo-модули собираются из исходников (`usePrecompiledModules: false`): готовые бинарники SDK 57 в данном окружении давали dyld Symbol missing в ExpoFont. iPad-only задаётся плагином `plugins/withIPadOnly.js` через TARGETED_DEVICE_FAMILY.

## Библиотека: дополнения A

`importDocument({ uri, name, kind, pageCount? }, parentId)` копирует файл в `assets/source.*` перед публикацией manifest. Для PDF `pageCount` обязателен; `modules/document-import` читает его через PDFKit. Страницы используют существующий `PageBackground`, без изменения формата. Системный picker отменяется без создания документа. Фото выбираются через Expo ImagePicker, файлы — Expo DocumentPicker.

`isInTrash(item, items)` учитывает удалённых родителей. Удаление папки скрывает её потомков, восстановление папки возвращает их; отдельно восстановленный документ из удалённого родителя переносится в корень. Окончательное удаление допускается только для корзины и удаляет вложенные пакеты. При открытии индекс полностью перестраивается транзакцией, поэтому отсутствующие пакеты не оставляют старые строки. JSON заменяется через уникальный временный файл.

Обложка библиотеки читается из `thumbnails/cover.png`, при отсутствии используется цвет manifest. Создание этой обложки принадлежит C. Рендер импортированных фонов принадлежит B.

## Граница каркаса

Библиотека и редактор — начальные реализации, не законченный этап 1. Полноценный split-view, вкладки, импорт, фон PDF/изображения, текстовые объекты, экспорт, миниатюры обложек и полировка остаются задачами A/B/C. Для интерактивных проверок без Simulator.app используется пользовательский WebDriverAgent: `sim-wda.sh <UDID> 8102`, затем `WDA_PORT=8102 wda.py`. Порт 8100 принадлежит физическому iPad и не используется. Снимки сохраняются в `~/Pictures/OpenCode/notes-by-blum/`; команда `snap` запрещена, поскольку пишет в каталог референсов.
