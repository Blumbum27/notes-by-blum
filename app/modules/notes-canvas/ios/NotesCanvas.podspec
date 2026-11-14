Pod::Spec.new do |s|
  s.name = 'NotesCanvas'
  s.version = '0.1.0'
  s.summary = 'Локальный холст рукописных заметок'
  s.description = 'PencilKit и шаблоны бумаги для Expo'
  s.author = 'Blum'
  s.homepage = 'https://expo.dev'
  s.license = 'MIT'
  s.platforms = { :ios => '26.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '6.0'
end
