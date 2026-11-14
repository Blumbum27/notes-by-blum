Pod::Spec.new do |s|
  s.name = 'DocumentImport'
  s.version = '1.0.0'
  s.summary = 'Local PDF import metadata'
  s.description = 'Reads PDF page count without transferring document data to JavaScript.'
  s.license = 'MIT'
  s.author = 'notes by Blum'
  s.homepage = 'https://expo.dev'
  s.platforms = { :ios => '26.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'PDFKit'
end
