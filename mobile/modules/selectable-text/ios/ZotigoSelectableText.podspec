Pod::Spec.new do |s|
  s.name = 'ZotigoSelectableText'
  s.version = '1.0.0'
  s.summary = 'Native conversation text selection'
  s.description = 'Attributed text with native selection actions for Zotigo.'
  s.license = { :type => 'Apache-2.0' }
  s.author = 'Zotigo'
  s.homepage = 'https://github.com/jayyao97/zotigo-ui'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/jayyao97/zotigo-ui.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.swift_version = '5.9'
end
