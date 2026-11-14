# Компоненты редактора (зона B)

`index.ts` экспортирует независимые части для композиции маршрутом с оболочкой C:

- `EditorTools`: `state: EditorToolState`, `onChange(state)` — центральная группа.
- `EditorToolPanel`: те же props и `onClear()` — подтверждение очистки принадлежит владельцу документа.
- `EditorTextFormat`: `textFormat: TextFormat`, `setTextFormat(format)` — формат текста.
- `EditorHistory`: `canUndo`, `canRedo`, `onUndo()`, `onRedo()`.
- `EditorPageRibbon`: manifest `notebook`, `tools`, `readOnly`, `fingerDrawing`, доступная `width`, `activePage`, `command`; callbacks `onActivePageChange(index)`, `onHistoryChange({canUndo,canRedo})`, `onObjectsChange(pageId,objects)`; необязательные `horizontal` и `textFormat`.

`command` имеет уникальный `id` и `action: undo | redo | clear | save` и передаётся только активной странице. Штрихи не передаются JS: нативный модуль атомарно пишет `.drawing` при паузе, завершении штриха, снятии канваса и уходе приложения в фон. Ошибка чтения блокирует перезапись повреждённого drawing.

Владелец manifest должен последовательно сохранять изменения объектов через `repository.saveNotebook`: репозиторий атомарно пишет `pages/<pageId>.json`. `EditorScreen` пока содержит самостоятельную проверочную композицию и вставку через системный photo picker; это не готовая оболочка C.

Нативный модуль принимает `pageWidth/pageHeight` в точках страницы, `packagePath`, `background`, `objects`, `textFormat`. Формат текста дополнительно допускает `underline/strikethrough` (необязательные поля, обратная совместимость существующих документов). `onObjectsChange` возвращает объекты, `onToolEnd` сообщает конец PencilKit-жеста. Снимки для виртуализованной ленты пишутся в `thumbnails/<pageId>-canvas.png`, отдельно от миниатюр оболочки C.

## Ограничения текущей реализации

Полная зона B ещё не принята. Нет настройки типа/маски лассо, автоматического возврата ластика и полного визуального соответствия плавающим панелям Goodnotes. Pinch, многополосная прокрутка, ошибки диска, реальные фото/PDF и узкое окно требуют отдельной нативной приёмки. Системный PencilKit не предоставляет произвольную маску выбора объектов: соответствующие неработающие переключатели не показаны.
