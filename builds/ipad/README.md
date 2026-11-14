# Актуальная сборка для iPad

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

- Исходники: `4aeb83ec4326b1285c802000eda88b0d3e48afbe`, ветка `app/alex/dev`.
  При сборке tracked-исходники приложения не изменялись. Передача того же `.ipa`
  в `app/yura/dev` не означает пересборку из независимых изменений этой ветки.
- Версия приложения: `0.1.0`, номер сборки `1`.
- Bundle ID до переподписи: `com.alexakalin.notesbyblum`.
- Минимальная система: iPadOS 26.0; только iPad.
- Инструменты: Xcode 27.1 (`27A9275`), Node 24.15.0.
- Размер `.ipa`: `12 105 294` байта (11.54 MiB).
- SHA-256: `5d30ab7dc75dae4a47c845f3160d3feec85715db91e56b0e3bc86713d0871a9b`.
- Это текущий каркас приложения, не завершённый этап 1. Незавершённые изменения
  из параллельных веток `stage1/*` в эту сборку не включены.

## Проверки этой сборки

- **PASS:** `xcodebuild` Release для `generic/platform=iOS` завершился
  `BUILD SUCCEEDED`; основной исполняемый файл — Mach-O arm64, платформа iOS,
  не Simulator. `Info.plist` указывает iPad, iPadOS 26.0 и ожидаемые ID/версию.
- **PASS:** целостность ZIP, структура `Payload/notesbyBlum.app`, встроенный
  `main.jsbundle` (2 808 464 байта), отсутствие `embedded.mobileprovision`
  и файлов ключей в архиве, размер ниже лимита обычного файла GitHub.
- **PASS:** `npm run typecheck` и `npm run lint` для исходников приложения.
- **NOT TESTED:** переподпись и установка через Sideloadly на целевом Windows,
  запуск на реальном iPad без Metro, работа функций, сохранность заметок после
  обновления и продление подписи. Целевой ноутбук/iPad в другом городе недоступны
  этому агенту; физический iPad в локальном контуре по правилам не используется.
  Наличие встроенного JS не заменяет проверку запуска.
- Visual/motion: не проверялись; UI-код не менялся, скриншоты и запись работы
  именно этого артефакта на реальном устройстве не получены.

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
  -workspace app/ios/notesbyBlum.xcworkspace \
  -scheme notesbyBlum -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath "$BUILD_DIR" -jobs 4 \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= build
```

`BUILD_DIR` — абсолютный путь к отдельному каталогу сборки вне Git. Не используйте
каталог другого работающего агента. Не подключайте физический iPad ради сборки.
Из результата `Build/Products/Release-iphoneos/notesbyBlum.app` создайте ZIP
с единственным приложением в `Payload/notesbyBlum.app` и расширением `.ipa`;
сохраните символьные ссылки фреймворков. Перед заменой проверьте архив,
платформу Mach-O (iOS, не Simulator), arm64, Info.plist и `main.jsbundle`.
Не называйте проверку структуры успешной установкой или запуском на iPad.

Пример упаковки на Mac после успешного `xcodebuild` (из корня репозитория):

```sh
STAGING=$(mktemp -d "${TMPDIR%/}/notes-by-blum-ipa.XXXXXX")
mkdir "$STAGING/Payload"
ditto --norsrc --noextattr \
  "$BUILD_DIR/Build/Products/Release-iphoneos/notesbyBlum.app" \
  "$STAGING/Payload/notesbyBlum.app"
ditto --norsrc --noextattr -c -k --keepParent \
  "$STAGING/Payload" "$STAGING/notes-by-blum.ipa"
unzip -t "$STAGING/notes-by-blum.ipa"
shasum -a 256 "$STAGING/notes-by-blum.ipa"
```

До проверки не копируйте результат поверх `builds/ipad/notes-by-blum.ipa`.
После неё перенесите готовый файл и обновите сведения выше. Временный каталог
можно удалить только после проверки его пути и содержимого.
