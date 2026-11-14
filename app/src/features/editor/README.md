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

Полная зона B ещё не принята. Нет настройки типа/маски лассо и полного визуального соответствия плавающим панелям Goodnotes. Для ластика добавлен `eraserAutoReturn`; владелец документа возвращает предыдущий инструмент по `EditorPageRibbon.onToolEnd`. Pinch, ошибки записи диска, реальные фото/PDF и узкое окно требуют отдельной нативной приёмки. Системный PencilKit не предоставляет произвольную маску выбора объектов: соответствующие неработающие переключатели не показаны.

На назначенном симуляторе проверена прокрутка синтетического документа из шести страниц: grid, blank, ruled, dots (включая жёлтую бумагу), PNG и PDF. PNG отображается с сохранением пропорций, PDF — с белыми полями и синтетическим оранжевым прямоугольником. Просмотренные снимки: `~/Pictures/OpenCode/notes-by-blum/editor/image-background-final.png`, `assets-check.png`, `glass-panel.png`. После создания повреждённого drawing показано сообщение «Не удалось открыть страницу. Закройте документ и попробуйте снова», SHA-256 файла остался прежним. Это проверка ошибки чтения, не ошибки записи диска. `wda.py` не содержит команды pinch. Пересборка после изменения packagePath завершилась с exit=0. В публичном заголовке установленного SDK `PencilKit.framework/Headers/PKLassoTool.h` объявлен только `init`, без типа выделения и маски захвата.
