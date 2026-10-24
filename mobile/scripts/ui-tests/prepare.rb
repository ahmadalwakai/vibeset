require 'fileutils'
require 'xcodeproj'

# Run only in the unsigned simulator workflow, after Pods have generated the project.
# No registered Apple identifiers, signing assets, app sources or Pod settings change.
project_path = File.expand_path('ios/Vibeset.xcodeproj')
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == 'Vibeset' && target.product_type == 'com.apple.product-type.application' }
abort 'Expected the generated Vibeset application target' unless app

name = 'VibesetSetupUITests'
target = project.targets.find { |candidate| candidate.name == name }
unless target
  target = project.new_target(:ui_test_bundle, name, :ios, '16.4', nil, :swift)
  target.add_dependency(app)
end
abort 'Unexpected existing UI test target type' unless target.product_type == 'com.apple.product-type.bundle.ui-testing'

folder = File.expand_path("ios/#{name}")
FileUtils.mkdir_p(folder)
FileUtils.cp(File.join(__dir__, 'VibesetSetupUITests.swift'), File.join(folder, 'VibesetSetupUITests.swift'))
group = project.main_group.find_subpath(name, true)
group.path = name
source = group.files.find { |file| file.path == 'VibesetSetupUITests.swift' } || group.new_file('VibesetSetupUITests.swift')
target.add_file_references([source]) unless target.source_build_phase.files_references.include?(source)
target.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.ahmadalwakai.vibeset.uitests',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'SWIFT_VERSION' => '5.0',
    'IPHONEOS_DEPLOYMENT_TARGET' => '16.4',
    'TARGETED_DEVICE_FAMILY' => '1',
    'TEST_TARGET_NAME' => app.name,
    'ENABLE_TESTING_SEARCH_PATHS' => 'YES',
    'FRAMEWORK_SEARCH_PATHS' => ['$(inherited)', '$(PLATFORM_DIR)/Developer/Library/Frameworks'],
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks'],
    'CODE_SIGNING_ALLOWED' => 'NO',
    'CODE_SIGNING_REQUIRED' => 'NO',
    'CODE_SIGN_IDENTITY' => '',
  })
end
attributes = project.root_object.attributes['TargetAttributes'] ||= {}
attributes[target.uuid] = { 'TestTargetID' => app.uuid }
project.save

scheme_path = File.join(project_path, 'xcshareddata/xcschemes/Vibeset.xcscheme')
abort 'Expected the generated shared Vibeset scheme' unless File.file?(scheme_path)
scheme = Xcodeproj::XCScheme.new(scheme_path)
existing = scheme.doc.get_elements('Scheme/TestAction/Testables/TestableReference/BuildableReference').any? do |reference|
  reference.attributes['BlueprintIdentifier'] == target.uuid
end
unless existing
  scheme.add_build_target(target, false)
  scheme.add_test_target(target)
end
scheme.test_action.build_configuration = 'Release'
scheme.test_action.code_coverage_enabled = false
scheme.save!
puts 'Prepared simulator-only XCTest UI target; production app and signing settings unchanged.'
