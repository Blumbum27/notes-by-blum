# notes by Blum

Личное приложение для рукописных заметок. Expo SDK 57, React Native, TypeScript. Минимальная версия iPadOS — 26. Данные остаются на устройстве.

## Разработка

Node 24. Установка: `npm install`. Проверки: `npm run typecheck`, `npm run lint`. Запуск на выбранном iPad-симуляторе: `npm run ios -- --device <UDID>`. Metro использует порт 8082.

Рабочее название и идентификаторы заданы в `app.config.ts`. Роуты находятся в `src/app`, функциональные модули — в `src/features`, общие контракты — в `src/shared`, локальные Expo-модули — в `modules`.

Android не исключён из проекта, но в первом этапе не проверяется. Физический iPad для разработки не используется.

## Контракты и зоны параллельной работы

- A: `src/features/library` и реализация `src/shared/documents/repository.ts`.
- B: `src/features/editor`, `modules/notes-canvas/ios/NotesCanvasModule.swift`: лента, холст, центральные инструменты и объекты.
- C: `src/features/editor-shell`, `src/features/settings`, новые Swift-файлы рендера/экспорта в модуле. Начальный тулбар пока внутри EditorScreen; C переносит левую/правую группы в оболочку, согласовав минимальное изменение композиции с B.
- Роуты `src/app` — тонкие экспорты. `EditorShell` принимает `toolbar` и `children`; оболочка не владеет состоянием штрихов.
- Общие типы: `src/shared/documents/types.ts`: `NotebookManifest`, `NotebookPage`, `PageBackground` (paper/pdf/image), `PageObject`. Координаты объектов — в точках страницы; пути assets — относительно пакета, номер PDF-страницы — с нуля. `paper` остаётся настройкой размера/ориентации и шаблоном для новых страниц даже при PDF-фоне. Поле `background` определяет видимый фон.
- API файлов: `src/shared/documents/repository.ts`: `listItems`, `readNotebook`, `saveNotebook`, `createItem`, `createPage`, `updateItem`, `duplicateItem`, `moveItem`, `deletePermanently`, `packageDirectory`, `drawingPath`. Все изменяющие операции асинхронны; дождаться Promise перед повторным чтением. `saveNotebook` возвращает обновлённый manifest. Индекс SQLite восстанавливается из manifest при открытии.
- Контракт холста: `modules/notes-canvas/index.ts`. Props задают инструмент/цвет/ширину/ластик/режим ввода; `command` содержит уникальный id и undo/redo/clear/save; `onDrawingChange` сообщает доступность истории, `onError` — ошибку диска. PKDrawing не пересекает JS-мост. `background`, `packagePath`, `objects` зарезервированы контрактом для B; в каркасе реализована только бумага через pattern/paperColor.
- Общий нативный шаблон бумаги: `modules/notes-canvas/ios/PaperPattern.swift`, `PaperView`. C использует тот же рендер, не копирует алгоритм.

Expo-модули собираются из исходников (`usePrecompiledModules: false`): готовые бинарники SDK 57 в данном окружении давали dyld Symbol missing в ExpoFont. iPad-only задаётся плагином `plugins/withIPadOnly.js` через TARGETED_DEVICE_FAMILY.

## Граница каркаса

Библиотека и редактор — начальные реализации, не законченный этап 1. Полноценный split-view, вкладки, импорт, фон PDF/изображения, текстовые объекты, экспорт, миниатюры обложек и полировка остаются задачами A/B/C. В текущем окружении отсутствует Simulator.app; simctl запускает приложение и делает снимки, но интерактивная проверка создания блокнота и штриха мышью заблокирована отсутствием GUI симулятора/средства ввода. Наличие Swift-кода сохранения не означает, что сценарий рисования проверен.
