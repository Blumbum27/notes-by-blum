# Актуальная сборка Inkbloom для iPad

Файл для передачи на Windows: **`builds/ipad/notes-by-blum.ipa`**.
Это Release для реального iPad (`iphoneos`, arm64), а не сборка симулятора.
JavaScript включён в приложение; Metro для запуска не нужен.

Артефакт собран **без Apple-подписи и provisioning profile**. Сам по себе он
не устанавливается через Safari или простым копированием на iPad. Его нужно
переподписать и установить через Sideloadly на Windows по
[инструкции](../../docs/guides/install-ipad-from-windows.md).
Бесплатный семидневный срок начинается с выпуска профиля при подписи,
а не с создания этого архива. Ключей, сертификатов и паролей в репозитории нет.

## Сведения об артефакте

- Исходники: `785c3d8bab4d93ba1ae58bbf5a1b714d3b16e24d`, ветка `app/alex/dev`.
  При сборке tracked-исходники приложения не изменялись. Передача того же `.ipa`
  в `app/yura/dev` не означает пересборку из независимых изменений этой ветки.
- Версия приложения: `0.1.0`, номер сборки `1`.
- Bundle ID до переподписи: `com.alexakalin.notesbyblum`.
- Минимальная система: iPadOS 26.0; только iPad.
- Инструменты: Xcode 27.1 (`27A9275`), Node 24.15.0.
- Размер `.ipa`: `14 027 397` байт (13.38 MiB).
- SHA-256: `9d408735fda8db133ca60caa216afd80b95cac7a4a76fc4402e931a98ca7612b`.
- Включены новый главный экран, инструменты и меню редактора, добавление страницы
  вытягиванием ленты, название/иконка Inkbloom, увеличенные зоны нажатия,
  постоянная ширина панели письма и контрастные цвета/метки толщины.
  Это не означает завершения всего этапа 1 или проверки всех функций.

## Проверки этой сборки

- **PASS:** `xcodebuild` Release для `generic/platform=iOS` завершился
  `BUILD SUCCEEDED`; основной исполняемый файл — Mach-O arm64, платформа iOS,
  не Simulator. `Info.plist` указывает iPad, iPadOS 26.0 и ожидаемые ID/версию.
- **PASS:** целостность ZIP, структура `Payload/Inkbloom.app`, встроенный
  `main.jsbundle` (3 974 173 байта), отсутствие `embedded.mobileprovision`
  и файлов ключей в архиве, размер ниже лимита обычного файла GitHub.
- **PASS:** `npm run typecheck` и `npm run lint` для исходников приложения.
- **NOT TESTED:** переподпись и установка через Sideloadly на целевом Windows,
  запуск на реальном iPad без Metro, работа функций, сохранность заметок после
  обновления и продление подписи. Целевой ноутбук/iPad в другом городе недоступны
  этому агенту. Для локального iPad собран отдельно подписанный Release из того
  же source SHA; он установлен поверх прежней версии и запущен на iPad Air 11 M3,
  iPadOS 26.7.2. Это не проверка переподписи именно этого `.ipa` через Sideloadly.
  Наличие встроенного JS не заменяет проверку запуска.
- **PASS (UI исходников):** независимая приёмка панели на iPad-симуляторе
  820×1180 / 1180×820: кнопки письма не сдвигаются, краевые нажатия срабатывают,
  цвета и метки толщины контрастны, поповеры открываются. На подписанном Release
  просмотрены библиотека и редактор в ландшафте на физическом iPad.
  Локальные evidence: `~/Pictures/OpenCode/notes-by-blum/panel-fix/acceptance/`
  и `~/Pictures/OpenCode/notes-by-blum/panel-fix/ipad/`.
- Motion/haptics: **NOT TESTED** — статические кадры не доказывают плавность
  и качество тактильного отклика. Полная приёмка функций не проводилась.

## Обновление файла

В папке держим **один** `.ipa` с постоянным именем `notes-by-blum.ipa`.
После успешной сборки и проверки архива заменяем прежний файл, обновляем
source SHA, версию, SHA-256 и статусы проверок в этом README, коммитим их вместе.
Не добавляем рядом копии с датами/номерами, `.xcarchive`, DerivedData, логи,
сертификаты, профили или ключи. Не удаляем рабочий артефакт до готовности замены.

Это убирает лишние файлы из текущего дерева, **но не из истории Git**:
старые бинарники продолжают занимать место в истории. Историю не переписываем.
GitHub не принимает обычный Git-файл больше 100 MiB; если будущий `.ipa`
достигнет этого размера, потребуется отдельно согласовать Git LFS или Releases,
а не делить файл на части и не маскировать ошибку push.

На Windows скачивайте **Download raw file**, а не HTML-страницу GitHub.
После скачивания сравните SHA-256 с указанным здесь, например в PowerShell:

```powershell
Get-FileHash .\builds\ipad\notes-by-blum.ipa -Algorithm SHA256
```

## Сборка на Mac

Нужны установленные зависимости `app/` и сгенерированный iOS-проект с Pods,
соответствующий исходникам и `app/app.config.ts`. `app/ios/` не коммитится.
Из корня репозитория, с Node 24 в PATH, укажите свободный каталог DerivedData:

```sh
NODE_ENV=production CI=1 xcodebuild \
  -workspace app/ios/Inkbloom.xcworkspace \
  -scheme Inkbloom -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath "$BUILD_DIR" -jobs 4 \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= build
```

`BUILD_DIR` — абсолютный путь к отдельному каталогу сборки вне Git. Не используйте
каталог другого работающего агента. Не подключайте физический iPad ради сборки.
Из результата `Build/Products/Release-iphoneos/Inkbloom.app` создайте ZIP
с единственным приложением в `Payload/Inkbloom.app` и расширением `.ipa`;
сохраните символьные ссылки фреймворков. Перед заменой проверьте архив,
платформу Mach-O (iOS, не Simulator), arm64, Info.plist и `main.jsbundle`.
Не называйте проверку структуры успешной установкой или запуском на iPad.

Пример упаковки на Mac после успешного `xcodebuild` (из корня репозитория):

```sh
STAGING=$(mktemp -d "${TMPDIR%/}/notes-by-blum-ipa.XXXXXX")
mkdir "$STAGING/Payload"
ditto --norsrc --noextattr \
  "$BUILD_DIR/Build/Products/Release-iphoneos/Inkbloom.app" \
  "$STAGING/Payload/Inkbloom.app"
ditto --norsrc --noextattr -c -k --keepParent \
  "$STAGING/Payload" "$STAGING/notes-by-blum.ipa"
unzip -t "$STAGING/notes-by-blum.ipa"
shasum -a 256 "$STAGING/notes-by-blum.ipa"
```

До проверки не копируйте результат поверх `builds/ipad/notes-by-blum.ipa`.
После неё перенесите готовый файл и обновите сведения выше. Временный каталог
можно удалить только после проверки его пути и содержимого.
